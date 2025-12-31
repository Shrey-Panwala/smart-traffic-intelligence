import React, { useMemo } from 'react'

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)) }

export default function Gauge({ value=0, min=0, max=100, label='Parking Confidence', subtitle='' }){
  const pct = useMemo(() => {
    const norm = (Number(value) - min) / (max - min || 1)
    return clamp(norm, 0, 1)
  }, [value, min, max])

  const angle = 180 * pct - 90 // -90 .. +90
  const color = pct > 0.66 ? '#10b981' : pct > 0.33 ? '#f59e0b' : '#ef4444'

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 200 120" width="100%" height="100%">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444"/>
            <stop offset="50%" stopColor="#f59e0b"/>
            <stop offset="100%" stopColor="#10b981"/>
          </linearGradient>
        </defs>
        <path d="M10 110 A90 90 0 0 1 190 110" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="14" />
        <path d="M10 110 A90 90 0 0 1 190 110" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${Math.max(1, 283*pct)} 300`} />
        <g transform={`translate(100,110) rotate(${angle})`}>
          <line x1="0" y1="0" x2="0" y2="-86" stroke={color} strokeWidth="4" strokeLinecap="round" />
          <circle cx="0" cy="0" r="5" fill={color} />
        </g>
      </svg>
      <div className="gauge-center">
        <div className="gauge-label">{label}</div>
        <div className="gauge-value">{Math.round(value)}</div>
        {subtitle && <div className="small text-secondary">{subtitle}</div>}
      </div>
    </div>
  )
}
