import os
from typing import Any, Dict, Optional

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except Exception:
    firebase_admin = None
    credentials = None
    firestore = None

_app = None
_db = None


def init_admin() -> Optional[Any]:
    global _app, _db
    if _app is not None:
        return _app
    if firebase_admin is None:
        return None
    try:
        cred_path = os.environ.get("FIREBASE_ADMIN_CRED")
        project_id = os.environ.get("FIREBASE_PROJECT_ID")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)  # type: ignore
            _app = firebase_admin.initialize_app(cred, {"projectId": project_id} if project_id else None)
        else:
            # Attempt application default credentials (useful on GCP)
            cred = credentials.ApplicationDefault()  # type: ignore
            _app = firebase_admin.initialize_app(cred, {"projectId": project_id} if project_id else None)
        _db = firestore.client()  # type: ignore
        return _app
    except Exception:
        _app = None
        _db = None
        return None


def get_db():
    if _db is not None:
        return _db
    init_admin()
    return _db


def write_analysis_doc(uid: Optional[str], payload: Dict[str, Any], video_path: Optional[str] = None) -> None:
    db = get_db()
    if db is None:
        return
    try:
        doc = {
            "uid": uid,
            "status": payload.get("status") or "done",
            "overallCongestion": payload.get("overall_congestion"),
            "parkingScore": payload.get("overall_parking_score"),
            "recommendation": payload.get("recommendation_text"),
            "processedVideoUrl": payload.get("processed_video_path"),
            "heatmapUrl": payload.get("heatmap_url"),
            "createdAt": firestore.SERVER_TIMESTAMP,  # type: ignore
        }
        db.collection("analyses").add(doc)
    except Exception:
        # Non-critical: ignore Firestore errors
        pass


def update_progress_doc(task_id: str, data: Dict[str, Any], uid: Optional[str] = None) -> None:
    db = get_db()
    if db is None:
        return
    try:
        doc = dict(data)
        doc["uid"] = uid
        doc["updatedAt"] = firestore.SERVER_TIMESTAMP  # type: ignore
        db.collection("analysisProgress").document(task_id).set(doc, merge=True)
    except Exception:
        pass
