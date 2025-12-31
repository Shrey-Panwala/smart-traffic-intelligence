import React from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function AreaChartSmooth({ data=[], xKey='frame', yKeys=[{key:'vehicle_count', color:'#60a5fa'},{key:'smoothed_count', color:'#34d399'}] }){
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {yKeys.map((s, i) => (
              <linearGradient key={i} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.5}/>
                <stop offset="100%" stopColor={s.color} stopOpacity={0.05}/>
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#1f2937" strokeDasharray="5 5" />
          <XAxis dataKey={xKey} stroke="#9ca3af" tick={{ fill:'#9ca3af' }} />
          <YAxis stroke="#9ca3af" tick={{ fill:'#9ca3af' }} />
          <Tooltip contentStyle={{ background:'rgba(2,6,23,0.9)', border:'1px solid rgba(148,163,184,0.26)', borderRadius:8 }} labelStyle={{ color:'#93c5fd' }} />
          {yKeys.map((s, i) => (
            <Area key={i} type="monotone" dataKey={s.key} stroke={s.color} fill={`url(#grad-${s.key})`} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
