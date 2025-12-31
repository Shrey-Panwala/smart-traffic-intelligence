const API_BASE = import.meta.env.VITE_API_BASE || '/api' // proxied to FastAPI or explicit base
const API_DIRECT = import.meta.env.VITE_API_DIRECT || 'http://127.0.0.1:8000' // direct FastAPI (CORS-enabled)

export async function uploadVideo(file){
  const form = new FormData()
  form.append('file', file)
  try {
    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form })
    if(!res.ok) throw new Error('Upload failed')
    return res.json()
  } catch (e) {
    // Fallback: bypass Vite proxy and hit FastAPI directly (CORS is enabled server-side)
    try {
      const res2 = await fetch(`${API_DIRECT}/upload`, { method: 'POST', body: form })
      if(!res2.ok) throw new Error('Upload failed (direct)')
      return res2.json()
    } catch (e2) {
      throw e // preserve original error message (e.g., "Failed to fetch")
    }
  }
}

import { getCurrentUser } from './firebase'

export async function analyzeTraffic({ video_path, save_overlay = true, conf_threshold = 0.4, smoothing_window = 5 }){
  const form = new FormData()
  form.append('video_path', video_path)
  form.append('save_overlay', String(save_overlay))
  form.append('conf_threshold', String(conf_threshold))
  form.append('smoothing_window', String(smoothing_window))
  try{
    const u = getCurrentUser()
    if(u && u.uid){ form.append('user_uid', String(u.uid)) }
  }catch{}
  try {
    const res = await fetch(`${API_BASE}/analyze`, { method: 'POST', body: form })
    if(!res.ok) throw new Error('Analyze failed')
    return res.json()
  } catch (e) {
    try {
      const res2 = await fetch(`${API_DIRECT}/analyze`, { method: 'POST', body: form })
      if(!res2.ok) throw new Error('Analyze failed (direct)')
      return res2.json()
    } catch (e2) {
      throw e
    }
  }
}

export async function analyzeTrafficAsync({ video_path, save_overlay = true, conf_threshold = 0.4, smoothing_window = 5 }){
  const form = new FormData()
  form.append('video_path', video_path)
  form.append('save_overlay', String(save_overlay))
  form.append('conf_threshold', String(conf_threshold))
  form.append('smoothing_window', String(smoothing_window))
  try{
    const u = getCurrentUser()
    if(u && u.uid){ form.append('user_uid', String(u.uid)) }
  }catch{}
  try {
    const res = await fetch(`${API_BASE}/analyze_async`, { method: 'POST', body: form })
    if(!res.ok) throw new Error('Analyze async failed')
    return res.json()
  } catch (e) {
    try {
      const res2 = await fetch(`${API_DIRECT}/analyze_async`, { method: 'POST', body: form })
      if(!res2.ok) throw new Error('Analyze async failed (direct)')
      return res2.json()
    } catch (e2) {
      throw e
    }
  }
}

export async function getProgress(task_id){
  const params = new URLSearchParams({ task_id })
  try {
    const res = await fetch(`${API_BASE}/progress?${params.toString()}`)
    if(!res.ok) throw new Error('Progress fetch failed')
    return res.json()
  } catch (e) {
    try {
      const res2 = await fetch(`${API_DIRECT}/progress?${params.toString()}`)
      if(!res2.ok) throw new Error('Progress fetch failed (direct)')
      return res2.json()
    } catch (e2) {
      throw e
    }
  }
}

// Internal helper: fetch with timeout using AbortController
async function fetchWithTimeout(url, options={}, timeoutMs=15000){
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try{
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

export async function chatWithAssistant(message, history=[], context=''){
  // Try proxy first with a 15s timeout, then direct with another 15s
  try {
    const res = await fetchWithTimeout(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, context }),
    }, 15000)
    if(!res.ok){
      let detail = ''
      try{ detail = await res.text() }catch{}
      throw new Error(`Chat request failed (${res.status}): ${detail || 'server error'}`)
    }
    return res.json()
  } catch (e) {
    // Fallback to direct FastAPI endpoint
    try {
      const res2 = await fetchWithTimeout(`${API_DIRECT}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, context }),
      }, 15000)
      if(!res2.ok){
        let detail = ''
        try{ detail = await res2.text() }catch{}
        throw new Error(`Chat request failed (direct) (${res2.status}): ${detail || 'server error'}`)
      }
      return res2.json()
    } catch (e2) {
      // Prefer the direct error if it exists, else the proxy error
      throw e2 || e
    }
  }
}

// Social Impact Endpoints
export async function getEmergencyImpact({ task_id, video_path, use_latest=true }){
  const params = new URLSearchParams()
  if(task_id) params.set('task_id', task_id)
  if(video_path) params.set('video_path', video_path)
  if(use_latest) params.set('use_latest', 'true')
  // Prefer proxy, fallback to direct
  try {
    const res = await fetch(`${API_BASE}/impact/emergency?${params.toString()}`)
    if(!res.ok) throw new Error('Emergency impact failed')
    return res.json()
  } catch (e) {
    const res2 = await fetch(`${API_DIRECT}/impact/emergency?${params.toString()}`)
    if(!res2.ok) throw new Error('Emergency impact failed (direct)')
    return res2.json()
  }
}

export async function getAccessibilityImpact({ task_id, video_path, entrance_bias=0, use_latest=true }){
  const params = new URLSearchParams()
  if(task_id) params.set('task_id', task_id)
  if(video_path) params.set('video_path', video_path)
  params.set('entrance_bias', String(entrance_bias))
  if(use_latest) params.set('use_latest', 'true')
  try {
    const res = await fetch(`${API_BASE}/impact/accessibility?${params.toString()}`)
    if(!res.ok) throw new Error('Accessibility impact failed')
    return res.json()
  } catch (e) {
    const res2 = await fetch(`${API_DIRECT}/impact/accessibility?${params.toString()}`)
    if(!res2.ok) throw new Error('Accessibility impact failed (direct)')
    return res2.json()
  }
}

export async function getClimateImpact({ task_id, video_path, emission_factor=0.23, use_latest=true }){
  const params = new URLSearchParams()
  if(task_id) params.set('task_id', task_id)
  if(video_path) params.set('video_path', video_path)
  params.set('emission_factor', String(emission_factor))
  if(use_latest) params.set('use_latest', 'true')
  try {
    const res = await fetch(`${API_BASE}/impact/climate?${params.toString()}`)
    if(!res.ok) throw new Error('Climate impact failed')
    return res.json()
  } catch (e) {
    const res2 = await fetch(`${API_DIRECT}/impact/climate?${params.toString()}`)
    if(!res2.ok) throw new Error('Climate impact failed (direct)')
    return res2.json()
  }
}
