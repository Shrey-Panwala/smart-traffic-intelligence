import React, { useMemo } from 'react'

// List top congestion windows for quick insights
export default function Hotspots({ frames = [], windowSize = 20, topK = 5 }){
  const windows = useMemo(() => {
    const vals = frames.map(f => Number(f?.smoothed_count ?? f?.vehicle_count ?? 0))
    const N = vals.length
    if(N === 0) return []
    const W = Math.max(1, Math.min(windowSize, Math.floor(N / 3) || 1))
    const agg = []
    for(let i=0;i<N;i+=W){
      const slice = vals.slice(i, i+W)
      const avg = slice.reduce((s,x)=>s+x,0) / slice.length
      agg.push({ start: i, end: Math.min(N-1, i + W - 1), avg })
    }
    const sorted = agg.sort((a,b)=>b.avg-a.avg).slice(0, topK)
    const max = Math.max(...sorted.map(r=>r.avg)) || 1
    return sorted.map(r => ({ ...r, pct: Math.round((r.avg / max) * 100) }))
  }, [frames, windowSize, topK])

  if(!windows.length){
    return <div className="small text-secondary">No hotspots detected.</div>
  }

  return (
    <div>
      <h6 className="mb-2">Top Congestion Hotspots</h6>
      <div className="hotspots-list">
        {windows.map((w, i) => (
          <div key={i} className="hotspots-item">
            <div>
              <div className="fw-bold">Frames {w.start}–{w.end}</div>
              <div className="small text-secondary">Avg vehicles: {w.avg.toFixed(1)}</div>
            </div>
            <div className="d-flex align-items-center" style={{ gap: 10 }}>
              <div className="hotspots-track" title={`${w.pct}% of peak`}>
                <div className="hotspots-fill" style={{ width: `${w.pct}%` }} />
              </div>
              <span className="hotspots-pct">{w.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
