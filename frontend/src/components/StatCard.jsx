import React from 'react'

export default function StatCard({ label, value, trend, hint, icon=null }){
  return (
    <div className="stat-card kpi-box">
      <div className="d-flex align-items-center justify-content-between">
        <span className="stat-label">{label}</span>
        {icon}
      </div>
      <div className="d-flex align-items-end justify-content-between">
        <div className="stat-value">{value}</div>
        {trend && <div className="stat-trend">{trend}</div>}
      </div>
      {hint && <div className="small text-secondary">{hint}</div>}
    </div>
  )
}
