import React, { useEffect, useMemo, useRef, useState } from 'react'

// Interactive, theme-aware architecture map
export default function Architecture() {
  const [active, setActive] = useState(null)
  const nodeRefs = useRef({})

  const layers = useMemo(() => ([
    {
      id: 'input',
      icon: '🎥',
      title: 'Video Ingestion',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(14,165,233,0.10))',
      lightGradient: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(14,165,233,0.06))',
      bullets: [
        'Accepts dashcam or CCTV video',
        'Handles format, resolution & frame sampling',
        'Designed for real-world noisy footage',
      ],
    },
    {
      id: 'perception',
      icon: '🧠',
      title: 'AI Perception (YOLOv8)',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(168,85,247,0.10))',
      lightGradient: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(168,85,247,0.06))',
      bullets: [
        'Object detection using YOLOv8',
        'Filters vehicle classes with confidence thresholds',
        'Converts video into structured traffic observations',
      ],
    },
    {
      id: 'intel',
      icon: '📊',
      title: 'Traffic Intelligence',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(56,189,248,0.10))',
      lightGradient: 'linear-gradient(135deg, rgba(6,182,212,0.10), rgba(56,189,248,0.06))',
      bullets: [
        'Per-frame vehicle counting',
        'Temporal smoothing via rolling averages',
        'Volatility & trend extraction',
      ],
    },
    {
      id: 'decision',
      icon: '🧮',
      title: 'Decision Engine',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.20), rgba(250,204,21,0.10))',
      lightGradient: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(250,204,21,0.06))',
      bullets: [
        'Congestion classification (Low / Medium / High)',
        'Parking & routing scoring',
        'Risk-aware and threshold-based logic',
      ],
    },
    {
      id: 'impact',
      icon: '🌍',
      title: 'Public Good Intelligence',
      color: '#22c55e',
      gradient: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(16,185,129,0.10))',
      lightGradient: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(16,185,129,0.06))',
      bullets: [
        'Emergency response support',
        'Accessibility-first guidance',
        'Climate & emission awareness',
      ],
    },
    {
      id: 'xai',
      icon: '🧾',
      title: 'Explainable AI (XAI)',
      color: '#14b8a6',
      gradient: 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(45,212,191,0.10))',
      lightGradient: 'linear-gradient(135deg, rgba(20,184,166,0.10), rgba(45,212,191,0.06))',
      bullets: [
        'Transparent reasoning behind decisions',
        'Human-readable summaries',
        'Technical breakdowns available on demand',
      ],
    },
  ]), [])

  const isDark = (typeof document !== 'undefined') ? document.body.getAttribute('data-theme') !== 'light' : true

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => { if(e.key === 'Escape') setActive(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Ensure visibility: scroll selected node into view
  useEffect(() => {
    if(active && nodeRefs.current[active]){
      try{ nodeRefs.current[active].scrollIntoView({ behavior:'smooth', block:'center' }) }catch{}
    }
  }, [active])

  return (
    <div className="row g-4">
      <div className="col-12">
        <div className="card p-4">
          <div className="text-center mb-3">
            <h5 className="m-0" style={{ fontWeight: 800, letterSpacing: '.2px' }}>Interactive Architecture</h5>
            <div className="text-secondary small mt-1">Click a layer to learn more</div>
          </div>

          {/* Vertical flowchart with right-side dynamic description */}
          {/* Helper */}
          <div className="text-secondary small mb-2 text-center">Click on any layer to explore how the system works.</div>

          {/* Centered vertical flowchart */}
          <div className="vf-wrap" role="list">
            {layers.map((layer, idx) => (
              <React.Fragment key={layer.id}>
                <div className="vf-row">
                  <button
                    role="listitem"
                    aria-expanded={active === layer.id}
                    className={`vf-node ${active === layer.id ? 'active' : ''}`}
                    aria-label={`${layer.title} layer. Click to view details.`}
                    style={{
                      background: isDark ? layer.gradient : layer.lightGradient,
                      borderColor: isDark ? 'rgba(148,163,184,0.35)' : 'rgba(30,41,59,0.28)',
                      ['--accent']: layer.color,
                      animationDelay: `${idx * 80}ms`
                    }}
                    onClick={() => setActive(layer.id)}
                    ref={(el) => { nodeRefs.current[layer.id] = el }}
                  >
                    <div className="icon" aria-hidden>{layer.icon}</div>
                    <div className="title">{layer.title}</div>
                  </button>
                </div>
                {idx < layers.length - 1 && (
                  <div className="vf-connector" aria-hidden>
                    <svg width="22" height="88" viewBox="0 0 22 88">
                      <defs>
                        <linearGradient id={`gradLine-${idx}`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={isDark ? '#ffffff' : '#475569'} />
                          <stop offset="100%" stopColor={isDark ? 'rgba(230,236,245,0.85)' : 'rgba(148,163,184,0.95)'} />
                        </linearGradient>
                        <filter id={`glow-${idx}`} x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
                          <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      <g filter={`url(#glow-${idx})`}>
                        {/* solid base line to keep visible even when dashes shift */}
                        <path d="M11 8 V 70" stroke={isDark ? 'rgba(255,255,255,0.28)' : 'rgba(71,85,105,0.6)'} strokeWidth="4" strokeLinecap="round" />
                        <path d="M11 8 V 70" stroke={`url(#gradLine-${idx})`} strokeWidth="4" strokeDasharray="6 6" strokeLinecap="round">
                          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.0s" repeatCount="indefinite" />
                        </path>
                        <path d="M6 70 L11 80 L16 70" fill={isDark ? '#ffffff' : '#334155'} stroke={isDark ? '#ffffff' : '#334155'} strokeWidth="2" strokeLinejoin="round"/>
                      </g>
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Modal dialog for descriptions */}
          {active && (
            <div className="vf-overlay" onClick={() => setActive(null)}>
              {layers.filter(l => l.id === active).map(l => (
                <div key={l.id}
                  className="vf-dialog"
                  style={{ borderColor: l.color, color: isDark ? '#e5e7eb' : '#0f172a' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center" style={{ gap: 10 }}>
                      <div style={{ fontSize: 20 }}>{l.icon}</div>
                      <strong style={{ fontWeight: 800 }}>{l.title}</strong>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => setActive(null)}>Close</button>
                  </div>
                  <div className="subtitle" style={{ marginBottom: 8 }}>A focused layer in the end-to-end pipeline.</div>
                  <ul className="m-0 ps-3">
                    {l.bullets.map((b, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-secondary small">This architecture explains how raw video becomes human-interpretable decisions.</p>
        </div>
      </div>

      <style>{`
        .pipeline-wrap{ position:relative; }
        .vf-wrap{ display:flex; flex-direction:column; align-items:center; }
        .vf-row{ display:flex; justify-content:center; width:100%; }
        .vf-node{ position:relative; appearance:none; border:1px solid transparent; border-radius:16px; padding:18px 20px; width:360px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:96px; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; background-clip: padding-box; animation: fadeUp .35s ease both; color: var(--text); }
        .vf-node::before{ content:""; position:absolute; inset:0; border-radius:inherit; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.28)); pointer-events:none; }
        .vf-node::after{ content:""; position:absolute; inset:0; border-radius:inherit; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); pointer-events:none; }
        .vf-node .icon{ display:block; font-size:28px; line-height:1; margin:0 auto 8px; filter: drop-shadow(0 2px 6px rgba(0,0,0,.25)); }
        .vf-node .title{ font-weight:800; font-size:16px; letter-spacing:.2px; text-shadow: 0 1px 1px rgba(0,0,0,.28); }
        .vf-node:hover{ transform: translateY(-2px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,.28), 0 0 0 1px var(--accent); }
        .vf-node:focus-visible{ outline: 3px solid var(--accent); outline-offset: 2px; }
        .vf-node.active{ box-shadow: 0 0 0 2px var(--accent), 0 10px 28px rgba(0,0,0,.32); }
        @keyframes fadeUp{ from{ opacity:0; transform: translateY(8px) } to{ opacity:1; transform: translateY(0) } }
        .vf-connector{ height:88px; display:flex; align-items:center; justify-content:center; opacity:0.98; pointer-events:none; }
        .flow-hint{ display:none; }
        .flow-hint .dot{ width:6px; height:6px; border-radius:50%; background: rgba(148,163,184,.45); animation: pulse 2.2s infinite ease-in-out; }
        .flow-hint .dot:nth-child(2){ animation-delay:.25s }
        .flow-hint .dot:nth-child(3){ animation-delay:.5s }
        @keyframes pulse{ 0%{ transform:translateX(0); opacity:.3 } 50%{ transform:translateX(8px); opacity:.9 } 100%{ transform:translateX(16px); opacity:.3 } }
        .vf-overlay{ position:fixed; inset:0; background: rgba(2,6,23,.55); backdrop-filter: blur(3px); display:flex; align-items:center; justify-content:center; animation: fadeIn .2s ease; z-index: 50; }
        .vf-dialog{ width:min(620px, 94vw); border:1.5px solid; border-radius:18px; padding:18px; background: ${'${'}isDark ? 'rgba(9,16,28,0.85)' : 'rgba(255,255,255,0.98)'}; backdrop-filter: blur(10px); box-shadow: 0 24px 40px rgba(0,0,0,.20); transform: translateY(8px); opacity:0; animation: dialogIn .27s ease forwards; }
        .vf-dialog .subtitle{ color: ${'${'}isDark ? '#cbd5e1' : '#334155'}; }
        /* Light theme readability overrides */
        body[data-theme="light"] .vf-node{ color:#0f172a; }
        /* Softer overlay so text contrasts more on white */
        body[data-theme="light"] .vf-node::before{ background: linear-gradient(180deg, rgba(255,255,255,0.60), rgba(241,245,249,0.45)); }
        body[data-theme="light"] .vf-node::after{ box-shadow: inset 0 0 0 1px rgba(15,23,42,0.08); }
        /* Stronger, darker title in light mode */
        body[data-theme="light"] .vf-node .title{ text-shadow: none; color:#0f172a; font-weight:900; font-size:17px; letter-spacing:0; }
        body[data-theme="light"] .vf-node:hover{ box-shadow: 0 8px 22px rgba(15,23,42,.10), 0 0 0 1px var(--accent); }
        body[data-theme="light"] .vf-node.active{ box-shadow: 0 0 0 2px var(--accent), 0 10px 28px rgba(15,23,42,.12); }
        /* Improve modal visibility in light theme */
        body[data-theme="light"] .vf-overlay{ background: rgba(15,23,42,0.28); }
        body[data-theme="light"] .vf-dialog{ background: rgba(255,255,255,0.98); color:#0f172a; box-shadow: 0 24px 40px rgba(15,23,42,0.14); }
        body[data-theme="light"] .vf-dialog ul li{ color:#0f172a; }
        body[data-theme="light"] .vf-dialog strong{ color:#0f172a; }
        @keyframes fadeIn{ from{ opacity:0 } to{ opacity:1 } }
        @keyframes dialogIn{ to{ opacity:1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
