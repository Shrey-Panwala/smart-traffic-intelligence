import React from 'react'

// Minimal inline sparkline for smoothed counts
function Sparkline({ series = [] }){
  const w = 120, h = 28
  const vals = series.map(x => Number(x) || 0)
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = Math.max(1e-6, max - min)
  const step = vals.length > 1 ? w / (vals.length - 1) : w
  const points = vals.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / span) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke="#34d399" strokeWidth="2" />
    </svg>
  )
}

export default function RunCard({ item }){
  const created = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : '-'
  const status = String(item.status || 'unknown')
  const congestion = item.overallCongestion || item.overall_congestion || '-'
  const score = item.parkingScore ?? item.overall_parking_score ?? '-'
  const rec = item.recommendation || item.recommendation_text || '-'
  const videoHref = item.processedVideoUrl || (item.processed_video_path ? `/outputs/${String(item.processed_video_path||'').split('/').pop()}` : '')
  const heatmapHref = item.heatmapUrl || (item.heatmap_url ? `/outputs/${String(item.heatmap_url||'').split('/').pop()}` : '')

  const badgeClass = status==='error' ? 'badge-high' : status==='done' ? 'badge-low' : 'badge-medium'

  return (
    <div className="card p-3 h-100 d-flex flex-column" style={{ gap: 8 }}>
      <div className="d-flex justify-content-between align-items-center">
        <div className="small text-secondary">{created}</div>
        <span className={`badge ${badgeClass}`}>{status}</span>
      </div>
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <div className="small text-secondary">Congestion</div>
          <div className="fw-bold">{congestion}</div>
        </div>
        <div>
          <div className="small text-secondary">Parking Score</div>
          <div className="fw-bold">{score}</div>
        </div>
        <div>
          <Sparkline series={(item.series || []).map(x=>x.smoothed_count)} />
        </div>
      </div>
      <div className="small" style={{ maxWidth: 520 }}>{rec}</div>
      <div className="d-flex flex-wrap gap-2 mt-auto">
        {videoHref ? <a className="btn btn-neutral btn-sm" href={videoHref} target="_blank" rel="noreferrer">Overlay</a> : <span className="btn btn-neutral btn-sm disabled">Overlay</span>}
        {heatmapHref ? <a className="btn btn-neutral btn-sm" href={heatmapHref} target="_blank" rel="noreferrer">Artifact</a> : <span className="btn btn-neutral btn-sm disabled">Artifact</span>}
      </div>
    </div>
  )
}
