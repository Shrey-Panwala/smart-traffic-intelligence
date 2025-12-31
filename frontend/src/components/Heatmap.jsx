import React from 'react'

function lerpColor(c1, c2, t){
  const a = parseInt(c1.slice(1),16)
  const b = parseInt(c2.slice(1),16)
  const ar=(a>>16)&0xff, ag=(a>>8)&0xff, ab=a&0xff
  const br=(b>>16)&0xff, bg=(b>>8)&0xff, bb=b&0xff
  const rr = Math.round(ar + (br-ar)*t)
  const rg = Math.round(ag + (bg-ag)*t)
  const rb = Math.round(ab + (bb-ab)*t)
  return `#${(rr<<16 | rg<<8 | rb).toString(16).padStart(6,'0')}`
}

function scaleColor(x){
  // map 0..1 to green->yellow->red
  if(x <= 0.5){
    const t = x/0.5
    return lerpColor('#16a34a', '#f59e0b', t)
  } else {
    const t = (x-0.5)/0.5
    return lerpColor('#f59e0b', '#dc2626', t)
  }
}

export default function Heatmap({ frames=[], valueKey='smoothed_count', bins=50 }){
  const values = frames.map(f => Number(f[valueKey] ?? 0))
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 1
  const safeMax = max === min ? min + 1 : max

  const size = Math.max(1, Math.min(bins, values.length))
  const step = Math.ceil(values.length / size)
  const cells = []
  for(let i=0;i<size;i++){
    const start = i*step
    const slice = values.slice(start, start+step)
    const avg = slice.length ? slice.reduce((a,b)=>a+b,0)/slice.length : 0
    const norm = (avg - min) / (safeMax - min)
    cells.push({ idx: i, avg, norm })
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h6 className="m-0">Traffic Density Heatmap</h6>
        <small className="text-secondary">Low → High</small>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${size}, 1fr)`, gap:'2px' }} aria-label="Traffic density heatmap">
        {cells.map(c => (
          <div key={c.idx} title={`Avg: ${c.avg.toFixed(1)}`} style={{ height:'24px', borderRadius:'2px', backgroundColor: scaleColor(c.norm) }} />
        ))}
      </div>
      <div className="mt-2 d-flex align-items-center" style={{gap:'8px'}}>
        <span className="badge" style={{ background:'#16a34a' }}>Low</span>
        <span className="badge" style={{ background:'#f59e0b' }}>Medium</span>
        <span className="badge" style={{ background:'#dc2626' }}>High</span>
      </div>
    </div>
  )
}
