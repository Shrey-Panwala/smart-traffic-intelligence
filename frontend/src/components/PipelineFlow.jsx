import React from 'react'
import { Link } from 'react-router-dom'

// Replaces the old non-interactive chips with attractive, useful quick-action tiles.
export default function PipelineFlow(){
  const actions = [
    {
      to: '/upload',
      title: 'Upload Video',
      desc: 'Add an MP4 to analyze congestion and parking suitability.',
      emoji: '📤',
      bg: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(14,165,233,0.10))'
    },
    {
      to: '/analysis',
      title: 'Run Analysis',
      desc: 'Generate counts, smoothing, heatmap, overlay, and XAI.',
      emoji: '⚙️',
      bg: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.10))'
    },
    {
      to: '/analyses',
      title: 'My Runs',
      desc: 'Browse your previous runs and quickly reopen results.',
      emoji: '🗂️',
      bg: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(34,197,94,0.10))'
    },
    {
      to: '/impact',
      title: 'Social Impact',
      desc: 'Emergency access, accessibility, and climate insights.',
      emoji: '🌍',
      bg: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(250,204,21,0.10))'
    },
    {
      to: '/architecture',
      title: 'Architecture',
      desc: 'Understand the YOLOv8 pipeline and metrics used.',
      emoji: '🧠',
      bg: 'linear-gradient(135deg, rgba(236,72,153,0.15), rgba(244,63,94,0.10))'
    },
  ]

  return (
    <div className="card p-3">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h6 className="m-0">Quick Actions</h6>
        <span className="text-secondary small">Jump right into common tasks</span>
      </div>

      <div className="row g-3">
        {actions.map((a, idx) => (
          <div key={idx} className="col-12 col-sm-6 col-lg-4">
            <Link to={a.to} className="text-decoration-none">
              <div className="h-100 p-3 rounded-3 border" style={{ background: a.bg, borderColor: 'rgba(148,163,184,0.25)' }}>
                <div className="d-flex align-items-start" style={{ gap: 12 }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{a.emoji}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{a.title}</div>
                    <div className="text-secondary" style={{ fontSize: 13 }}>{a.desc}</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
