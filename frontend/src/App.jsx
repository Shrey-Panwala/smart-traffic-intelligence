import React, { useEffect, useRef, useState } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import Upload from './pages/Upload'
import Analysis from './pages/Analysis'
import Analyses from './pages/Analyses'
import Architecture from './pages/Architecture'
import SocialImpact from './pages/SocialImpact'
import Chatbot from './components/Chatbot'

export default function App(){
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useState('dark')
  const [logoSrc, setLogoSrc] = useState('/logo.png')
  const headerRef = useRef(null)

  useEffect(() => {
    // load persisted preferences
    const t = window.localStorage.getItem('ui.theme') || 'dark'
    setTheme(t)
    applyTheme(t)
    // initial header height sync
    syncHeaderHeight()
    const onResize = () => syncHeaderHeight()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const applyTheme = (t) => {
    const body = document.body
    body.setAttribute('data-theme', t)
    body.setAttribute('data-accent', 'ocean')
    // theme changes may adjust font metrics; resync header height
    syncHeaderHeight()
  }

  const onThemeChange = (e) => {
    const t = e.target.value
    setTheme(t)
    window.localStorage.setItem('ui.theme', t)
    applyTheme(t)
  }

  // Keep body padding aligned with actual fixed header height
  const syncHeaderHeight = () => {
    try {
      const el = headerRef.current
      if (!el) return
      const h = Math.max(80, Math.ceil(el.offsetHeight))
      document.documentElement.style.setProperty('--header-h', `${h}px`)
    } catch {}
  }

  // Recompute on route changes (header may wrap differently)
  useEffect(() => { syncHeaderHeight() }, [location?.pathname])



  const isActive = (path) => {
    const cur = location?.pathname || '/'
    if(path === '/') return cur === '/'
    return cur === path || cur.startsWith(path + '/')
  }

  const navClass = (path) => `nav-link ${isActive(path) ? 'active' : ''}`

  return (
    <div className="container pb-4">
      <header ref={headerRef} className="app-header d-flex align-items-center justify-content-between" style={{ paddingBottom:4 }}>
        <div className="header-left d-flex align-items-center gap-3">
          <Link to="/" className="brand-link d-inline-flex align-items-center text-decoration-none">
            <img
              src={logoSrc}
              alt="Smart Parking & Traffic Intelligence Logo"
              className="app-logo"
            />
            <h1
              className="brand m-0"
              aria-label="Smart Parking & Traffic Intelligence"
              style={{
                fontSize: 'clamp(1.2rem, 1.6vw, 1.8rem)',
                textShadow: '0 0 30px rgba(34,211,238,0.35), 0 0 18px rgba(96,165,250,0.25), 0 0 28px rgba(124,58,237,0.18)'
              }}
            >
              SMART PARKING & TRAFFIC INTELLIGENCE
            </h1>
          </Link>
          {/* Move navbar next to the title on the left, as requested */}
          <nav className="navbar-glass d-flex gap-2 flex-wrap ms-2" aria-label="Primary">
            <Link className={navClass('/')} to="/">Home</Link>
            <Link className={navClass('/analyses')} to="/analyses">My Runs</Link>
            <Link className={navClass('/architecture')} to="/architecture">Architecture</Link>
            <Link className={navClass('/impact')} to="/impact">Social Impact</Link>
          </nav>
        </div>
        <div className="app-header-right d-flex align-items-center gap-3 flex-nowrap">
          <div className="d-flex align-items-center gap-2">
            <select className="form-select form-select-sm" value={theme} onChange={onThemeChange}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/analyses" element={<Analyses />} />
        <Route path="/architecture" element={<Architecture />} />
        <Route path="/impact" element={<SocialImpact />} />
      </Routes>
      <Chatbot />
      <footer className="mt-5 text-secondary">Traffic Congestion Analyzer • YOLOv8-powered insights</footer>
    </div>
  )
}
