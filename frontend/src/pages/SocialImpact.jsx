import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmergencyImpact, getAccessibilityImpact, getClimateImpact, analyzeTrafficAsync, getProgress } from '../services/api'
import useViewMode from '../util/useViewMode'

export default function SocialImpact(){
  const navigate = useNavigate()
  const [mode, setMode] = useState('emergency')
  const { viewMode, setViewMode } = useViewMode('simple')
  const [techOpen, setTechOpen] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [videoPath, setVideoPath] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const tid = window.localStorage.getItem('lastTaskId') || ''
    const v = window.localStorage.getItem('lastUploadedPath') || ''
    setTaskId(tid)
    setVideoPath(v)
  }, [])

  useEffect(() => {
    // Make Technical view actually feel "visible" (don’t hide everything behind another click).
    if(viewMode === 'technical') setTechOpen(true)
  }, [viewMode])

  useEffect(() => { fetchImpact() }, [mode, taskId, videoPath])

  const fetchImpact = async () => {
    if(!taskId && !videoPath){
      setError('No run found. Provide a video path or run an analysis first.')
      setData(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      if(mode === 'emergency'){
        const res = await getEmergencyImpact({ task_id: taskId, video_path: videoPath })
        setData(res)
      } else if(mode === 'accessibility'){
        const res = await getAccessibilityImpact({ task_id: taskId, video_path: videoPath, entrance_bias: 5 })
        setData(res)
      } else {
        const res = await getClimateImpact({ task_id: taskId, video_path: videoPath })
        setData(res)
      }
    } catch (e){
      // Robust fallback: if we have a video path, run a quick analysis then retry
      if(videoPath){
        try {
          const res = await analyzeTrafficAsync({ video_path: videoPath, save_overlay: false })
          const tid = res.task_id
          setTaskId(tid)
          try { window.localStorage.setItem('lastTaskId', tid) } catch {}
          // Poll until done, then retry impact call
          await new Promise(async (resolve) => {
            const id = setInterval(async () => {
              try {
                const p = await getProgress(tid)
                if(p.status === 'done'){
                  clearInterval(id)
                  resolve(true)
                }
                if(p.status === 'error'){
                  clearInterval(id)
                  resolve(false)
                }
              } catch {}
            }, 800)
          })
          // Retry impact after analysis completes
          return fetchImpact()
        } catch (err){
          setError(String(e.message || 'Impact fetch failed'))
        }
      } else {
        setError(String(e.message || 'Impact fetch failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const goToAnalysis = () => {
    try {
      if(videoPath) window.localStorage.setItem('lastUploadedPath', videoPath)
    } catch {}
    navigate('/analysis')
  }

  const ModeTab = ({ id, label, icon }) => (
    <button type="button" className={`chip ${mode===id? 'fw-bold': ''}`} onClick={()=>setMode(id)} aria-pressed={mode===id}>
      <span style={{ marginRight:6 }}>{icon}</span>{label}
    </button>
  )

  const Badge = ({ type, text }) => {
    const cls = type==='good'? 'decision-good' : type==='warn'? 'decision-warn' : 'decision-bad'
    return <span className={`decision-badge ${cls}`}>{text}</span>
  }

  const modeAccent = mode === 'emergency' ? 'accent-red' : mode === 'accessibility' ? 'accent-blue' : 'accent-green'
  const modeBadgeCls = mode === 'emergency' ? 'badge-red' : mode === 'accessibility' ? 'badge-blue' : 'badge-green'
  const modeIcon = mode === 'emergency' ? '🚑' : mode === 'accessibility' ? '♿' : '🌿'
  const modeTitle = mode === 'emergency' ? 'Emergency Response Intelligence' : mode === 'accessibility' ? 'Accessibility-First Traffic Guidance' : 'Climate Impact Awareness'
  const modePurpose = mode === 'emergency'
    ? 'Purpose: Ambulance & emergency routing support'
    : mode === 'accessibility'
      ? 'Purpose: Elderly, wheelchair & vulnerable users'
      : 'Purpose: Emission-aware urban decisions'

  const simpleBullets = () => {
    if(!data) return []
    if(mode === 'emergency'){
      const safe = String(data.classification||'') === 'Safe'
      const risky = String(data.classification||'') === 'Risky'
      const avg = Number(data?.inputs?.avg_count ?? 0)
      const recentStd = Number(data?.inputs?.recent_std ?? 0)
      const overallStd = Number(data?.inputs?.overall_std ?? 0)
      const slope = Number(data?.inputs?.recent_slope ?? 0)
      return [
        { icon: safe ? '✔' : risky ? '⚠' : '🚫', text: safe ? 'Emergency routing looks feasible: congestion/volatility are within a safer range.' : risky ? 'Emergency routing has moderate risk: expect slowdowns or brief stop‑and‑go.' : 'Avoid emergency routing here right now: congestion/volatility are too high for reliable passage.' },
        { icon: '📊', text: `Key signals: avg vehicles≈${avg.toFixed(1)}, recent volatility (std)≈${recentStd.toFixed(2)}, overall std≈${overallStd.toFixed(2)}, short-term slope≈${slope.toFixed(3)}.` },
        { icon: typeof data.delay_risk_seconds === 'number' && data.delay_risk_seconds > 0 ? '⚠' : '✔', text: typeof data.delay_risk_seconds === 'number' ? `Estimated delay-risk impact ≈ ${Number(data.delay_risk_seconds).toFixed(0)}s (directional).` : 'Delay risk is within normal range.' },
        { icon: (data.recommended_corridors||[]).length ? '✔' : '⚠', text: (data.recommended_corridors||[]).length ? 'Recommended corridor(s) are chosen from the lowest-variability segments (smoother flow tends to be safer for emergency passage).' : 'No clearly low-variability segment found in the recent window.' },
        { icon: '✔', text: `Confidence: ${String(data.confidence||'Medium')}. ${String(data.confidence_note||'')}` },
      ].slice(0,6)
    }
    if(mode === 'accessibility'){
      const rating = String(data.rating||'')
      const caution = /caution/i.test(rating)
      const stdLast = Number(data?.stability_last_60s_std ?? 0)
      const spikes = Number(data?.sudden_spike_count ?? 0)
      const score = Number(data?.accessibility_score ?? 0)
      return [
        { icon: caution ? '⚠' : '✔', text: caution ? 'Accessibility caution: conditions are variable, so pedestrians/wheelchairs may face stop-start interactions.' : 'Accessibility looks favorable: flow is steadier and easier to navigate.' },
        { icon: '📊', text: `Accessibility score: ${score.toFixed(0)}/100. Last ~60s std≈${stdLast.toFixed(2)} with ${spikes} spike(s) (sudden jumps in traffic).` },
        { icon: (spikes > 0 || stdLast > 1.6) ? '⚠' : '✔', text: `Stress indicator: ${String(data.stress_indicator||'n/a')}. Lower volatility generally means fewer abrupt crossings/merges.` },
        { icon: (data.recommended_zones||[]).length ? '✔' : '⚠', text: (data.recommended_zones||[]).length ? 'Suggested low-stress zones are stable segments (lower variability) that are typically safer for vulnerable users.' : 'No clear stable segment was detected in the recent window.' },
        { icon: '✔', text: `Confidence: ${String(data.confidence||'Medium')}. ${String(data.confidence_note||'')}` },
      ].slice(0,6)
    }
    // climate
    const lvl = String(data.emission_level||'')
    const low = /low/i.test(lvl)
    const moderate = /moderate/i.test(lvl)
    const emissionScore = Number(data?.emission_score ?? 0)
    const idling = Number(data?.equivalent_idling_minutes ?? 0)
    const congMin = Number(data?.inputs?.congestion_minutes ?? 0)
    const totalMin = Number(data?.inputs?.total_minutes ?? 0)
    const frac = Number(data?.inputs?.congestion_fraction ?? 0)
    const factor = Number(data?.inputs?.emission_factor ?? 0.23)
    const ratio = Number(data?.relative_vs_freeflow_ratio ?? 0)
    return [
      { icon: low ? '✔' : moderate ? '⚠' : '🚫', text: `Estimated climate impact: ${lvl || 'n/a'} (this is an estimate based on congestion duration + detected vehicles).` },
      { icon: '📊', text: `Congestion time ≈ ${congMin.toFixed(2)} min out of ${totalMin.toFixed(2)} min total (${(frac*100).toFixed(0)}%). Estimated CO₂ score ≈ ${emissionScore.toFixed(2)} using factor ${factor.toFixed(2)} kg CO₂/vehicle/min.` },
      { icon: idling > 2 ? '⚠' : '✔', text: `Equivalent idling per vehicle ≈ ${idling.toFixed(2)} min (directional). Congested vs non-congested time ratio ≈ ${ratio.toFixed(2)}.` },
      { icon: (data.alternatives||[]).length ? '✔' : '⚠', text: (data.alternatives||[]).length ? 'Suggested alternatives are the lowest-density segments (smoother flow typically reduces stop‑and‑go emissions).' : 'No clearly lower-density segment found in the recent window.' },
      { icon: '✔', text: `Confidence: ${String(data.confidence||'Medium')}. ${String(data.confidence_note||'')}` },
    ].slice(0,6)
  }

  return (
    <div className="row g-4">
      <div className="col-12">
        <div className={`card p-4 position-relative ${modeAccent}`}>
          <div className="mode-header">
            <div className="mode-title"><span>{modeIcon}</span><span>{modeTitle}</span></div>
            <span className={`mode-badge ${modeBadgeCls}`}>{modeIcon} {modeTitle.split(' ')[0]} Mode Active</span>
            <div className="d-flex gap-2">
              <ModeTab id="emergency" label="Emergency" icon="🚑" />
              <ModeTab id="accessibility" label="Accessibility" icon="♿" />
              <ModeTab id="climate" label="Climate" icon="🌿" />
            </div>
          </div>
          <div className="mode-banner">{modePurpose}</div>
          <div className="watermark">{modeIcon}</div>
        </div>
      </div>
      {/* Subtle divider for structure without spacing changes */}
      <div className="col-12"><hr /></div>

      <div className="col-12">
        <div className="card p-4">
          <div className="d-flex align-items-center justify-content-between gap-2" style={{ marginBottom: 12 }}>
            <div className="segmented">
              <button
                type="button"
                className={`chip ${viewMode==='simple' ? 'active' : ''}`}
                onClick={()=>setViewMode('simple')}
                aria-pressed={viewMode==='simple'}
              >
                👤 Simple View
              </button>
              <button
                type="button"
                className={`chip ${viewMode==='technical' ? 'active' : ''}`}
                onClick={()=>setViewMode('technical')}
                aria-pressed={viewMode==='technical'}
              >
                🧠 Technical View
              </button>
            </div>
            {viewMode === 'technical' && (
              <button type="button" className="chip" onClick={()=>setTechOpen(v=>!v)} aria-expanded={techOpen}>
                {techOpen ? 'Collapse details' : 'Expand details'}
              </button>
            )}
          </div>

          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <div className="small text-secondary">Video Path (optional if Analysis already ran)</div>
              <input value={videoPath} onChange={(e)=>setVideoPath(e.target.value)} className="form-control" placeholder="backend/uploads/your.mp4" />
            </div>
            <div className="col-12 col-lg-6 d-flex align-items-end gap-2">
              <button className="btn btn-brand" onClick={fetchImpact} disabled={loading}>Compute Impact</button>
              <button className="btn btn-brand" onClick={goToAnalysis} disabled={loading} title="Run analysis and open the Analysis view">▶ Run Analysis</button>
            </div>
          </div>
          {(loading) && <div className="skeleton" style={{ height: 80 }} />}
          {error && <div className="text-danger">{error}</div>}

          {!loading && !error && (
            <div className="row g-3">
              {/* Simple View: concise explanation */}
              {data && viewMode === 'simple' && (
                <div className="col-12">
                  <div className="tech-block" style={{ padding: 12 }}>
                    <div className="small text-secondary" style={{ marginBottom: 8 }}>
                      {modeIcon} {modeTitle} — Simple View
                    </div>
                    <div style={{ display:'grid', gap: 8 }}>
                      {simpleBullets().map((b, i) => (
                        <div key={i} className="d-flex align-items-start gap-2">
                          <div className="xai-icon" aria-hidden style={{ flex: '0 0 auto' }}>{b.icon}</div>
                          <div className="fw-semibold">{b.text}</div>
                        </div>
                      ))}
                    </div>
                    <div className="small text-secondary mt-2">This is decision support, not automated control.</div>
                  </div>
                </div>
              )}

              {/* Technical View: keep existing KPIs but behind an expand/collapse */}
              {data && viewMode === 'technical' && (
                <>
                  <div className="col-12">
                    <div className="tech-block" style={{ padding: 12 }}>
                      <div className="small text-secondary" style={{ marginBottom: 8 }}>
                        {modeIcon} {modeTitle} — Technical Write-up
                      </div>
                      <div className="fw-semibold" style={{ marginBottom: 8 }}>
                        {String(data.explanation || '')}
                      </div>
                      <div className="small text-secondary">
                        What this means: we transform vehicle-count patterns into a risk/impact score using transparent rules, then map that score into a human label.
                      </div>
                      {!techOpen && <div className="small text-secondary mt-2">Expand details for the full metrics breakdown.</div>}
                    </div>
                  </div>

                  {techOpen && (
                    <>
                    {mode === 'emergency' && (
                    <>
                      <div className="col-12 col-lg-6">
                        <div className="d-flex align-items-center gap-2">
                          <Badge type={data.classification==='Safe'? 'good' : (data.classification==='Risky'? 'warn' : 'bad')} text={data.classification==='Safe'? 'Emergency Safe' : (data.classification==='Risky'? 'Proceed with caution' : 'Avoid for Ambulance')} />
                          <span className="chip">Risk Score: {Math.round(Number(data.emergency_risk_score||0))}</span>
                          {typeof data.probability === 'number' && (
                            <span className="chip">Probability: {(data.probability*100).toFixed(0)}%</span>
                          )}
                          {data.confidence && <span className="chip">Confidence: {String(data.confidence)}</span>}
                        </div>
                      </div>
                      <div className="col-12 col-lg-6">
                        <div className="kpi-grid">
                          <div className="kpi-box"><div className="kpi-label">Confidence</div><div className="kpi-value">{String(data.confidence||'')}</div></div>
                          <div className="kpi-box"><div className="kpi-label">Probability</div><div className="kpi-value">{typeof data.probability==='number'? `${(data.probability*100).toFixed(0)}%` : '-'}</div></div>
                          <div className="kpi-box"><div className="kpi-label">Delay Risk</div><div className="kpi-value">{Number(data.delay_risk_seconds||0).toFixed(0)}s</div></div>
                          <div className="kpi-box"><div className="kpi-label">Sensitivity</div><div className="kpi-value">{String(data.response_sensitivity||'')}</div></div>
                        </div>
                        <div className="kv-grid mt-2">
                          {data.inputs && (
                            <>
                              <div className="kv-item"><div className="kv-label">Avg Vehicles</div><div className="kv-value">{Number(data.inputs.avg_count||0).toFixed(1)}</div></div>
                              <div className="kv-item"><div className="kv-label">Recent Std</div><div className="kv-value">{Number(data.inputs.recent_std||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">Overall Std</div><div className="kv-value">{Number(data.inputs.overall_std||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">Slope</div><div className="kv-value">{Number(data.inputs.recent_slope||0).toFixed(3)}</div></div>
                              <div className="kv-item"><div className="kv-label">Δ Volatility</div><div className="kv-value">{Number(data.inputs.volatility_change_pct||0).toFixed(0)}%</div></div>
                              <div className="kv-item"><div className="kv-label">Congestion</div><div className="kv-value">{String(data.inputs.congestion||'')}</div></div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="row g-2">
                          {(data.recommended_corridors||[]).map((c,i) => (
                            <div key={i} className="col-12 col-lg-4">
                              <div className="card p-3">
                                <div className="d-flex align-items-center justify-content-between">
                                  <strong>Corridor #{i+1} • {String(c.label||'')}</strong>
                                  <span className="chip">Safety Rank: {Number(c.safety_rank||i+1)}</span>
                                </div>
                                <div className="small text-secondary">Frames {Number(c.frame_start||0)} → {Number(c.frame_end||0)}</div>
                                <div className="small">Avg vehicles: {Number(c.avg_vehicles||0).toFixed(1)} • Volatility: {Number(c.volatility||0).toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {mode === 'accessibility' && (
                    <>
                      <div className="col-12 col-lg-6">
                        <div className="d-flex align-items-center gap-2">
                          <Badge type={String(data.rating||'').includes('Caution')? 'warn' : 'good'} text={String(data.rating||'')|| 'Accessibility'} />
                          <span className="chip">Score: {Math.round(Number(data.accessibility_score||0))}</span>
                          {data.confidence && <span className="chip">Confidence: {String(data.confidence)}</span>}
                        </div>
                      </div>
                      <div className="col-12 col-lg-6">
                        <div className="kpi-grid">
                          <div className="kpi-box"><div className="kpi-label">Stability Score</div><div className="kpi-value">{Math.round(Number(data.stability_score||0))}</div></div>
                          <div className="kpi-box"><div className="kpi-label">60s Std</div><div className="kpi-value">{Number(data.stability_last_60s_std||0).toFixed(2)}</div></div>
                          <div className="kpi-box"><div className="kpi-label">Spikes</div><div className="kpi-value">{Number(data.sudden_spike_count||0)}</div></div>
                          <div className="kpi-box"><div className="kpi-label">Confidence</div><div className="kpi-value">{String(data.confidence||'')}</div></div>
                        </div>
                        <div className="kv-grid mt-2">
                          {data.inputs && (
                            <>
                              <div className="kv-item"><div className="kv-label">Recent Std</div><div className="kv-value">{Number(data.inputs.recent_std||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">60s Std</div><div className="kv-value">{Number(data.inputs.last_60s_std||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">Spike Threshold</div><div className="kv-value">{Number(data.inputs.spike_threshold||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">Congestion</div><div className="kv-value">{String(data.inputs.congestion||'')}</div></div>
                              <div className="kv-item"><div className="kv-label">Entrance Bias</div><div className="kv-value">{Number(data.inputs.entrance_bias||0).toFixed(1)}</div></div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="row g-2">
                          {(data.recommended_zones||[]).map((c,i) => (
                            <div key={i} className="col-12 col-lg-4">
                              <div className="card p-3">
                                <div className="d-flex align-items-center justify-content-between">
                                  <strong>Zone #{i+1}</strong>
                                  <span className="chip">Low-Stress</span>
                                </div>
                                <div className="small text-secondary">Frames {c.frame_start} → {c.frame_end}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {mode === 'climate' && (
                    <>
                      <div className="col-12 col-lg-6">
                        <div className="d-flex align-items-center gap-2">
                          <Badge type={String(data.emission_level||'').includes('Low')? 'good' : (String(data.emission_level||'').includes('Moderate')? 'warn' : 'bad')} text={String(data.emission_level||'')|| 'Climate'} />
                          <span className="chip">CO₂ Score: {Number(data.emission_score||0).toFixed(2)}</span>
                          {data.confidence && <span className="chip">Confidence: {String(data.confidence)}</span>}
                        </div>
                      </div>
                      <div className="col-12 col-lg-6">
                        <div className="kpi-grid">
                          <div className="kpi-box"><div className="kpi-label">Confidence</div><div className="kpi-value">{String(data.confidence||'')}</div></div>
                          <div className="kpi-box"><div className="kpi-label">Eq. Idling</div><div className="kpi-value">{Number(data.equivalent_idling_minutes||0).toFixed(1)}m</div></div>
                          <div className="kpi-box"><div className="kpi-label">Intensity</div><div className="kpi-value">{String(data.emission_intensity||'')}</div></div>
                          <div className="kpi-box"><div className="kpi-label">vs Free-Flow</div><div className="kpi-value">~{Number(data.relative_vs_freeflow_ratio||0).toFixed(1)}×</div></div>
                        </div>
                        <div className="kv-grid mt-2">
                          {data.inputs && (
                            <>
                              <div className="kv-item"><div className="kv-label">Avg Vehicles</div><div className="kv-value">{Number(data.inputs.avg_count||0).toFixed(1)}</div></div>
                              <div className="kv-item"><div className="kv-label">Minutes</div><div className="kv-value">{Number(data.inputs.congestion_minutes||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">Factor</div><div className="kv-value">{Number(data.inputs.emission_factor||0).toFixed(2)}</div></div>
                              <div className="kv-item"><div className="kv-label">Eq. Idling</div><div className="kv-value">{Number(data.inputs.equivalent_idling_minutes||0).toFixed(2)}m</div></div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="col-12">
                        <div className="row g-2">
                          {(data.alternatives||[]).map((c,i) => (
                            <div key={i} className="col-12 col-lg-4">
                              <div className="card p-3">
                                <div className="d-flex align-items-center justify-content-between">
                                  <strong>Alternative #{i+1}</strong>
                                  <span className="chip">Lower Emission</span>
                                </div>
                                <div className="small text-secondary">Frames {Number(c.frame_start||0)} → {Number(c.frame_end||0)}</div>
                                <div className="small">Avg vehicles: {Number(c.avg_vehicles||0).toFixed(1)} • Volatility: {Number(c.volatility||0).toFixed(2)} • Reason: {String(c.note||'')}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                    </>
                  )}

                  <div className="col-12">
                    <div className="small text-secondary">This is decision support, not automated control.</div>
                  </div>
                </>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
