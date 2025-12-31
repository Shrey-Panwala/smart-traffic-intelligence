from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class AnalyzeRequest(BaseModel):
    video_path: str
    save_overlay: bool = True
    conf_threshold: float = 0.4
    smoothing_window: int = 5

class FrameMetrics(BaseModel):
    frame_index: int
    vehicle_count: int
    smoothed_count: float
    congestion_level: str
    parking_score: int
    xai: Dict[str, Any]

class AnalyzeResponse(BaseModel):
    processed_video_path: Optional[str]
    heatmap_url: Optional[str]
    overall_congestion: str
    overall_parking_score: int
    recommendation_text: str
    trend_outlook: Optional[str]
    trend_confidence: Optional[str]
    trend_explanation: Optional[str]
    frames: List[FrameMetrics]
    # Aggregated metrics across the whole video
    summary: Optional[Dict[str, Any]]
    # High-level explainable summary for the entire video
    xai_summary: Optional[str]
    # Methodology and analysis settings (for richer XAI UI)
    settings: Optional[Dict[str, Any]]
    # Alternative to video overlay: annotated snapshots
    snapshots: Optional[List[str]]

# Chat schemas for Gemini assistant
class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None
    context: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    safety_blocks: Optional[List[str]] = None

# Social Impact Schemas
class EmergencyImpactResponse(BaseModel):
    emergency_risk_score: float
    classification: str  # Safe / Risky / Unsafe
    recommended_corridors: Optional[List[Dict[str, Any]]]
    explanation: str
    probability: Optional[float] = None  # 0..1
    confidence: Optional[str] = None     # Low/Medium/High
    confidence_note: Optional[str] = None
    delay_risk_seconds: float
    response_sensitivity: str
    stability_trend: str
    inputs: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, Any]] = None

class AccessibilityImpactResponse(BaseModel):
    stability_score: float
    accessibility_score: float
    rating: str
    recommended_zones: Optional[List[Dict[str, Any]]]
    explanation: str
    probability: Optional[float] = None
    confidence: Optional[str] = None
    confidence_note: Optional[str] = None
    stability_last_60s_std: float
    sudden_spike_count: int
    stress_indicator: str
    inputs: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, Any]] = None

class ClimateImpactResponse(BaseModel):
    emission_score: float
    emission_level: str  # Low Impact / Moderate Impact / High Impact
    alternatives: Optional[List[Dict[str, Any]]]
    explanation: str
    probability: Optional[float] = None
    confidence: Optional[str] = None
    confidence_note: Optional[str] = None
    equivalent_idling_minutes: float
    emission_intensity: str
    relative_vs_freeflow_ratio: float
    inputs: Optional[Dict[str, Any]] = None
    thresholds: Optional[Dict[str, Any]] = None
