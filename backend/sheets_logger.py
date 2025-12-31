import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# This Google Sheets log acts as a lightweight AI audit trail
# for transparency, explainability, and public trust.

# Env vars (backend-only, never exposed to frontend):
# - GOOGLE_SHEETS_CRED: absolute path to service account JSON
# - GOOGLE_SHEETS_SPREADSHEET_ID: target Google Sheets spreadsheet ID
# - GOOGLE_SHEETS_WORKSHEET_TITLE: optional worksheet title (defaults to first sheet)

_LOGGED_RUN_IDS: set[str] = set()

_gspread = None
_client = None
_sheet = None

COLUMNS = [
    "Timestamp",
    "Run ID",
    "Video ID",
    "Avg Vehicles",
    "Congestion Level",
    "Risk Score",
    "Emergency Safe",
    "Emergency Probability",
    "Accessibility Score",
    "Climate CO₂ Score",
    "Final Recommendation",
    "Confidence Level",
]


def _lazy_init() -> bool:
    global _gspread, _client, _sheet
    if _sheet is not None:
        return True
    try:
        import gspread as _gs
    except Exception:
        return False
    _gspread = _gs

    # Accept aliases for easier setup: reuse FIREBASE_ADMIN_CRED and GOOGLE_SHEETS_ID if provided
    cred_path = os.environ.get("GOOGLE_SHEETS_CRED") or os.environ.get("FIREBASE_ADMIN_CRED")
    spreadsheet_id = os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID") or os.environ.get("GOOGLE_SHEETS_ID")
    worksheet_title = os.environ.get("GOOGLE_SHEETS_WORKSHEET_TITLE")
    if not spreadsheet_id:
        return False
    try:
        if cred_path and os.path.exists(cred_path):
            _client = _gs.service_account(filename=cred_path)
        else:
            # Support default credentials file if present
            _client = _gs.service_account()
        sh = _client.open_by_key(spreadsheet_id)
        if worksheet_title:
            try:
                _sheet = sh.worksheet(worksheet_title)
            except Exception:
                # Fallback to first worksheet
                _sheet = sh.sheet1
        else:
            _sheet = sh.sheet1
        # Ensure header exists and matches expected columns
        try:
            header = _sheet.row_values(1)
            if header != COLUMNS:
                _sheet.update('A1', [COLUMNS])
        except Exception:
            pass
        return True
    except Exception:
        _client = None
        _sheet = None
        return False


def _iso_utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_num(v: Any, is_int: bool = False) -> float | int:
    try:
        n = float(v)
        return int(round(n)) if is_int else n
    except Exception:
        return 0 if is_int else 0.0


def build_log_payload(
    *,
    run_id: Optional[str],
    video_id: Optional[str],
    avg_vehicles: Optional[float],
    congestion: Optional[str],
    risk_score: Optional[float],
    emergency_safe: Optional[bool],
    emergency_probability: Optional[float],
    accessibility_score: Optional[float],
    climate_score: Optional[float],
    recommendation: Optional[str],
    confidence: Optional[str],
) -> Dict[str, Any]:
    return {
        "timestamp": _iso_utc_now(),
        "run_id": str(run_id or uuid.uuid4()),
        "video_id": str(video_id or "unknown"),
        "avg_vehicles": float(avg_vehicles or 0.0),
        "congestion": (congestion or "Low"),
        "risk_score": _safe_num(risk_score, is_int=True),
        "emergency_safe": bool(emergency_safe) if emergency_safe is not None else False,
        "emergency_probability": float(emergency_probability or 0.0),
        "accessibility_score": _safe_num(accessibility_score, is_int=True),
        "climate_score": float(climate_score or 0.0),
        "recommendation": (recommendation or ""),
        "confidence": (confidence or "Low"),
    }


def log_decision_to_sheet(payload: Dict[str, Any]) -> None:
    """
    Append a single decision row to Google Sheets. Payload must include fields:
    - timestamp (ISO 8601 UTC), run_id, video_id, avg_vehicles, congestion, risk_score,
      emergency_safe, emergency_probability, accessibility_score, climate_score,
      recommendation, confidence

    Fails silently if configuration is missing or the API call fails.
    Avoids duplicate logging per run_id in-process.
    """
    try:
        if not _lazy_init():
            return
        run_id = str(payload.get("run_id") or "")
        if run_id:
            if run_id in _LOGGED_RUN_IDS:
                return
            _LOGGED_RUN_IDS.add(run_id)
        # Order columns to match sheet schema exactly
        row = [
            str(payload.get("timestamp") or _iso_utc_now()),
            str(payload.get("run_id") or ""),
            str(payload.get("video_id") or "unknown"),
            float(payload.get("avg_vehicles") or 0.0),
            str(payload.get("congestion") or "Low"),
            int(_safe_num(payload.get("risk_score"), is_int=True)),
            bool(payload.get("emergency_safe") or False),
            float(payload.get("emergency_probability") or 0.0),
            int(_safe_num(payload.get("accessibility_score"), is_int=True)),
            float(payload.get("climate_score") or 0.0),
            str(payload.get("recommendation") or ""),
            str(payload.get("confidence") or "Low"),
        ]
        # gspread expects booleans as strings sometimes; normalize
        row = ["TRUE" if (isinstance(v, bool) and v) else ("FALSE" if isinstance(v, bool) else v) for v in row]
        # Append
        _sheet.append_row(row, value_input_option="USER_ENTERED")
    except Exception:
        # Fail silently; never break core analysis flow
        return
