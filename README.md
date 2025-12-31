# Smart Parking & Traffic Intelligence System

Modern, responsive web app with FastAPI backend and React frontend. Demo-focused with explainable results and clear architecture.

## Tech Stack
- Frontend: React (Vite), Recharts, Bootstrap (CDN)
- Backend: Python (FastAPI), Ultralytics YOLOv8
- Video Upload Support: MP4

## Run Locally (Windows)

1. Backend
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Place your trained model at `backend/models/best.pt`. If missing, the app uses `yolov8n.pt` for demo.

2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173.

## Workflow
- Upload MP4 on Upload page
- Analyze on Analysis page (auto-fills last uploaded path)
- See overlay (if saved), live counts, smoothed graph, congestion, parking recommendation, and XAI explanation

## Alignment with Congestion.ipynb
- Uses rolling mean smoothing (default window=5)
- Congestion thresholds: ≤5 → Low, ≤20 → Medium, else High
- Parking score uses 95th percentile baseline with explicit penalties: High=30, Medium=10, Low=0
- XAI explanation strings mirror the notebook logic

## Demo Tips
- Use short clips (10–30s) for quick analysis
- Ensure `backend/models/best.pt` exists for trained detection; otherwise demo with `yolov8n.pt`
- Annotated outputs are copied to `backend/outputs`
