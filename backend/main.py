import os
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional
from dotenv import load_dotenv

from backend.detection import analyze_video
from backend.schemas import AnalyzeResponse, ChatRequest, ChatResponse, EmergencyImpactResponse, AccessibilityImpactResponse, ClimateImpactResponse
from backend.chat import chat_reply
from backend.firebase_admin import write_analysis_doc, update_progress_doc
from backend.impact import emergency_impact, accessibility_impact, climate_impact
from backend.sheets_logger import log_decision_to_sheet, build_log_payload
import threading
import uuid

app = FastAPI(title="Smart Parking & Traffic Intelligence API")

# Allow local dev from Vite/React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUTS_DIR = os.path.join(BASE_DIR, "outputs")
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Load environment variables from backend/.env if present
try:
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except Exception:
    pass

# Serve annotated outputs as static files
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

@app.get("/")
def root():
    return {"status": "ok", "message": "Smart Parking & Traffic Intelligence API"}

@app.post("/upload")
def upload_video(file: UploadFile = File(...)):
    # Save uploaded MP4 safely with streaming copy
    try:
        filename = os.path.basename(file.filename or "")
        allowed_exts = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
        _, ext = os.path.splitext(filename.lower())
        if ext not in allowed_exts:
            return JSONResponse(status_code=400, content={"error": f"Unsupported format '{ext}'. Allowed: {', '.join(sorted(allowed_exts))}."})

        # Avoid collisions: if file exists, add a numeric suffix
        base, ext = os.path.splitext(filename)
        dst_path = os.path.join(UPLOADS_DIR, filename)
        idx = 1
        while os.path.exists(dst_path):
            dst_path = os.path.join(UPLOADS_DIR, f"{base}_{idx}{ext}")
            idx += 1

        # Ensure pointer at start and stream to disk
        try:
            file.file.seek(0)
        except Exception:
            pass

        import shutil
        with open(dst_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Basic size check to catch empty uploads
        if os.path.getsize(dst_path) == 0:
            try:
                os.remove(dst_path)
            except Exception:
                pass
            return JSONResponse(status_code=400, content={"error": "Uploaded file is empty."})

        return {"video_path": dst_path}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(
    video_path: str = Form(...),
    save_overlay: bool = Form(True),
    conf_threshold: float = Form(0.4),
    smoothing_window: int = Form(5),
    user_uid: Optional[str] = Form(None),
):
    try:
        payload = analyze_video(
            video_path=video_path,
            models_dir=MODELS_DIR,
            outputs_dir=OUTPUTS_DIR,
            save_overlay=save_overlay,
            conf_threshold=conf_threshold,
            smoothing_window=smoothing_window,
        )
        # Convert artifact paths to served URLs (preserve subfolders under OUTPUTS_DIR)
        pvp: Optional[str] = payload.get("processed_video_path")
        pvp_url = _to_outputs_url(pvp)
        if pvp_url:
            payload["processed_video_path"] = pvp_url

        hmp: Optional[str] = payload.get("heatmap_path")
        hmp_url = _to_outputs_url(hmp)
        if hmp_url:
            payload["heatmap_url"] = hmp_url
        # Write analysis doc to Firestore if configured
        try:
            write_analysis_doc(user_uid, payload, video_path)
        except Exception:
            pass
        # Log to Google Sheets (audit) only when impacts are computed
        try:
            # Compute impacts to satisfy full audit payload
            e = emergency_impact(payload)
            a = accessibility_impact(payload)
            c = climate_impact(payload)
            summary = payload.get("summary") or {}
            avg_vehicles = float(summary.get("avg_count") or 0.0)
            congestion = str(payload.get("overall_congestion") or "Low")
            recommendation = str(payload.get("recommendation_text") or ("Avoid parking" if congestion == "High" else "Okay to park"))
            confidence = str(e.get("confidence") or "Low")
            risk_score = float(e.get("emergency_risk_score") or 0.0)
            emergency_safe = (str(e.get("classification") or "") == "Safe")
            emergency_probability = float(e.get("probability") or 0.0)
            accessibility_score = float(a.get("accessibility_score") or 0.0)
            climate_score = float(c.get("emission_score") or 0.0)
            video_id = os.path.basename(video_path or (payload.get("processed_video_path") or ""))
            sheet_payload = build_log_payload(
                run_id=str(uuid.uuid4()),
                video_id=video_id,
                avg_vehicles=avg_vehicles,
                congestion=congestion,
                risk_score=risk_score,
                emergency_safe=emergency_safe,
                emergency_probability=emergency_probability,
                accessibility_score=accessibility_score,
                climate_score=climate_score,
                recommendation=recommendation,
                confidence=confidence,
            )
            # This Google Sheets log acts as a lightweight AI audit trail
            # for transparency, explainability, and public trust.
            log_decision_to_sheet(sheet_payload)
        except Exception:
            # Never fail the API due to Sheets issues
            pass
        return payload
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# In-memory progress registry for async analysis
PROGRESS: dict[str, dict] = {}


def _to_outputs_url(path: Optional[str]) -> Optional[str]:
    """Convert an absolute path under OUTPUTS_DIR to a /outputs/... URL.

    Keeps subfolders (e.g., heatmaps/, snapshots/...). Returns None if path is not usable.
    """
    if not path:
        return None
    try:
        if not os.path.exists(path):
            return None
        rel = os.path.relpath(path, OUTPUTS_DIR)
        rel = rel.replace('\\', '/')
        if rel.startswith('..'):
            # Not under OUTPUTS_DIR
            return None
        return f"/outputs/{rel}"
    except Exception:
        return None


def _progress_for_firestore(task_id: str, uid: Optional[str] = None) -> dict:
    """Minimal progress payload for Firestore (avoid storing large result blobs)."""
    rec = PROGRESS.get(task_id) or {}
    return {
        "status": rec.get("status"),
        "processed": rec.get("processed"),
        "total": rec.get("total"),
        "percentage": rec.get("percentage"),
        "error": rec.get("error"),
        "uid": uid,
    }

@app.post("/analyze_async")
def analyze_async(
    video_path: str = Form(...),
    save_overlay: bool = Form(True),
    conf_threshold: float = Form(0.4),
    smoothing_window: int = Form(5),
    user_uid: Optional[str] = Form(None),
):
    task_id = str(uuid.uuid4())
    PROGRESS[task_id] = {
        "status": "in_progress",
        "processed": 0,
        "total": None,
        "percentage": None,
        "error": None,
        "result": None,
        "_last_update": 0,
    }

    def handler(processed: int, total: int):
        PROGRESS[task_id]["processed"] = processed
        PROGRESS[task_id]["total"] = total
        PROGRESS[task_id]["percentage"] = float((processed / total) * 100) if total else None
        # Throttle Firestore updates to reduce overhead (every 10 frames or on completion)
        last = int(PROGRESS[task_id].get("_last_update") or 0)
        if (processed - last) >= 10 or (total and processed >= total):
            PROGRESS[task_id]["_last_update"] = processed
            try:
                update_progress_doc(task_id, _progress_for_firestore(task_id, user_uid), user_uid)
            except Exception:
                pass

    def worker():
        try:
            payload = analyze_video(
                video_path=video_path,
                models_dir=MODELS_DIR,
                outputs_dir=OUTPUTS_DIR,
                save_overlay=save_overlay,
                conf_threshold=conf_threshold,
                smoothing_window=smoothing_window,
                progress_handler=handler,
            )
            # Convert artifact paths to served URLs (preserve subfolders under OUTPUTS_DIR)
            pvp: Optional[str] = payload.get("processed_video_path")
            pvp_url = _to_outputs_url(pvp)
            if pvp_url:
                payload["processed_video_path"] = pvp_url

            hmp: Optional[str] = payload.get("heatmap_path")
            hmp_url = _to_outputs_url(hmp)
            if hmp_url:
                payload["heatmap_url"] = hmp_url

            PROGRESS[task_id]["status"] = "done"
            PROGRESS[task_id]["result"] = payload
            try:
                update_progress_doc(task_id, _progress_for_firestore(task_id, user_uid), user_uid)
                write_analysis_doc(user_uid, payload, video_path)
                # Log to Google Sheets (audit) once per run
                try:
                    e = emergency_impact(payload)
                    a = accessibility_impact(payload)
                    c = climate_impact(payload)
                    summary = payload.get("summary") or {}
                    avg_vehicles = float(summary.get("avg_count") or 0.0)
                    congestion = str(payload.get("overall_congestion") or "Low")
                    recommendation = str(payload.get("recommendation_text") or ("Avoid parking" if congestion == "High" else "Okay to park"))
                    confidence = str(e.get("confidence") or "Low")
                    risk_score = float(e.get("emergency_risk_score") or 0.0)
                    emergency_safe = (str(e.get("classification") or "") == "Safe")
                    emergency_probability = float(e.get("probability") or 0.0)
                    accessibility_score = float(a.get("accessibility_score") or 0.0)
                    climate_score = float(c.get("emission_score") or 0.0)
                    video_id = os.path.basename(video_path or (payload.get("processed_video_path") or ""))
                    sheet_payload = build_log_payload(
                        run_id=task_id,
                        video_id=video_id,
                        avg_vehicles=avg_vehicles,
                        congestion=congestion,
                        risk_score=risk_score,
                        emergency_safe=emergency_safe,
                        emergency_probability=emergency_probability,
                        accessibility_score=accessibility_score,
                        climate_score=climate_score,
                        recommendation=recommendation,
                        confidence=confidence,
                    )
                    # This Google Sheets log acts as a lightweight AI audit trail
                    # for transparency, explainability, and public trust.
                    log_decision_to_sheet(sheet_payload)
                except Exception:
                    pass
            except Exception:
                pass
        except Exception as e:
            PROGRESS[task_id]["status"] = "error"
            PROGRESS[task_id]["error"] = str(e)
            try:
                update_progress_doc(task_id, _progress_for_firestore(task_id, user_uid), user_uid)
            except Exception:
                pass

    threading.Thread(target=worker, daemon=True).start()
    return {"task_id": task_id, "progress": PROGRESS[task_id]}

@app.get("/progress")
def get_progress(task_id: str):
    if task_id not in PROGRESS:
        return JSONResponse(status_code=404, content={"error": "task_id not found"})
    return PROGRESS[task_id]

@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    result = chat_reply(req.message, [m.dict() for m in (req.history or [])], getattr(req, "context", None))
    return ChatResponse(reply=result.get("reply", ""), safety_blocks=result.get("safety_blocks", []))

# Helper to retrieve analysis payload for impact endpoints
def _latest_result() -> Optional[dict]:
    try:
        for k, v in PROGRESS.items():
            if isinstance(v, dict) and v.get("status") == "done" and isinstance(v.get("result"), dict):
                return v["result"]
    except Exception:
        return None
    return None

def _resolve_analysis(task_id: Optional[str], video_path: Optional[str], use_latest: bool = False) -> Optional[dict]:
    try:
        if task_id:
            rec = PROGRESS.get(task_id)
            if rec and isinstance(rec.get("result"), dict):
                return rec["result"]
        if video_path:
            # Run a lightweight analysis reusing existing models/outputs
            payload = analyze_video(
                video_path=video_path,
                models_dir=MODELS_DIR,
                outputs_dir=OUTPUTS_DIR,
                save_overlay=False,
                conf_threshold=0.4,
                smoothing_window=5,
            )
            return payload
        if use_latest:
            latest = _latest_result()
            if latest:
                return latest
    except Exception:
        return None
    return None

@app.get("/impact/emergency", response_model=EmergencyImpactResponse)
def impact_emergency(task_id: Optional[str] = None, video_path: Optional[str] = None, use_latest: bool = True):
    payload = _resolve_analysis(task_id, video_path, use_latest=use_latest)
    if not payload:
        return JSONResponse(status_code=400, content={"error": "analysis payload unavailable; provide task_id or video_path"})
    res = emergency_impact(payload)
    # Attempt audit log (dedup by run_id/task_id)
    try:
        a = accessibility_impact(payload)
        c = climate_impact(payload)
        summary = payload.get("summary") or {}
        avg_vehicles = float(summary.get("avg_count") or 0.0)
        congestion = str(payload.get("overall_congestion") or "Low")
        recommendation = str(payload.get("recommendation_text") or ("Avoid parking" if congestion == "High" else "Okay to park"))
        confidence = str(res.get("confidence") or "Low")
        risk_score = float(res.get("emergency_risk_score") or 0.0)
        emergency_safe = (str(res.get("classification") or "") == "Safe")
        emergency_probability = float(res.get("probability") or 0.0)
        accessibility_score = float(a.get("accessibility_score") or 0.0)
        climate_score = float(c.get("emission_score") or 0.0)
        video_id = os.path.basename(video_path or (payload.get("processed_video_path") or ""))
        sheet_payload = build_log_payload(
            run_id=(task_id or None),
            video_id=video_id,
            avg_vehicles=avg_vehicles,
            congestion=congestion,
            risk_score=risk_score,
            emergency_safe=emergency_safe,
            emergency_probability=emergency_probability,
            accessibility_score=accessibility_score,
            climate_score=climate_score,
            recommendation=recommendation,
            confidence=confidence,
        )
        log_decision_to_sheet(sheet_payload)
    except Exception:
        pass
    return res

@app.get("/impact/accessibility", response_model=AccessibilityImpactResponse)
def impact_accessibility(task_id: Optional[str] = None, video_path: Optional[str] = None, entrance_bias: float = 0.0, use_latest: bool = True):
    payload = _resolve_analysis(task_id, video_path, use_latest=use_latest)
    if not payload:
        return JSONResponse(status_code=400, content={"error": "analysis payload unavailable; provide task_id or video_path"})
    res = accessibility_impact(payload, entrance_bias=entrance_bias)
    try:
        e = emergency_impact(payload)
        c = climate_impact(payload)
        summary = payload.get("summary") or {}
        avg_vehicles = float(summary.get("avg_count") or 0.0)
        congestion = str(payload.get("overall_congestion") or "Low")
        recommendation = str(payload.get("recommendation_text") or ("Avoid parking" if congestion == "High" else "Okay to park"))
        confidence = str(e.get("confidence") or "Low")
        risk_score = float(e.get("emergency_risk_score") or 0.0)
        emergency_safe = (str(e.get("classification") or "") == "Safe")
        emergency_probability = float(e.get("probability") or 0.0)
        accessibility_score = float(res.get("accessibility_score") or 0.0)
        climate_score = float(c.get("emission_score") or 0.0)
        video_id = os.path.basename(video_path or (payload.get("processed_video_path") or ""))
        sheet_payload = build_log_payload(
            run_id=(task_id or None),
            video_id=video_id,
            avg_vehicles=avg_vehicles,
            congestion=congestion,
            risk_score=risk_score,
            emergency_safe=emergency_safe,
            emergency_probability=emergency_probability,
            accessibility_score=accessibility_score,
            climate_score=climate_score,
            recommendation=recommendation,
            confidence=confidence,
        )
        log_decision_to_sheet(sheet_payload)
    except Exception:
        pass
    return res

@app.get("/impact/climate", response_model=ClimateImpactResponse)
def impact_climate(task_id: Optional[str] = None, video_path: Optional[str] = None, emission_factor: float = 0.23, use_latest: bool = True):
    payload = _resolve_analysis(task_id, video_path, use_latest=use_latest)
    if not payload:
        return JSONResponse(status_code=400, content={"error": "analysis payload unavailable; provide task_id or video_path"})
    res = climate_impact(payload, emission_factor_per_vehicle_min=emission_factor)
    try:
        e = emergency_impact(payload)
        a = accessibility_impact(payload)
        summary = payload.get("summary") or {}
        avg_vehicles = float(summary.get("avg_count") or 0.0)
        congestion = str(payload.get("overall_congestion") or "Low")
        recommendation = str(payload.get("recommendation_text") or ("Avoid parking" if congestion == "High" else "Okay to park"))
        confidence = str(e.get("confidence") or "Low")
        risk_score = float(e.get("emergency_risk_score") or 0.0)
        emergency_safe = (str(e.get("classification") or "") == "Safe")
        emergency_probability = float(e.get("probability") or 0.0)
        accessibility_score = float(a.get("accessibility_score") or 0.0)
        climate_score = float(res.get("emission_score") or 0.0)
        video_id = os.path.basename(video_path or (payload.get("processed_video_path") or ""))
        sheet_payload = build_log_payload(
            run_id=(task_id or None),
            video_id=video_id,
            avg_vehicles=avg_vehicles,
            congestion=congestion,
            risk_score=risk_score,
            emergency_safe=emergency_safe,
            emergency_probability=emergency_probability,
            accessibility_score=accessibility_score,
            climate_score=climate_score,
            recommendation=recommendation,
            confidence=confidence,
        )
        log_decision_to_sheet(sheet_payload)
    except Exception:
        pass
    return res
