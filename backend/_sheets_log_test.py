from dotenv import load_dotenv
load_dotenv('backend/.env')
from backend.sheets_logger import build_log_payload, log_decision_to_sheet
p = build_log_payload(
    run_id='test-run-001',
    video_id='demo.mp4',
    avg_vehicles=3.5,
    congestion='Low',
    risk_score=12,
    emergency_safe=True,
    emergency_probability=0.12,
    accessibility_score=78,
    climate_score=0.45,
    recommendation='Okay to park',
    confidence='High',
)
log_decision_to_sheet(p)
print('APPEND_ATTEMPTED')
