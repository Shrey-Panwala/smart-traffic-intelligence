import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import StatCard from '../components/StatCard'
import { useChatContext } from '../context/ChatContext'
import { getProgress } from '../services/api'

export default function Home(){
  const { analysisData, setAnalysisData } = useChatContext()
  const [latest, setLatest] = useState(null)

  // Try to hydrate from the last task if the app was refreshed
  useEffect(() => {
    if(analysisData){
      setLatest(analysisData)
      return
    }
    try{
      const lastTaskId = window.localStorage.getItem('lastTaskId')
      if(lastTaskId){
        getProgress(lastTaskId).then(p => {
          if(p?.status === 'done' && p?.result){
            setLatest(p.result)
            try{ setAnalysisData(p.result) }catch{}
          }
        }).catch(()=>{})
      }
    }catch{}
  }, [analysisData, setAnalysisData])

  const cards = useMemo(() => {
    const data = latest || analysisData
    if(!data){
      return [
        { label: 'Avg Vehicles / Frame', value: '—', hint: 'Updates after analysis', icon: <span role="img" aria-label="vehicles">🚗</span> },
        { label: 'Congestion', value: '—', hint: 'Low / Medium / High', icon: <span role="img" aria-label="traffic light">🚥</span> },
        { label: 'Parking Confidence', value: '—', hint: 'Score-based', icon: <span role="img" aria-label="parking">🅿️</span> },
      ]
    }
    const s = data.summary || {}
    const avg = Number(s.avg_count || 0).toFixed(2)
    const cong = data.overall_congestion || '—'
    const score = Number(data.overall_parking_score || 0)
    const trend = data.trend_outlook ? `Trend: ${data.trend_outlook}` : ''
    return [
      { label: 'Avg Vehicles / Frame', value: avg, hint: s.total_frames ? `${s.total_frames} frames` : '—', icon: <span role="img" aria-label="vehicles">🚗</span> },
      { label: 'Congestion', value: cong, hint: 'Low / Medium / High', icon: <span role="img" aria-label="traffic light">🚥</span> },
      { label: 'Parking Confidence', value: String(score), hint: trend, icon: <span role="img" aria-label="parking">🅿️</span> },
    ]
  }, [latest, analysisData])

  return (
    <div className="row g-4">
      <div className="col-12">
        <div className="hero">
          <div className="glow" />
          <div className="d-flex align-items-center justify-content-between flex-wrap" style={{ gap: 16 }}>
            <div>
              <div className="hero-title">Real-time Traffic Intelligence & Smart Parking Decisions</div>
              <div className="hero-sub">Understand congestion at a glance. Decide where to park in seconds.</div>
              <div className="mt-3 d-flex align-items-center gap-2">
                <Link to="/upload" className="btn btn-brand">Upload Video</Link>
                <Link to="/analysis" className="btn btn-neutral">Run Analysis</Link>
              </div>
            </div>
            <div className="kpi-grid" style={{ minWidth: 300 }}>
              {cards.map((c, i) => (
                <StatCard key={i} label={c.label} value={c.value} hint={c.hint} icon={c.icon} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions removed to avoid duplication with navbar */}
    </div>
  )
}
