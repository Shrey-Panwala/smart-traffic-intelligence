import React, { useEffect, useState } from 'react'
import { analyzeTrafficAsync, getProgress } from '../services/api'
import { saveAnalysisForCurrentUser } from '../services/firebase'
import AreaChartSmooth from '../components/AreaChartSmooth'
import Gauge from '../components/Gauge'
import HeatmapPlayer from '../components/HeatmapPlayer'
import CongestionRibbon from '../components/CongestionRibbon'
import Hotspots from '../components/Hotspots'
import XAIExplain from '../components/XAIExplain'
import { useChatContext } from '../context/ChatContext'
import useViewMode from '../util/useViewMode'

export default function Analysis(){
  const { setAnalysisData } = useChatContext()
  const { viewMode } = useViewMode('simple')
  const [videoPath, setVideoPath] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [taskId, setTaskId] = useState('')
  const [progress, setProgress] = useState({ processed: 0, total: null, percentage: null })
  const [poller, setPoller] = useState(null)
  const auditUrl = (
    import.meta.env.VITE_AUDIT_SHEET_URL ||
    (import.meta.env.VITE_GOOGLE_SHEETS_ID ? `https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEETS_ID}/edit#gid=0` : '')
  )

  useEffect(() => {
    const path = window.localStorage.getItem('lastUploadedPath')
    if(path) setVideoPath(path)
  }, [])

  useEffect(() => {
    if(videoPath && !data && !loading){
      onAnalyze()
    }
  }, [videoPath])

  useEffect(() => {
    return () => { if(poller) clearInterval(poller) }
  }, [poller])

  const onAnalyze = async () => {
    if(!videoPath) return
    setLoading(true)
    setError('')
    try {
      const res = await analyzeTrafficAsync({ video_path: videoPath, save_overlay: false })
      setTaskId(res.task_id)
      try { window.localStorage.setItem('lastTaskId', res.task_id) } catch {}
      setProgress(res.progress || { processed: 0, total: null, percentage: null })
      const id = setInterval(async () => {
        try {
          const p = await getProgress(res.task_id)
          setProgress({ processed: p.processed || 0, total: p.total || null, percentage: p.percentage || null })
          if(p.status === 'done'){
            clearInterval(id)
            setPoller(null)
            setData(p.result)
            try { setAnalysisData(p.result) } catch {}
            try { await saveAnalysisForCurrentUser(p.result) } catch {}
            setLoading(false)
          } else if(p.status === 'error'){
            clearInterval(id)
            setPoller(null)
            setError(p.error || 'Analysis error')
            setLoading(false)
          }
        } catch(e){
          // keep polling despite transient errors
        }
      }, 1000)
      setPoller(id)
    } catch(err){
      setError('Analysis failed: ' + err.message)
      setLoading(false)
    } finally {
      // loading cleared when progress indicates done
    }
  }

  // Derived metrics and helpers
  const frames = Array.isArray(data?.frames) ? data.frames : []
  const snapshots = Array.isArray(data?.snapshots) ? data.snapshots : []

  const chartData = frames.map((f, i) => ({
    frame: i,
    vehicle_count: Number(f?.vehicle_count ?? 0),
    smoothed_count: Number(f?.smoothed_count ?? f?.vehicle_count ?? 0),
  }))

  const congestion = String(data?.overall_congestion || 'Low')
  const parkingScore = Number(data?.overall_parking_score ?? 0)
  const rec = String(data?.recommendation_text || (parkingScore < 0 || /high/i.test(congestion) ? 'Avoid parking' : 'Okay to park'))

  const toTrend3 = (raw) => {
    const v = String(raw || 'Stable')
    if(v === 'Worsening') return 'Increasing'
    if(v === 'Improving') return 'Decreasing'
    if(v === 'Increasing' || v === 'Decreasing' || v === 'Stable') return v
    return 'Stable'
  }
  const trend3 = toTrend3(data?.trend_outlook)
  const tInfo = {
    Stable:   { icon: '➖', colorClass: 'badge-blue', text: 'Traffic is holding steady.' },
    Increasing: { icon: '⬆', colorClass: 'badge-red', text: 'Traffic is rising; expect more congestion soon.' },
    Decreasing: { icon: '⬇', colorClass: 'badge-green', text: 'Traffic is easing in the short term.' },
  }[trend3]

  const techTrend = (() => {
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
  })()

  const decisionBadge = (recText, cong) => {
    const avoid = /avoid/i.test(recText) || /high/i.test(cong) || parkingScore < 0
    const warn = /caution|medium/i.test(recText) || /medium/i.test(cong)
    const cls = avoid ? 'decision-bad' : warn ? 'decision-warn' : 'decision-good'
    const icon = avoid ? '🚫' : warn ? '⚠' : '✔'
    return (
      <span className={`decision-badge ${cls}`}>{icon} {recText || 'n/a'}</span>
    )
  }

  return (
    <div className="row g-4">
      <div className="col-12">
        <div className="card p-4">
          <h5>Run Analysis</h5>
          <input value={videoPath} onChange={(e)=>setVideoPath(e.target.value)} className="form-control" placeholder="backend/uploads/your.mp4" />
          <button className="btn btn-brand mt-3" onClick={onAnalyze} disabled={!videoPath || loading}>{loading ? 'Running…' : 'Run Analysis'}</button>
          {error && <p className="mt-2 text-danger">{error}</p>}
          {loading && (
            <div className="mt-3">
              <div className="d-flex justify-content-between">
                <span className="text-secondary">Progress</span>
                <span className="text-secondary">
                  {progress.percentage != null ? `${progress.percentage.toFixed(1)}%` : 'estimating…'}
                </span>
              </div>
              <div className="progress" role="progressbar" aria-valuenow={progress.percentage || 0} aria-valuemin="0" aria-valuemax="100">
                <div className="progress-bar" style={{ width: `${progress.percentage || 0}%` }}></div>
              </div>
              <div className="mt-1 text-secondary">
                {progress.percentage != null && progress.percentage >= 100 ? 'Finalizing results…' : ''}
              </div>
              <div className="mt-1 text-secondary">
                {progress.total ? `${progress.processed} / ${progress.total} frames` : `${progress.processed} frames processed`}
              </div>
            </div>
          )}
        </div>
      </div>

      {data && (
        <div className="col-12">
          <div className="card p-3 d-flex flex-row align-items-center" style={{gap:12}}>
            <span className="badge text-bg-success" title="This analysis is recorded in an auditable AI decision log.">
              📊 Decision logged for transparency
            </span>
            {auditUrl ? (
              <a className="btn btn-outline-secondary btn-sm" href={auditUrl} target="_blank" rel="noopener noreferrer">
                View Public Audit Log
              </a>
            ) : null}
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="col-12 col-xl-6">
            <div className="card p-4 h-100">
              <h5>Snapshots Timeline</h5>
              <HeatmapPlayer snapshots={snapshots} />
              <div className="mt-4">
                <CongestionRibbon frames={data.frames || []} valueKey="smoothed_count" bins={120} cellSize={12} height={20} onSelectIndex={(i)=>{/* future: hook into player seek */}} />
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-6">
            <div className="card p-4 h-100 d-flex flex-column" style={{gap:12}}>
              {/* Top: Parking Confidence centered */}
              <div className="card p-4 text-center d-flex flex-column align-items-center justify-content-center">
                <h5 className="mb-2">Parking Confidence</h5>
                <Gauge value={parkingScore} min={-50} max={100} label="Confidence" subtitle={congestion} />
                <div className="mt-3">
                  {decisionBadge(rec, congestion)}
                </div>
              </div>

              {/* Middle: Top Congestion Hotspots */}
              <div className="card p-3">
                <Hotspots frames={data.frames || []} />
              </div>

              {/* Bottom: Short-Term Trend Outlook */}
              <div className="card p-3">
                <h6 className="mb-2 d-flex align-items-center gap-2">
                  <span>Short-Term Trend Outlook</span>
                  <span title="Based on recent behavior in this video session only; indicates near-future (a few minutes) traffic direction.">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-info-circle" viewBox="0 0 16 16">
                      <path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14m0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16"/>
                      <path d="M8.93 6.588 8 6.5c-.5 0-.9.4-.9.9v3.2c0 .5.4.9.9.9s.9-.4.9-.9V7.5c0-.46-.37-.84-.84-.912z"/>
                      <circle cx="8" cy="4.5" r="1"/>
                    </svg>
                  </span>
                </h6>
                <div className="row g-2">
                  <div className="col-12">
                    <div className="small text-secondary">Outlook</div>
                    <div className="fw-bold">{trend3} {tInfo.icon}</div>
                  </div>
                  <div className="col-12">
                    <div className="small text-secondary">Confidence</div>
                    <div className="fw-bold">{data.trend_confidence || 'Low'}</div>
                  </div>
                  <div className="col-12">
                    <div className="small text-secondary">Explanation</div>
                    <div>
                      <div className="d-flex align-items-center gap-2" style={{ marginBottom: 6 }}>
                        <span className={`mode-badge ${tInfo.colorClass}`}>Trend {tInfo.icon}</span>
                        <span className="small text-secondary">Consumer View</span>
                      </div>
                      <div>{tInfo.text}</div>
                      {viewMode === 'technical' && (
                        <div className="mt-2">
                          <div className="d-flex align-items-center gap-2" style={{ marginBottom: 6 }}>
                            <span className="chip muted">Technical View</span>
                            <span className="small text-secondary">(computed from recent smoothed counts)</span>
                          </div>
                          <div className="tech-block mono" style={{ whiteSpace:'pre-wrap' }}>
{`Trend Detection:
• Recent slope: ${techTrend ? techTrend.slope.toFixed(3) : 'n/a'}
• Volatility change: ${techTrend ? (techTrend.volChangePct >= 0 ? '+' : '') + techTrend.volChangePct.toFixed(0) + '%' : 'n/a'}
• Classification: ${trend3}`}
                          </div>
                        </div>
                      )}
                      <div className="small text-secondary mt-2">This is decision support, not automated control.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="card p-4">
              <h5>Vehicle Count Timeline</h5>
              <AreaChartSmooth data={chartData} />
            </div>
          </div>

          <div className="col-12">
            <div className="card p-4">
              <XAIExplain data={data} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
