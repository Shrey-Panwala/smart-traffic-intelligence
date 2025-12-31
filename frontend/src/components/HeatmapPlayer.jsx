import React, { useEffect, useMemo, useRef, useState } from 'react'

export default function HeatmapPlayer({ snapshots=[], heatmapUrl='', intervalMs=300, onFrameChange }){
  const [idx, setIdx] = useState(0)
  const timerRef = useRef(null)
  const hasSnaps = snapshots && snapshots.length > 0

  useEffect(() => {
    stop()
    if(hasSnaps){ play() }
    return stop
  }, [hasSnaps])

  const stop = () => { if(timerRef.current){ clearInterval(timerRef.current); timerRef.current = null } }
  const play = () => {
    if(timerRef.current) return
    timerRef.current = setInterval(() => {
      setIdx((i) => {
        const next = (i + 1) % snapshots.length
        if(onFrameChange) onFrameChange(next)
        return next
      })
    }, Math.max(120, intervalMs))
  }

  const onScrub = (e) => {
    const v = Number(e.target.value || 0)
    setIdx(v)
    if(onFrameChange) onFrameChange(v)
  }

  // Only show snapshots; heatmapUrl fallback removed for clarity
  const currentSrc = hasSnaps ? snapshots[idx] : null

  return (
    <div>
      <div className="position-relative" style={{ borderRadius: 12, overflow:'hidden', border:'1px solid rgba(148,163,184,0.18)' }}>
        {currentSrc ? (
          <img src={currentSrc} alt="Snapshot" style={{ width:'100%', display:'block' }}/>
        ) : (
          <div className="skeleton" style={{ height: 240 }} />
        )}
        {hasSnaps && (
          <div style={{ position:'absolute', top:8, right:8 }} className="chip">{idx+1} / {snapshots.length}</div>
        )}
      </div>
      {hasSnaps && (
        <div className="d-flex align-items-center gap-2 mt-2">
          <button className="btn btn-neutral btn-sm" onClick={play}>Play</button>
          <button className="btn btn-neutral btn-sm" onClick={stop}>Pause</button>
          <input type="range" min={0} max={Math.max(0, snapshots.length-1)} value={idx} onChange={onScrub} style={{ flex:1 }}/>
          <span className="small text-secondary">Timeline</span>
        </div>
      )}
      <div className="small text-secondary mt-1">Legend: low → high congestion</div>
    </div>
  )
}
