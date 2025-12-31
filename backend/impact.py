from typing import Dict, Any, List, Optional, Tuple
import math

# Helper to compute recent volatility and stability
def _recent_series(payload: Dict[str, Any], key: str = "smoothed_count", window_frames: int = 300) -> List[float]:
    frames = payload.get("frames") or []
    vals = [float(f.get(key) or 0.0) for f in frames]
    if not vals:
        return []
    if len(vals) <= window_frames:
        return vals
    return vals[-window_frames:]

def _stats(vals: List[float]) -> Tuple[float, float]:
    if not vals:
        return 0.0, 0.0
    avg = sum(vals) / len(vals)
    var = sum((v - avg) ** 2 for v in vals) / max(1, len(vals))
    std = var ** 0.5
    return avg, std

def _slope(vals: List[float]) -> float:
    if not vals or len(vals) < 2:
        return 0.0
    try:
        x = list(range(len(vals)))
        # simple least-squares slope
        n = float(len(vals))
        sumx = sum(x)
        sumy = sum(vals)
        sumxx = sum(i*i for i in x)
        sumxy = sum(i*v for i, v in zip(x, vals))
        denom = (n * sumxx - sumx * sumx) or 1.0
        return (n * sumxy - sumx * sumy) / denom
    except Exception:
        diffs = [vals[i+1] - vals[i] for i in range(len(vals)-1)]
        return (sum(diffs) / len(diffs)) if diffs else 0.0

def _congestion_weight(label: str) -> int:
    if label == "High":
        return 60
    if label == "Medium":
        return 30
    return 10

def _classify_level(score: float, bands: Tuple[float, float] = (30.0, 60.0)) -> str:
    low, high = bands
    if score < low:
        return "Safe"
    if score < high:
        return "Risky"
    return "Unsafe"

def _find_low_stress_segments(vals: List[float], thresh: Optional[float] = None) -> List[Dict[str, int]]:
    if not vals:
        return []
    if thresh is None:
        # threshold at 40th percentile approx via mean - small buffer
        avg = sum(vals) / len(vals)
        thresh = max(0.0, avg * 0.8)
    segments = []
    start = None
    for i, v in enumerate(vals):
        ok = v <= thresh
        if ok and start is None:
            start = i
        elif (not ok) and start is not None:
            segments.append({"start": start, "end": i - 1})
            start = None
    if start is not None:
        segments.append({"start": start, "end": len(vals) - 1})
    # Pick top 3 longest
    segments.sort(key=lambda s: (s["end"] - s["start"]), reverse=True)
    return segments[:3]


def emergency_impact(payload: Dict[str, Any]) -> Dict[str, Any]:
    summary = payload.get("summary") or {}
    avg_count = float(summary.get("avg_count") or 0.0)
    std_count = float(summary.get("std_count") or 0.0)
    congestion = str(payload.get("overall_congestion") or "Low")

    recent = _recent_series(payload)
    avg_recent, recent_std = _stats(recent)
    # Volatility change over short horizon (last quarter vs previous quarter)
    change_pct = 0.0
    try:
        q = max(4, len(recent) // 4)
        prev = recent[:q]
        last = recent[-q:]
        _, std_prev = _stats(prev)
        _, std_last = _stats(last)
        if std_prev > 0:
            change_pct = ((std_last - std_prev) / std_prev) * 100.0
    except Exception:
        change_pct = 0.0

    # Rule-based risk: congestion weight + volatility penalties
    risk = _congestion_weight(congestion) + (recent_std * 4.0) + (std_count * 2.0)
    classification = _classify_level(risk)

    # Corridors: segments of lower smoothed counts in recent window
    segments = _find_low_stress_segments(recent)
    rec_zones = []
    for rank, s in enumerate(segments, start=1):
        seg_vals = recent[s["start"]: s["end"]+1]
        seg_avg, seg_std = _stats(seg_vals)
        rec_zones.append({
            "type": "corridor",
            "frame_start": s["start"],
            "frame_end": s["end"],
            "avg_vehicles": float(seg_avg),
            "volatility": float(seg_std),
            "safety_rank": rank,
            "label": "Recommended for Ambulance" if rank == 1 else ("Use Only If Necessary" if rank == 2 else "Secondary Option"),
            "note": "Lower, stable traffic segment",
        })

    # Probability via logistic mapping around mid-band
    # center near 45, scale control steepness
    center = 45.0
    scale = 10.0
    try:
        prob = 1.0 / (1.0 + math.exp(-(risk - center) / max(1e-6, scale)))
    except Exception:
        prob = min(1.0, max(0.0, (risk - center + scale) / (2 * scale)))

    # Confidence from recent data length and volatility agreement
    data_len = len(_recent_series(payload))
    if data_len >= 240 and recent_std >= 1.0:
        confidence = "High"
    elif data_len >= 120:
        confidence = "Medium"
    else:
        confidence = "Low"

    # Confidence calibration
    total_frames = int(((payload.get("summary") or {}).get("total_frames")) or len(recent))
    confidence_note = f"{confidence} confidence (stable patterns, {total_frames}+ frames analyzed)."

    # Trend from slope of recent smoothed counts
    slope = _slope(recent)
    band = max(0.02, recent_std * 0.05)  # tolerance band
    if abs(slope) <= band:
        trend = "Stable"
    elif slope > 0:
        trend = "Deteriorating"
    else:
        trend = "Improving"

    # Delay risk (rough heuristic):
    delay_risk_seconds = float(max(0.0, (risk * 0.8) + (recent_std * 6.0)))

    explanation = (
        f"Emergency risk computed from congestion='{congestion}', avg vehicles={avg_count:.2f}, "
        f"short-term volatility={recent_std:.2f}, overall volatility={std_count:.2f}. "
        f"Volatility changed by {change_pct:.0f}% in the latest window. "
        "Higher volatility increases risk for emergency routing."
    )

    response_sensitivity = "Critical" if classification == "Unsafe" else ("Moderate" if classification == "Risky" else "Low")
    return {
        "emergency_risk_score": float(risk),
        "classification": classification,
        "recommended_corridors": rec_zones,
        "explanation": explanation,
        "probability": float(prob),
        "confidence": confidence,
        "confidence_note": confidence_note,
        "delay_risk_seconds": float(delay_risk_seconds),
        "response_sensitivity": response_sensitivity,
        "stability_trend": trend,
        "inputs": {
            "avg_count": avg_count,
            "recent_std": recent_std,
            "overall_std": std_count,
            "congestion": congestion,
            "recent_slope": slope,
            "volatility_change_pct": change_pct,
        },
        "thresholds": {
            "bands": [30.0, 60.0],
            "logistic_center": center,
            "logistic_scale": scale,
        },
    }


def accessibility_impact(payload: Dict[str, Any], entrance_bias: float = 0.0) -> Dict[str, Any]:
    summary = payload.get("summary") or {}
    congestion = str(payload.get("overall_congestion") or "Low")
    recent = _recent_series(payload)
    avg, std = _stats(recent)
    # Stability over last ~60s
    fps = float((payload.get("summary") or {}).get("fps") or 30.0)
    window = max(10, int(60.0 * fps))
    last_vals = recent[-window:] if len(recent) > window else recent
    _, std_last = _stats(last_vals)
    # Sudden spike count (diffs exceeding dynamic threshold)
    diffs = [abs(last_vals[i+1] - last_vals[i]) for i in range(len(last_vals)-1)]
    spike_thresh = max(1.0, std_last * 0.8)
    spike_count = sum(1 for d in diffs if d > spike_thresh)

    # Stability score (inverse of volatility), scaled 0..100
    stability_raw = 100.0 / (1.0 + std)
    # Accessibility score emphasizes stability; add gentle penalty for medium/high congestion
    cong_pen = 20.0 if congestion == "High" else (8.0 if congestion == "Medium" else 0.0)
    score = max(0.0, min(100.0, stability_raw - cong_pen + entrance_bias))

    # Rating buckets
    if score >= 70:
        rating = "Senior-Friendly Zone"
    elif score >= 40:
        rating = "Wheelchair Accessible Parking"
    else:
        rating = "Caution: Variable Traffic"

    # Stress indicator
    if std_last <= 0.8 and spike_count <= 2:
        stress = "Low Stress"
    elif std_last <= 1.6 and spike_count <= 5:
        stress = "Moderate Stress"
    else:
        stress = "High Stress"

    segments = _find_low_stress_segments(recent, thresh=avg * 0.9)
    rec_zones = [{"type": "low-stress", "frame_start": s["start"], "frame_end": s["end"], "note": "Stable, low variability segment"} for s in segments]

    # Probability that zone is low-stress using logistic over std
    # Lower std → higher probability of accessibility suitability
    try:
        prob = 1.0 / (1.0 + math.exp((std - 1.0)))  # std around 1.0 as mid-point
    except Exception:
        prob = max(0.0, min(1.0, 1.0 - std / (std + 1.0)))

    # Confidence by data length
    data_len = len(recent)
    confidence = "High" if data_len >= 240 else ("Medium" if data_len >= 120 else "Low")

    explanation = (
        f"Accessibility emphasizes stability: recent std={std:.2f} → stability={stability_raw:.1f}. "
        f"Congestion='{congestion}' applies a small penalty; entrance bias={entrance_bias:.1f} adjusts the score."
    )

    total_frames = int(((payload.get("summary") or {}).get("total_frames")) or len(recent))
    confidence_note = f"{confidence} confidence (stable patterns, {total_frames}+ frames analyzed)."
    return {
        "stability_score": float(stability_raw),
        "accessibility_score": float(score),
        "rating": rating,
        "recommended_zones": rec_zones,
        "explanation": explanation,
        "probability": float(prob),
        "confidence": confidence,
        "confidence_note": confidence_note,
        "stability_last_60s_std": float(std_last),
        "sudden_spike_count": int(spike_count),
        "stress_indicator": stress,
        "inputs": {
            "recent_std": std,
            "congestion": congestion,
            "entrance_bias": entrance_bias,
            "last_60s_std": std_last,
            "spike_threshold": spike_thresh,
        },
        "thresholds": {
            "std_mid": 1.0,
            "rating_bands": [40.0, 70.0],
        },
    }


def climate_impact(payload: Dict[str, Any], emission_factor_per_vehicle_min: float = 0.23) -> Dict[str, Any]:
    summary = payload.get("summary") or {}
    fps = float(summary.get("fps") or 0.0) or 30.0
    total_frames = int(summary.get("total_frames") or 0)
    med_frames = int(summary.get("medium_frames") or 0)
    high_frames = int(summary.get("high_frames") or 0)

    # Approximate congestion duration minutes
    cong_frames = med_frames + high_frames
    minutes = (cong_frames / fps) / 60.0 if (fps and cong_frames) else 0.0
    total_minutes = (total_frames / fps) / 60.0 if (fps and total_frames) else 0.0
    non_congested_minutes = max(0.0, total_minutes - minutes)

    avg_count = float(summary.get("avg_count") or 0.0)
    emission_score = avg_count * minutes * emission_factor_per_vehicle_min

    # Classification
    if emission_score < 1.0:
        level = "Low Impact"
    elif emission_score < 3.0:
        level = "Moderate Impact"
    else:
        level = "High Impact"

    # Alternative suggestion: pick segments with lower smoothed counts
    recent = _recent_series(payload)
    segments = _find_low_stress_segments(recent)
    alternatives = []
    for s in segments:
        seg_vals = recent[s["start"]: s["end"]+1]
        seg_avg, seg_std = _stats(seg_vals)
        note = "Lower density; smoother flow"
        if seg_std < 1.0:
            note = "Smoother flow; fewer stops"
        alternatives.append({
            "frame_start": s["start"],
            "frame_end": s["end"],
            "avg_vehicles": float(seg_avg),
            "volatility": float(seg_std),
            "note": note,
        })

    # Probability mapping over emission score
    center = 2.0
    scale = 0.8
    try:
        prob = 1.0 / (1.0 + math.exp(-(emission_score - center) / max(1e-6, scale)))
    except Exception:
        prob = max(0.0, min(1.0, (emission_score / (center + scale))))

    # Confidence via amount of congested minutes
    confidence = "High" if minutes >= 4.0 else ("Medium" if minutes >= 1.5 else "Low")

    # Equivalent idling time per vehicle (directional):
    # emission_score ≈ avg_count * minutes * factor → minutes ≈ emission_score / (avg_count * factor)
    eq_minutes = (emission_score / (avg_count * emission_factor_per_vehicle_min)) if (avg_count and emission_factor_per_vehicle_min) else 0.0
    # Relative comparison: congested minutes vs non-congested minutes in this video (directional)
    relative_ratio = (minutes / max(1e-6, non_congested_minutes)) if (total_minutes and minutes) else 0.0
    congestion_fraction = (minutes / total_minutes) if total_minutes else 0.0

    explanation = (
        "Emission impact is an estimate based on detected vehicles during congestion. "
        f"We observed avg vehicles≈{avg_count:.2f} and congestion time≈{minutes:.2f} min "
        f"out of {total_minutes:.2f} min total ({(congestion_fraction*100.0):.0f}%). "
        f"Using a configurable factor≈{emission_factor_per_vehicle_min:.2f} kg CO₂ / vehicle / minute, "
        f"the estimated score≈{emission_score:.2f}. "
        "This is decision support, not an exact emissions measurement."
    )

    total_frames = int(((payload.get("summary") or {}).get("total_frames")) or len(recent))
    confidence_note = f"{confidence} confidence (stable patterns, {total_frames}+ frames analyzed)."
    return {
        "emission_score": float(emission_score),
        "emission_level": level,
        "alternatives": alternatives,
        "explanation": explanation,
        "probability": float(prob),
        "confidence": confidence,
        "confidence_note": confidence_note,
        "equivalent_idling_minutes": float(eq_minutes),
        "emission_intensity": "Low" if level == "Low Impact" else ("Medium" if level == "Moderate Impact" else "High"),
        "relative_vs_freeflow_ratio": float(relative_ratio),
        "inputs": {
            "avg_count": avg_count,
            "congestion_minutes": minutes,
            "total_minutes": total_minutes,
            "non_congested_minutes": non_congested_minutes,
            "congestion_fraction": congestion_fraction,
            "emission_factor": emission_factor_per_vehicle_min,
            "equivalent_idling_minutes": eq_minutes,
            "medium_frames": med_frames,
            "high_frames": high_frames,
            "congested_frames": cong_frames,
            "total_frames": total_frames,
            "fps": fps,
        },
        "thresholds": {
            "level_bands": [1.0, 3.0],
            "logistic_center": center,
            "logistic_scale": scale,
        },
    }
