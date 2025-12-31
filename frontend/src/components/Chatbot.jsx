import React, { useEffect, useMemo, useRef, useState } from 'react'
import { chatWithAssistant } from '../services/api'
import { listenAuth, signIn, signOutUser, saveChatMessage, completeRedirectSignIn } from '../services/firebase'
import { useChatContext } from '../context/ChatContext'

function GeminiGlyph({ size = 20 }){
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="gemini-glyph"
    >
      <defs>
        <linearGradient id="geminiGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="10" cy="10" r="5" fill="url(#geminiGrad)" opacity="0.85" />
      <circle cx="22" cy="22" r="5" fill="url(#geminiGrad)" opacity="0.85" />
      <path d="M13 13 L19 19" stroke="url(#geminiGrad)" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 16 C16 24, 24 16, 23 13" stroke="url(#geminiGrad)" strokeWidth="1.5" fill="none" opacity="0.7" />
    </svg>
  )
}

export default function Chatbot(){
  const { analysisData } = useChatContext()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your Gemini assistant for Smart Parking & Traffic Intelligence. How can I help?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)
  const [online, setOnline] = useState(true)
  const [user, setUser] = useState(null)
  const [authMsg, setAuthMsg] = useState('')

  // Persist chat in localStorage
  useEffect(()=>{
    try{
      const saved = JSON.parse(window.localStorage.getItem('chat.messages') || '[]')
      if(saved?.length){ setMessages(saved) }
    }catch{}
  }, [])
  useEffect(()=>{
    try{ window.localStorage.setItem('chat.messages', JSON.stringify(messages)) }catch{}
  }, [messages])

  useEffect(() => {
    if(listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  // Firebase auth listener
  useEffect(() => {
    const unsub = listenAuth(u => setUser(u))
    // Complete redirect-based sign-in if we came back from provider
    completeRedirectSignIn().catch(()=>{})
    return () => { try{unsub && unsub()}catch{} }
  }, [])

  const buildContext = useMemo(() => {
    if(!analysisData) return ''
    const s = analysisData.summary || {}
    const lines = [
      `Overall congestion: ${analysisData.overall_congestion}`,
      `Parking score: ${analysisData.overall_parking_score}`,
      `Recommendation: ${analysisData.recommendation_text}`,
      `Frames: ${s.total_frames ?? analysisData.frames?.length ?? 'N/A'}`,
      `Avg count: ${s.avg_count ?? 'N/A'}`,
      `Max count: ${s.max_count ?? 'N/A'}`,
      `95th percentile: ${s.p95_count ?? 'N/A'}`,
      `Low/Medium/High frames: ${s.low_frames ?? 0}/${s.medium_frames ?? 0}/${s.high_frames ?? 0}`,
    ]
    return lines.join('\n')
  }, [analysisData])

  const send = async () => {
    const text = input.trim()
    if(!text || loading) return
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)
    try{
      const res = await chatWithAssistant(text, history, buildContext)
      // Show assistant reply immediately and stop the typing indicator
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
      setLoading(false)

      // Log messages to Firestore in background (non-blocking)
      try{
        if(user?.uid){
          const writes = [
            saveChatMessage(user.uid, { role: 'user', content: text, context: buildContext }),
            saveChatMessage(user.uid, { role: 'assistant', content: res.reply, context: buildContext }),
          ]
          Promise.allSettled(writes).catch(()=>{})
        }
      }catch{}
    }catch(err){
      setMessages(prev => [...prev, { role: 'assistant', content: `Chat error: ${err.message}` }])
      setOnline(false)
    }finally{
      // Safety: ensure loading clears even if above background tasks hang
      setTimeout(() => { setLoading(false) }, 0)
    }
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1000 }}>
      {!open && (
        <button
          className="assistant-fab"
          onClick={()=>setOpen(true)}
          aria-label="Open Gemini Assistant"
        >
          <span className="fab-icon"><GeminiGlyph size={18} /></span>
          <span className="fab-text">Gemini Assistant</span>
          <span className={`fab-status ${online ? 'online' : 'offline'}`} aria-hidden="true" />
        </button>
      )}
      {open && (
        <div className="assistant-widget shadow-lg">
          <div className="assistant-header">
            <div className="d-flex align-items-center gap-2">
              <div className="assistant-avatar"><GeminiGlyph size={18} /></div>
              <div>
                <div className="fw-semibold">Gemini Assistant</div>
                <div className="assistant-subtitle">
                  {online ? 'Online' : 'Disconnected'} • Smart Parking & Traffic
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              {user ? (
                <button
                  className="chip"
                  title={user.email || 'Signed in'}
                  onClick={async ()=>{
                    try{ await signOutUser(); setAuthMsg('Signed out') }catch(e){ setAuthMsg('Sign-out error: ' + (e?.message || 'unknown')) }
                  }}
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="chip"
                  onClick={async ()=>{
                    try{
                      setAuthMsg('Opening Google sign-in…')
                      const res = await signIn()
                      if(res === null){
                        setAuthMsg('Redirecting to Google sign-in…')
                      }else if(res?.user){
                        setAuthMsg('Signed in as ' + (res.user.email || res.user.uid))
                      }
                    }catch(e){
                      const code = e?.code || ''
                      const msg = e?.message || 'unknown'
                      setAuthMsg('Sign-in error' + (code? ` (${code})`:'') + ': ' + msg)
                    }
                  }}
                >
                  Sign in with Google
                </button>
              )}
              <button className="icon-btn" title="Clear chat" onClick={()=>{ setMessages([]) }}>
                ✨
              </button>
              <button className="icon-btn" title="Close" onClick={()=>setOpen(false)}>
                ✖
              </button>
            </div>
          </div>
          <div ref={listRef} className="assistant-body">
            {authMsg && (
              <div className="msg-row assistant">
                <div className="msg-avatar"><GeminiGlyph size={16} /></div>
                <div className="msg-bubble assistant" style={{fontStyle:'italic'}}>{authMsg}</div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg-row ${m.role}`}> 
                {m.role==='assistant' && <div className="msg-avatar"><GeminiGlyph size={16} /></div>}
                <div className={`msg-bubble ${m.role}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="msg-row assistant">
                <div className="msg-avatar"><GeminiGlyph size={16} /></div>
                <div className="typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
          </div>
          <div className="assistant-footer">
            <div className="quick-row">
              <button className="chip" onClick={()=>setInput('Summarize my video insights')}>Summarize insights</button>
              <button className="chip" onClick={()=>setInput('Explain the heatmap and congestion levels')}>Explain heatmap</button>
              <button className="chip" onClick={()=>setInput('How do I use this website?')}>Guide me</button>
            </div>
            <div className="input-row">
              <input
                className="assistant-input"
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') send() }}
                placeholder="Ask about analysis, heatmaps, parking..."
              />
              <button className="send-btn" onClick={send} disabled={loading}>
                Send
              </button>
            </div>
            <div className="assistant-hint">Uses Gemini via backend. Keep queries safe.</div>
          </div>
        </div>
      )}
    </div>
  )
}
