import React, { useEffect, useMemo, useState } from 'react'
import useViewMode from '../util/useViewMode'

export default function XAIExplain({ data }){
  const [open, setOpen] = useState(true)
  const [techOpen, setTechOpen] = useState(false)
  const { viewMode, setViewMode } = useViewMode('simple')

  const summary = data?.summary || {}
  const settings = data?.settings || {}
  const frames = Array.isArray(data?.frames) ? data.frames : []
  const lastFrame = frames.length ? frames[frames.length - 1] : null
  const lastXai = lastFrame?.xai || null

  useEffect(() => {
    // If the user switches to Technical, show the details immediately.
    if(viewMode === 'technical') setTechOpen(true)
  }, [viewMode])

  const toTrend3 = (raw) => {
    const v = String(raw || 'Stable')
    if(v === 'Worsening') return 'Increasing'
    if(v === 'Improving') return 'Decreasing'
    if(v === 'Increasing' || v === 'Decreasing' || v === 'Stable') return v
    return 'Stable'
  }

  const trend = useMemo(() => {
    const t = toTrend3(data?.trend_outlook)
    const mapping = {
      Stable: { icon: '➖', type: 'info', label: 'Stable' },
      Increasing: { icon: '⬆', type: 'bad', label: 'Increasing' },
      Decreasing: { icon: '⬇', type: 'good', label: 'Decreasing' },
    }
    return mapping[t] || mapping.Stable
  }, [data?.trend_outlook])

  const techTrend = useMemo(() => {
    // Lightweight technical metrics computed client-side from smoothed counts
    const N = Math.min(frames.length, 90)
    if(N < 6) return null
    const window = frames.slice(frames.length - N)
    const ys = window.map(f => Number(f?.smoothed_count ?? f?.vehicle_count ?? 0))
    const first = ys[0]
    const last = ys[ys.length - 1]
    const slope = (last - first) / Math.max(1, ys.length - 1)

    const mid = Math.floor(ys.length / 2)
    const a = ys.slice(0, mid)
    const b = ys.slice(mid)
    const std = (arr) => {
      if(!arr.length) return 0
      const mean = arr.reduce((s,x)=>s+x,0) / arr.length
      const v = arr.reduce((s,x)=>s+((x-mean)**2),0) / arr.length
      return Math.sqrt(v)
    }
    const stdA = std(a)
    const stdB = std(b)
    const volChangePct = stdA > 0 ? ((stdB - stdA) / stdA) * 100 : 0

    return { slope, volChangePct, N }
  }, [frames])

  const congestion = String(data?.overall_congestion || 'Low')
  const parkingScore = Number(data?.overall_parking_score ?? 0)
  const rec = String(data?.recommendation_text || '')
  const conf = String(data?.trend_confidence || 'Medium')

  const simpleBullets = useMemo(() => {
    const bullets = []

    const avg = Number(summary.avg_count ?? 0)
    const median = Number(summary.median_count ?? 0)
    const p95 = Number(summary.p95_count ?? 0)
    const stdCount = Number(summary.std_count ?? 0)
    const totalFrames = Number(summary.total_frames ?? frames.length ?? 0)
    const fps = summary.fps ? Number(summary.fps) : null
    const dur = summary.duration_seconds ? Number(summary.duration_seconds) : null
    const durationText = dur ? `${dur.toFixed(1)}s` : (fps && totalFrames ? `${(totalFrames / fps).toFixed(1)}s` : 'n/a')
    const currentCount = Number(lastFrame?.vehicle_count ?? 0)
    const currentSmooth = Number(lastFrame?.smoothed_count ?? currentCount)
    const win = Number(settings.smoothing_window ?? 5)

    // 1) What we observed (with simple stats)
    bullets.push({
      icon: '📊',
      text: `Observed ~${avg.toFixed(1)} vehicles/frame on average (median ${median.toFixed(1)}), over ${totalFrames} frames (${durationText}). Latest frame: ${currentCount} (smoothed ${currentSmooth.toFixed(1)} using a ${win}-frame rolling mean).`,
    })

    // 2) Congestion + near-term direction
    bullets.push({
      icon: congestion === 'High' ? '🚫' : congestion === 'Medium' ? '⚠' : '✔',
      text: `Congestion is classified as ${congestion} using simple thresholds (≤5 Low, ≤20 Medium, >20 High). Short-term direction looks ${trend.label.toLowerCase()} ${trend.icon}.`,
    })

    // 3) Stability / noise (why we smooth)
    const smooth = stdCount <= 2.0
    bullets.push({
      icon: smooth ? '✔' : '⚠',
      text: smooth
        ? `Counts are fairly stable (std ≈ ${stdCount.toFixed(2)}), so short spikes are limited.`
        : `Counts are variable (std ≈ ${stdCount.toFixed(2)}), so smoothing helps avoid reacting to momentary surges.`,
    })

    // 4) Parking decision with baseline + penalty
    const isAvoid = /avoid/i.test(rec) || congestion === 'High' || parkingScore < 0
    const penalty = congestion === 'High' ? 30 : congestion === 'Medium' ? 10 : 0
    bullets.push({
      icon: isAvoid ? '🚫' : congestion === 'Medium' ? '⚠' : '✔',
      text: `Parking decision is based on a “busy baseline” (95th percentile ≈ ${p95.toFixed(1)}) minus the latest count, then a congestion penalty (Low 0 / Medium 10 / High 30). Result: score ${parkingScore} → ${rec || 'n/a'}.`,
    })

    // 5) Spike risk indicator
    const spikes = (p95 - median) >= 6
    bullets.push({
      icon: spikes ? '⚠' : '✔',
      text: spikes
        ? `We saw occasional surges (95th percentile is ${Math.max(0, (p95 - median)).toFixed(1)} above the median), so conditions may flip quickly.`
        : 'No strong surge pattern detected in this session; conditions are less likely to swing abruptly.',
    })

    // 6) Confidence
    bullets.push({ icon: '✔', text: `Confidence (short-term): ${conf}. This describes the recent video window only.` })
    return bullets.slice(0, 6)
  }, [congestion, trend, summary, rec, parkingScore, conf, frames.length, lastFrame, settings.smoothing_window])

  const techText = useMemo(() => {
    const model = settings.model || 'YOLOv8'
    const confThr = typeof settings.conf_threshold === 'number' ? settings.conf_threshold : Number(settings.conf_threshold || 0.4)
    const totalFrames = Number(summary.total_frames ?? frames.length ?? 0)
    const fps = summary.fps ? Number(summary.fps) : null
    const dur = summary.duration_seconds ? Number(summary.duration_seconds) : null
    const durationPart = (dur && fps) ? `${dur.toFixed(1)}s @ ${fps.toFixed(0)} FPS` : (dur ? `${dur.toFixed(1)}s` : 'n/a')
    const avg = Number(summary.avg_count ?? 0)
    const std = Number(summary.std_count ?? 0)
    const mx = Number(summary.max_count ?? 0)
    const p95 = Number(summary.p95_count ?? 0)
    const win = Number(settings.smoothing_window ?? 5)

    const low = Number(summary.low_frames ?? 0)
    const med = Number(summary.medium_frames ?? 0)
    const high = Number(summary.high_frames ?? 0)
    const pct = (n) => (totalFrames ? (n / totalFrames) * 100 : 0)
    const lastVc = Number(lastFrame?.vehicle_count ?? 0)
    const lastSm = Number(lastFrame?.smoothed_count ?? lastVc)
    const lastBase = Number(lastXai?.baseline_95p ?? p95)
    const lastPen = Number(lastXai?.congestion_penalty ?? (congestion === 'High' ? 30 : congestion === 'Medium' ? 10 : 0))
    const lastFinal = Number(lastXai?.final_score ?? parkingScore)

    const lines = []
    lines.push('Explainable AI — Technical Summary')
    lines.push('')
    lines.push(`Model: ${model} (confidence ≥ ${confThr.toFixed(2)})`)
    lines.push(`Frames Analyzed: ${totalFrames} (${durationPart})`)
    lines.push('')
    lines.push('Traffic Metrics:')
    lines.push(`• Avg Vehicles/Frame: ${avg.toFixed(2)}`)
    lines.push(`• Std Deviation: ${std.toFixed(2)}`)
    lines.push(`• Max Vehicles: ${mx}`)
    lines.push(`• 95th Percentile: ${p95.toFixed(1)}`)
    lines.push(`• Congestion Mix: Low ${pct(low).toFixed(1)}% | Medium ${pct(med).toFixed(1)}% | High ${pct(high).toFixed(1)}%`)
    lines.push('')
    lines.push('Smoothing:')
    lines.push(`• Rolling Mean Window: ${win} frames`)
    lines.push('')
    lines.push('Congestion Logic:')
    lines.push('• Low ≤ 5 | Medium ≤ 20 | High > 20')
    lines.push(`• Current Class: ${congestion}`)
    lines.push('')
    lines.push('Decision (latest frame):')
    lines.push(`• Observed vehicles: ${lastVc} (smoothed ${lastSm.toFixed(1)})`)
    lines.push(`• Baseline (95p): ${Number(lastBase || 0).toFixed(1)} | Penalty: ${lastPen}`)
    lines.push(`• Final score: ${lastFinal} | Recommendation: ${rec || 'n/a'}`)
    lines.push(`• Trend: ${trend.label}`)
    if(techTrend){
      lines.push('')
      lines.push('Trend Detection (client computed):')
      lines.push(`• Recent slope: ${techTrend.slope.toFixed(3)}`)
      lines.push(`• Volatility change: ${techTrend.volChangePct >= 0 ? '+' : ''}${techTrend.volChangePct.toFixed(0)}%`)
      lines.push(`• Classification: ${trend.label}`)
    }
    if(data?.trend_explanation){
      lines.push('')
      lines.push('Trend Explanation (backend):')
      lines.push(String(data.trend_explanation))
    }
    if(lastXai?.explanation_text){
      lines.push('')
      lines.push('Parking Reasoning (backend, latest frame):')
      lines.push(String(lastXai.explanation_text))
    }
    lines.push('')
    lines.push('Note: This is decision support, not automated control.')
    return lines.join('\n')
  }, [settings, summary, frames.length, techTrend, congestion, parkingScore, rec, trend.label, lastFrame, lastXai, data?.trend_explanation])

  const copyTech = async () => {
    try{
      await navigator.clipboard.writeText(techText)
    }catch{
      try{
        const ta = document.createElement('textarea')
        ta.value = techText
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }catch{}
    }
  }

  return (
    <div className="xai-panel">
      <div className="xai-header" onClick={() => setOpen(v=>!v)}>
        <div className="d-flex align-items-center gap-2">
          <strong>Explainable AI</strong>
          <span className="chip muted">Why this decision?</span>
        </div>
        <button className="icon-btn" aria-label="toggle">
          {open ? '–' : '+'}
        </button>
      </div>
      {open && (
        <div className="xai-items">
          <div className="d-flex align-items-center justify-content-between gap-2" style={{ marginBottom: 10 }}>
            <div className="segmented">
              <button
                type="button"
                className={`chip ${viewMode==='simple' ? 'active' : ''}`}
                onClick={(e)=>{ e.stopPropagation(); setViewMode('simple') }}
                aria-pressed={viewMode==='simple'}
              >
                👤 Simple View
              </button>
              <button
                type="button"
                className={`chip ${viewMode==='technical' ? 'active' : ''}`}
                onClick={(e)=>{ e.stopPropagation(); setViewMode('technical') }}
                aria-pressed={viewMode==='technical'}
              >
                🧠 Technical View
              </button>
            </div>
            <div className="small text-secondary">This is decision support, not automated control.</div>
          </div>

          {viewMode === 'simple' && (
            <div className="tech-block" style={{ padding: 12 }}>
              <div className="small text-secondary" style={{ marginBottom: 8 }}>Explainable AI — Simple Explanation</div>
              <div style={{ display:'grid', gap: 8 }}>
                {simpleBullets.map((b, i) => (
                  <div key={i} className="d-flex align-items-start gap-2">
                    <div className="xai-icon" aria-hidden style={{ flex: '0 0 auto' }}>{b.icon}</div>
                    <div className="fw-semibold">{b.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'technical' && (
            <div>
              <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 8 }}>
                <div className="small text-secondary">Explainable AI — Technical Details</div>
                <div className="d-flex gap-2">
                  <button type="button" className="chip muted" onClick={copyTech}>Copy</button>
                  <button type="button" className="chip" onClick={()=>setTechOpen(v=>!v)} aria-expanded={techOpen}>
                    {techOpen ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>
              <div className="tech-block mono" style={{ whiteSpace:'pre-wrap' }}>{techText}</div>
              {!techOpen && (
                <div className="small text-secondary mt-2">Tip: Expand to keep this panel open while you scroll.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
