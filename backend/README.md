# Smart Parking & Traffic Intelligence API (Backend)

FastAPI backend for video-based vehicle detection, congestion analysis, and parking recommendations.

## Features
- Upload MP4 videos
- Analyze with YOLOv8 (Ultralytics) for per-frame vehicle counts
- Temporal smoothing, congestion classification
- Parking score & Explainable AI (XAI) details per frame
- Optional annotated overlay video output

## Setup

1. Create a Python environment and install dependencies:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
```

2. Place your trained YOLOv8 model at:

- `backend/models/best.pt`

If not present, the app falls back to `yolov8n.pt` for demo.

3. Run the server:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Optional: Enable Firestore logging (Analyses page)

The frontend Analyses page reads from a Firestore collection `analyses`. To populate it automatically after each run:

- Create a Firebase service account in the Firebase Console → Project Settings → Service accounts → Generate new private key.
- Save the JSON file somewhere on your machine, e.g., `C:/Users/shrey/OneDrive/Desktop/GDG/firebase-admin.json`.
- Set these environment variables (or add to `backend/.env`):

```
FIREBASE_PROJECT_ID=nirma-c7480
FIREBASE_ADMIN_CRED=C:/Users/shrey/OneDrive/Desktop/GDG/firebase-admin.json
```

When configured, the backend will write analysis documents with the authenticated user's UID. The frontend queries `analyses` with `where('uid','==', user.uid)` and will show your runs under My Analyses.

## API

- `POST /upload` — Upload MP4 video.
  - Form-Data: `file` (mp4)
  - Response: `{ "video_path": "backend/uploads/your.mp4" }`

- `POST /analyze` — Analyze video and return metrics.
  - Form-Data: `video_path`, `save_overlay` (bool), `conf_threshold` (float), `smoothing_window` (int)
  - Response (JSON):
    - `processed_video_path` (optional path to annotated video)
    - `overall_congestion` (Low/Medium/High)
    - `overall_parking_score` (int)
    - `recommendation_text` (string)
    - `frames` (list of per-frame metrics incl. XAI)

## Alignment with Congestion.ipynb
- Uses rolling mean (window default 5) to smooth vehicle counts
- Congestion thresholds: `<=5 Low`, `<=20 Medium`, else `High`
- Parking score uses 95th percentile baseline and explicit penalties
- XAI string constructed to explain base score, penalty, final decision

## Notes
- On first run, Ultralytics will create `runs/detect/predict*` folders; the latest annotated mp4 is copied into `backend/outputs` for convenience.
- For large videos, processing can be slow; keep demo clips short (~10–30s).
