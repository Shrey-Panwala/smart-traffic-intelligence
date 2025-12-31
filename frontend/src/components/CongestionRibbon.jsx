import React, { useMemo } from 'react'

// Readable, contained congestion ribbon: binned segments with horizontal scroll
export default function CongestionRibbon({ frames = [], valueKey = 'smoothed_count', bins = 120, cellSize = 12, height = 22, onSelectIndex }){
  const cells = useMemo(() => {
    const vals = frames.map(f => Number(f?.[valueKey] ?? 0))
    const min = vals.length ? Math.min(...vals) : 0
    const max = vals.length ? Math.max(...vals) : 1
    const span = Math.max(1e-6, max - min)
    const size = Math.max(1, Math.min(bins, vals.length || bins))
    const step = Math.ceil(Math.max(1, vals.length) / size)
    const out = []
    for(let i=0;i<size;i++){
      const start = i * step
      const slice = vals.slice(start, start + step)
      const avg = slice.length ? slice.reduce((s,x)=>s+x,0) / slice.length : 0
      const t = (avg - min) / span
      const color = t <= 0.5
        ? mix('#16a34a', '#f59e0b', t / 0.5)
        : mix('#f59e0b', '#dc2626', (t - 0.5) / 0.5)
      out.push({ i, start, end: Math.min(vals.length-1, start + step - 1), avg, t, color })
    }
    return out
  }, [frames, valueKey, bins])

  const onClick = (i) => { if(onSelectIndex) onSelectIndex(i) }

  const innerWidth = Math.max(1, cells.length) * (cellSize + 2) // + gap

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="m-0">Congestion Ribbon</h6>
        <small className="text-secondary">Low → High</small>
      </div>
      <div style={{ width:'100%', overflowX:'auto' }}>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(1, cells.length)}, ${cellSize}px)`, gap:'2px', width: innerWidth }} aria-label="Congestion ribbon">
          {cells.map(c => (
            <button key={c.i} title={`Frames ${c.start}-${c.end}\nAvg: ${c.avg.toFixed(1)}`} onClick={() => onClick(c.start)}
              style={{ height: `${height}px`, borderRadius:2, background:c.color, border:'none', cursor: onSelectIndex ? 'pointer' : 'default' }}
              aria-label={`Frames ${c.start}-${c.end}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 d-flex align-items-center" style={{gap:'8px'}}>
        <span className="badge" style={{ background:'#16a34a' }}>Low</span>
        <span className="badge" style={{ background:'#f59e0b' }}>Medium</span>
        <span className="badge" style={{ background:'#dc2626' }}>High</span>
      </div>
    </div>
  )
}

function mix(c1, c2, t){
  const a = parseInt(c1.slice(1),16)
  const b = parseInt(c2.slice(1),16)
  const ar=(a>>16)&0xff, ag=(a>>8)&0xff, ab=a&0xff
  const br=(b>>16)&0xff, bg=(b>>8)&0xff, bb=b&0xff
  const rr = Math.round(ar + (br-ar)*t)
  const rg = Math.round(ag + (bg-ag)*t)
  const rb = Math.round(ab + (bb-ab)*t)
  return `#${(rr<<16 | rg<<8 | rb).toString(16).padStart(6,'0')}`
}
