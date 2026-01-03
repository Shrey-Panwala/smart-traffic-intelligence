"""
Detection & Analytics logic aligned with Congestion.ipynb
- Uses Ultralytics YOLOv8 (best.pt) for vehicle detection
- Extracts per-frame vehicle counts
- Applies temporal smoothing (rolling mean, window configurable)
- Classifies congestion levels (Low / Medium / High)
- Computes parking score with explicit congestion penalties
- Generates XAI (Explainable AI) details per frame
"""

from typing import List, Dict, Any, Optional, Tuple, Callable
import os
import math

import numpy as np
import pandas as pd
import cv2

# Optional torch import for device detection
try:
    import torch  # type: ignore
except Exception:
    torch = None

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None  # Allow import in environments without ultralytics

# Explicit penalty mapping (for explainability) - from notebook
CONGESTION_PENALTY = {
    "High": 30,
    "Medium": 10,
    "Low": 0,
}


def congestion_level(count: float) -> str:
    # Same thresholds as notebook
    if count <= 5:
        return "Low"
    elif count <= 20:
        return "Medium"
    else:
        return "High"


def parking_score_with_explanation(count: int, congestion: str, max_vehicles: float) -> Tuple[int, Dict[str, Any]]:
    base_score = max(0, max_vehicles - count)
    penalty = CONGESTION_PENALTY.get(congestion, 0)
    final_score = base_score - penalty
    explanation = {
        "vehicle_count": int(count),
        "baseline_95p": float(max_vehicles),
        "base_score": int(base_score),
        "congestion_level": congestion,
        "congestion_penalty": int(penalty),
        "final_score": int(final_score),
    }
    return int(final_score), explanation


def recommend_text_from_score_and_congestion(score: int, congestion: str) -> str:
    # Map to the required UI texts
    if congestion == "High" or score < 0:
        return "Avoid Parking – High Congestion"
    elif congestion == "Medium":
        return "Secondary Preference Parking"
    else:
        return "Highly Recommended Parking"


def explain_decision(xai: Dict[str, Any], smoothed_count: Optional[float] = None) -> str:
    vc = int(xai.get("vehicle_count", 0))
    b95 = float(xai.get("baseline_95p", 0.0))
    bs = int(xai.get("base_score", 0))
    lvl = str(xai.get("congestion_level", "Low"))
    pen = int(xai.get("congestion_penalty", 0))
    fs = int(xai.get("final_score", 0))
    lines = []
    lines.append("Reasoning (latest frame):")
    lines.append(f"- Inputs: observed vehicles={vc}" + (f", smoothed_count={smoothed_count:.1f}" if smoothed_count is not None else "") + f", baseline_95p={b95:.1f}.")
    lines.append("- Preprocessing: temporal smoothing via rolling mean; mitigates frame-to-frame noise and short spikes.")
    lines.append("- Congestion classification: thresholds — ≤5 Low, ≤20 Medium, >20 High; current class=" + lvl + ".")
    lines.append(f"- Scoring: base_score=baseline_95p−count={b95:.1f}−{vc}={bs}; penalty={pen} (by class); final_score={bs}−{pen}={fs}.")
    lines.append("- Decision: higher final_score ⇒ more suitable for nearby parking; negative scores indicate avoidance.")
    # Simple uncertainty note near thresholds
    try:
        if smoothed_count is not None:
            near_low = abs(smoothed_count - 5.0) <= 1.0
            near_med = abs(smoothed_count - 20.0) <= 2.0
            if near_low or near_med:
                thr = 5.0 if near_low else 20.0
                lines.append(f"- Uncertainty note: smoothed_count is near a decision threshold (~{thr}); class may fluctuate with minor changes.")
    except Exception:
        pass
    return "\n".join(lines)


def load_model(best_path: str) -> Optional[Any]:
    if YOLO is None:
        return None
    if not os.path.exists(best_path):
        return YOLO("yolov8n.pt")  # Fallback lightweight model for demo
    return YOLO(best_path)


def analyze_video(
    video_path: str,
    models_dir: str,
    outputs_dir: str,
    save_overlay: bool = True,
    conf_threshold: float = 0.4,
    smoothing_window: int = 5,
    progress_handler: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, Any]:
    """Analyze an MP4 video and return structured metrics and optional overlay path."""
    assert os.path.exists(video_path), f"Video not found: {video_path}"

    # Support both 'best.pt' and the accidental 'best .pt' filename
    best_pt_candidates = [
        os.path.join(models_dir, "best.pt"),
        os.path.join(models_dir, "best .pt"),
    ]
    best_pt = next((p for p in best_pt_candidates if os.path.exists(p)), best_pt_candidates[0])
    model = load_model(best_pt)
    model_label = os.path.basename(best_pt) if os.path.exists(best_pt) else "yolov8n.pt"
    if model is None:
        raise RuntimeError("Ultralytics YOLO not available. Please install dependencies.")

    # Determine total frames for progress reporting
    total_frames = 0
    try:
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        cap.release()
    except Exception:
        total_frames = 0

    # Run detection in stream mode to compute counts per frame
    # Prefer GPU if available; use half precision on CUDA for speed
    device = 0 if (torch is not None and getattr(torch, "cuda", None) and torch.cuda.is_available()) else "cpu"
    use_half = True if device == 0 else False
    results = model.predict(
        source=video_path,
        conf=conf_threshold,
        stream=True,
        save=save_overlay,
        device=device,
        half=use_half,
        imgsz=640,
    )

    vehicle_counts: List[int] = []
    snapshot_urls: List[str] = []
    # Prepare snapshots dir (alternative overlay)
    video_base = os.path.splitext(os.path.basename(video_path))[0]
    snapshots_dir = os.path.join(outputs_dir, "snapshots", video_base)
    os.makedirs(snapshots_dir, exist_ok=True)
    # Snapshot interval: aim for ~2 seconds if fps known, else every 60 frames
    snapshot_interval = 60
    try:
        cap_fps = cv2.VideoCapture(video_path)
        fps_val_local = cap_fps.get(cv2.CAP_PROP_FPS)
        cap_fps.release()
        snapshot_interval = max(1, int((fps_val_local or 30) * 2))
    except Exception:
        pass
    # Configure valid vehicle classes for reliability
    valid_class_names = {
        "car", "truck", "bus", "motorbike", "motorcycle", "bicycle", "van"
    }
    valid_class_ids = None
    try:
        # model.names: dict[int, str]
        valid_class_ids = {i for i, n in model.names.items() if str(n).lower() in valid_class_names}
        if not valid_class_ids:
            valid_class_ids = None  # fallback to counting all if custom model labels differ
    except Exception:
        valid_class_ids = None

    # Heatmap accumulation over a coarse grid
    heat_grid_w, heat_grid_h = 24, 16
    heat_accum = np.zeros((heat_grid_h, heat_grid_w), dtype=np.float32)
    last_orig_img = None

    processed = 0
    for r in results:
        # Track last original image for heatmap background/dimensions
        try:
            last_orig_img = getattr(r, "orig_img", None) or last_orig_img
        except Exception:
            pass

        # Count only relevant vehicle classes and above conf threshold
        count = 0
        try:
            boxes = getattr(r, "boxes", None)
            data = getattr(boxes, "data", None)
            if data is not None:
                try:
                    arr = data.cpu().numpy()
                except Exception:
                    arr = np.array(data)
                # arr columns: x1,y1,x2,y2,conf,cls
                h, w = (last_orig_img.shape[0], last_orig_img.shape[1]) if last_orig_img is not None else (384, 640)
                for row in arr:
                    x1, y1, x2, y2, conf, cls_idx = row[:6]
                    if valid_class_ids is not None and int(cls_idx) not in valid_class_ids:
                        continue
                    if conf is not None and float(conf) < float(conf_threshold):
                        continue
                    count += 1
                    # Heatmap centroid accumulation
                    cx = (float(x1) + float(x2)) / 2.0
                    cy = (float(y1) + float(y2)) / 2.0
                    bx = max(0, min(heat_grid_w - 1, int((cx / max(1.0, w)) * heat_grid_w)))
                    by = max(0, min(heat_grid_h - 1, int((cy / max(1.0, h)) * heat_grid_h)))
                    heat_accum[by, bx] += 1.0
            else:
                # Fallback to total boxes length
                count = int(len(boxes)) if boxes is not None else 0
        except Exception:
            # Robust fallback if structure differs
            try:
                count = int(len(r.boxes))
            except Exception:
                count = 0

        vehicle_counts.append(count)
        processed += 1

        # Save annotated snapshot periodically
        try:
            if processed % snapshot_interval == 0:
                img = r.plot()
                snap_path = os.path.join(snapshots_dir, f"frame_{processed}.jpg")
                cv2.imwrite(snap_path, img)
                snapshot_urls.append(f"/outputs/snapshots/{video_base}/frame_{processed}.jpg")
        except Exception:
            pass
        if progress_handler and (processed % 10 == 0 or (total_frames and processed >= total_frames)):
            progress_handler(processed, total_frames)

    if len(vehicle_counts) == 0:
        # If stream cannot iterate (codec issues), fallback to non-stream single run
        res = model.predict(source=video_path, conf=conf_threshold)
        vehicle_counts = [int(len(res[0].boxes))] if len(res) else [0]
        processed = len(vehicle_counts)
        if progress_handler:
            progress_handler(processed, total_frames)

    # Temporal smoothing via rolling mean (window from request)
    df = pd.DataFrame({
        "frame": list(range(len(vehicle_counts))),
        "vehicle_count": vehicle_counts,
    })
    df["avg_vehicle_count"] = (
        df["vehicle_count"].rolling(window=max(1, smoothing_window), min_periods=1).mean()
    )
    df["smoothed_congestion"] = df["avg_vehicle_count"].apply(congestion_level)

    # Max vehicles for scoring (95th percentile) as in notebook
    max_vehicles = float(df["vehicle_count"].quantile(0.95)) if len(df) else 0.0

    frame_xai: List[Dict[str, Any]] = []
    frame_scores: List[int] = []
    frame_levels: List[str] = []

    for _, row in df.iterrows():
        level = row["smoothed_congestion"]
        score, xai = parking_score_with_explanation(int(row["vehicle_count"]), level, max_vehicles)
        xai["explanation_text"] = explain_decision(xai, smoothed_count=float(row["avg_vehicle_count"]))
        frame_xai.append(xai)
        frame_scores.append(score)
        frame_levels.append(level)

    # Overall metrics (use last frame smoothed congestion and score)
    overall_congestion = frame_levels[-1] if frame_levels else "Low"
    overall_score = frame_scores[-1] if frame_scores else 0
    recommendation_text = recommend_text_from_score_and_congestion(overall_score, overall_congestion)

    processed_video_path: Optional[str] = None
    heatmap_path: Optional[str] = None
    if save_overlay:
        # Find latest runs/detect/predict directory (generated during streaming above)
        runs_root = os.path.join(os.getcwd(), "runs", "detect")
        if os.path.isdir(runs_root):
            # pick the most recent predict folder
            predict_dirs = [
                os.path.join(runs_root, d) for d in os.listdir(runs_root) if d.startswith("predict")
            ]
            if predict_dirs:
                latest = max(predict_dirs, key=os.path.getmtime)
                # Copy/move resulting video into outputs_dir for serving
                # Ultralytics names the annotated video same as source with suffix
                # Accept common video container extensions
                allowed_exts = (".mp4", ".avi", ".mov", ".mkv", ".webm")
                vids = [f for f in os.listdir(latest) if os.path.splitext(f.lower())[1] in allowed_exts]
                if vids:
                    src_vid = os.path.join(latest, vids[0])
                    os.makedirs(outputs_dir, exist_ok=True)
                    dst_vid = os.path.join(outputs_dir, os.path.basename(src_vid))
                    try:
                        import shutil
                        shutil.copy2(src_vid, dst_vid)
                        processed_video_path = dst_vid
                    except Exception:
                        processed_video_path = src_vid  # fallback reference

                # If the processed video is not mp4, convert to mp4 for browser compatibility
                if processed_video_path:
                    _, ext = os.path.splitext(processed_video_path.lower())
                    if ext != ".mp4":
                        try:
                            cap = cv2.VideoCapture(processed_video_path)
                            fps = cap.get(cv2.CAP_PROP_FPS)
                            if not fps or fps <= 0:
                                fps = 30.0
                            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
                            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                            mp4_path = os.path.splitext(processed_video_path)[0] + ".mp4"
                            out = cv2.VideoWriter(mp4_path, fourcc, fps, (max(1,w), max(1,h)))
                            while True:
                                ret, frame = cap.read()
                                if not ret:
                                    break
                                out.write(frame)
                            out.release()
                            cap.release()
                            # Prefer the mp4 path after successful conversion
                            if os.path.exists(mp4_path) and os.path.getsize(mp4_path) > 0:
                                processed_video_path = mp4_path
                        except Exception:
                            # If conversion fails, keep original path
                            pass

    # Generate congestion heatmap image aggregated over the video
    try:
        # Normalize heatmap and upscale to frame size
        if last_orig_img is not None:
            h, w = last_orig_img.shape[0], last_orig_img.shape[1]
        else:
            h, w = 384, 640
        heat_norm = heat_accum.copy()
        if np.max(heat_norm) > 0:
            heat_norm = heat_norm / np.max(heat_norm)
        heat_img_small = (heat_norm * 255.0).astype(np.uint8)
        heat_img = cv2.resize(heat_img_small, (w, h), interpolation=cv2.INTER_CUBIC)
        heat_color = cv2.applyColorMap(heat_img, cv2.COLORMAP_JET)

        # Choose background: last original frame if available, else dark canvas
        if last_orig_img is not None:
            bg = last_orig_img.copy()
        else:
            bg = np.zeros((h, w, 3), dtype=np.uint8)
            bg[:] = (30, 30, 30)

        # Blend heatmap onto background
        overlay_alpha = 0.5
        blended = cv2.addWeighted(bg, 1.0, heat_color, overlay_alpha, 0)

        # Save into outputs_dir/heatmaps/<video_base>_heatmap.png
        heatmaps_dir = os.path.join(outputs_dir, "heatmaps")
        os.makedirs(heatmaps_dir, exist_ok=True)
        heatmap_path = os.path.join(heatmaps_dir, f"{video_base}_heatmap.png")
        cv2.imwrite(heatmap_path, blended)
    except Exception:
        heatmap_path = None

    # Aggregated summary metrics
    low = sum(1 for lvl in frame_levels if lvl == "Low")
    med = sum(1 for lvl in frame_levels if lvl == "Medium")
    high = sum(1 for lvl in frame_levels if lvl == "High")
    total = len(df)
    avg = float(df["vehicle_count"].mean()) if total else 0.0
    mx = int(df["vehicle_count"].max()) if total else 0
    md = float(df["vehicle_count"].median()) if total else 0.0
    std = float(df["vehicle_count"].std()) if total else 0.0
    p95 = float(df["vehicle_count"].quantile(0.95)) if total else 0.0
    fps_val = None
    try:
        cap2 = cv2.VideoCapture(video_path)
        fps_val = float(cap2.get(cv2.CAP_PROP_FPS) or 0) or None
        cap2.release()
    except Exception:
        fps_val = None
    duration = float(total / fps_val) if (fps_val and total) else None

    # Short-Term Trend Outlook (categorical + confidence + explanation)
    # Analyze recent smoothed counts within the current session only.
    # Approximate a 5-minute window when available; otherwise use all available frames.
    try:
        target_seconds = 300.0  # ~5 minutes
        fps_for_window = float(fps_val) if fps_val else 30.0
        target_frames = int(target_seconds * fps_for_window)
        window_frames = max(10, min(len(df), target_frames))
        recent_smoothed = df["avg_vehicle_count"].tail(window_frames).to_numpy()
        recent_levels = df["smoothed_congestion"].tail(window_frames).to_list()

        # Slope via simple linear fit; guard against tiny windows
        if recent_smoothed.size >= 2:
            x = np.arange(recent_smoothed.size, dtype=np.float32)
            try:
                slope = float(np.polyfit(x, recent_smoothed.astype(np.float32), 1)[0])
            except Exception:
                # Fallback to mean difference per frame
                diffs = np.diff(recent_smoothed)
                slope = float(np.mean(diffs)) if diffs.size else 0.0
        else:
            slope = 0.0

        # Volatility and typical change to set a dynamic stability band
        diffs = np.diff(recent_smoothed) if recent_smoothed.size >= 2 else np.array([])
        mad = float(np.mean(np.abs(diffs))) if diffs.size else 0.0
        band = max(0.5, mad * 0.5)  # tolerance band around zero slope

        # Determine categorical direction
        if abs(slope) <= band:
            trend_outlook = "Stable"
        elif slope > 0:
            trend_outlook = "Worsening"
        else:
            trend_outlook = "Improving"

        # Class stability: fraction of recent frames matching the latest class
        latest_class = recent_levels[-1] if recent_levels else overall_congestion
        stability_ratio = (
            float(sum(1 for lvl in recent_levels if lvl == latest_class)) / float(len(recent_levels))
            if recent_levels else 0.0
        )

        # Trend consistency: how many diffs align with slope sign, ignore tiny diffs
        ignore_thresh = mad * 0.3
        if diffs.size:
            sign = 1.0 if slope > 0 else (-1.0 if slope < 0 else 0.0)
            usable = [d for d in diffs if abs(d) > ignore_thresh]
            agree = [d for d in usable if d * sign > 0] if sign != 0 else []
            consistency_ratio = (float(len(agree)) / float(len(usable))) if len(usable) else 0.5
        else:
            consistency_ratio = 0.5

        # Confidence mapping based on stability and consistency
        # High: strong agreement and sufficient slope magnitude for non-stable; or very stable classes
        if trend_outlook == "Stable":
            if stability_ratio >= 0.8 and abs(slope) <= band * 0.5:
                trend_confidence = "High"
            elif stability_ratio >= 0.5:
                trend_confidence = "Medium"
            else:
                trend_confidence = "Low"
        else:
            if consistency_ratio >= 0.7 and stability_ratio >= 0.5 and abs(slope) > band:
                trend_confidence = "High"
            elif consistency_ratio >= 0.5:
                trend_confidence = "Medium"
            else:
                trend_confidence = "Low"

        # Human-readable explanation (transparent, short-term inference)
        minutes_window = (float(window_frames) / fps_for_window / 60.0) if fps_for_window else None
        window_text = (
            f"last ~{minutes_window:.0f} minutes" if minutes_window and minutes_window >= 1.0 else f"recent frames"
        )
        stability_text = (
            "mostly stable" if stability_ratio >= 0.8 else ("somewhat stable" if stability_ratio >= 0.5 else "variable")
        )
        consistency_text = (
            "consistent" if consistency_ratio >= 0.7 else ("mixed" if consistency_ratio >= 0.5 else "uncertain")
        )
        trend_explanation = (
            "Short-Term Trend Outlook indicates " + trend_outlook.lower() + " conditions over the next few minutes. "
            f"This is a short-term inference based on the {window_text} in this video session. "
            f"Smoothed vehicle counts have been {('rising' if trend_outlook=='Worsening' else ('falling' if trend_outlook=='Improving' else 'holding steady'))} "
            f"and recent congestion labels are {stability_text}. "
            f"Overall trend is {consistency_text}; confidence is {trend_confidence}. "
            "Use this as immediate guidance; it does not predict longer-term traffic."
        )
    except Exception:
        trend_outlook = "Stable"
        trend_confidence = "Low"
        trend_explanation = (
            "Short-Term Trend Outlook is unavailable due to limited data from this session. "
            "This system reports short-term behavior only and does not forecast beyond the current video."
        )

    # Build whole-video XAI summary text
    xai_summary_parts = []
    xai_summary_parts.append("Methodology: YOLOv8 object detection (" + model_label + "); vehicle classes filtered; confidence ≥ " + f"{conf_threshold:.2f}" + ".")
    xai_summary_parts.append("Temporal smoothing: rolling mean window=" + str(smoothing_window) + "; congestion thresholds: ≤5 Low, ≤20 Medium, >20 High.")
    xai_summary_parts.append("Heatmap: centroid accumulation on a " + f"{heat_grid_w}×{heat_grid_h}" + " grid; blended over last frame (alpha 0.5).")
    xai_summary_parts.append(f"Statistics: {total} frames" + (f" (~{duration:.1f}s at {fps_val:.1f} fps)" if duration else "") +
                             f"; avg {avg:.2f}; median {md:.2f}; max {mx}; std {std:.2f}; 95th percentile {p95:.2f}.")
    xai_summary_parts.append(
        f"Distribution: Low {int(low)} ({(low/total*100 if total else 0):.1f}%), Medium {int(med)} ({(med/total*100 if total else 0):.1f}%), High {int(high)} ({(high/total*100 if total else 0):.1f}%)."
    )
    xai_summary_parts.append(f"Scoring: base=95p−count; penalty by class (Low 0 / Medium 10 / High 30); decision uses final_score and class.")
    xai_summary_parts.append(f"Overall: congestion={overall_congestion}; parking_score={overall_score}; recommendation={recommendation_text}.")
    xai_summary_parts.append(f"Trend: {trend_outlook} (confidence {trend_confidence}).")
    xai_summary = "\n".join(xai_summary_parts)

    frames_payload = []
    for i in range(len(df)):
        frames_payload.append({
            "frame_index": int(df.loc[i, "frame"]),
            "vehicle_count": int(df.loc[i, "vehicle_count"]),
            "smoothed_count": float(df.loc[i, "avg_vehicle_count"]),
            "congestion_level": frame_levels[i],
            "parking_score": frame_scores[i],
            "xai": frame_xai[i],
        })

    return {
        "processed_video_path": processed_video_path,
        "heatmap_path": heatmap_path,
        "overall_congestion": overall_congestion,
        "overall_parking_score": overall_score,
        "recommendation_text": recommendation_text,
        "trend_outlook": trend_outlook,
        "trend_confidence": trend_confidence,
        "trend_explanation": trend_explanation,
        "frames": frames_payload,
        "summary": {
            "total_frames": total,
            "fps": fps_val,
            "duration_seconds": duration,
            "avg_count": avg,
            "median_count": md,
            "max_count": mx,
            "p95_count": p95,
            "std_count": std,
            "low_frames": low,
            "medium_frames": med,
            "high_frames": high,
        },
        "xai_summary": xai_summary,
        "settings": {
            "conf_threshold": float(conf_threshold),
            "smoothing_window": int(smoothing_window),
            "model": model_label,
            "heatmap_grid": [heat_grid_w, heat_grid_h]
        },
        "snapshots": snapshot_urls,
        "progress": {
            "processed": processed,
            "total": total_frames,
            "percentage": float((processed / total_frames) * 100) if total_frames else None,
        }
    }
