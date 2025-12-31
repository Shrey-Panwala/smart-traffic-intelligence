import React, { useEffect, useMemo, useState } from 'react'
import { getDb, listenAuth } from '../services/firebase'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import RunCard from '../components/RunCard'

export default function Analyses(){
  const [user, setUser] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubAuth = listenAuth(u => setUser(u))
    return () => { try{unsubAuth && unsubAuth()}catch{} }
  }, [])

  useEffect(() => {
    const db = getDb()
    if(!user || !db){ setItems([]); setLoading(false); return }
    setLoading(true)
    const q = query(
      collection(db, 'analyses'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      const rows = []
      snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }))
      setItems(rows)
      setLoading(false)
    }, () => setLoading(false))
    return () => { try{unsub && unsub()}catch{} }
  }, [user])

  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const empty = useMemo(() => !loading && items.length === 0, [loading, items])
  const filtered = useMemo(() => {
    let rows = items.slice()
    if(filter !== 'all') rows = rows.filter(r => String(r.status||'').toLowerCase() === filter)
    if(search.trim()){
      const q = search.trim().toLowerCase()
      rows = rows.filter(r =>
        String(r.recommendation || r.recommendation_text || '').toLowerCase().includes(q) ||
        String(r.overallCongestion || r.overall_congestion || '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [items, filter, search])

  return (
    <div>
      <h4 className="brand mb-3">My Runs</h4>
      {!user && (
        <div className="alert alert-info">Sign in via the Gemini Assistant to view your analysis history.</div>
      )}
      {loading && <div className="text-secondary">Loading…</div>}
      {empty && user && (
        <div className="alert alert-secondary">No runs found. Upload a video and run an analysis to populate this list.</div>
      )}
      {!loading && items.length > 0 && (
        <>
          <div className="d-flex align-items-center gap-2 mb-3">
            <select className="form-select form-select-sm" value={filter} onChange={(e)=>setFilter(e.target.value)} title="Filter by status">
              <option value="all">All statuses</option>
              <option value="done">Done</option>
              <option value="in_progress">In progress</option>
              <option value="error">Error</option>
            </select>
            <input className="form-control form-control-sm" placeholder="Search (recommendation or congestion)" value={search} onChange={(e)=>setSearch(e.target.value)} />
          </div>
          <div className="row g-3">
            {filtered.map((it) => (
              <div key={it.id} className="col-12 col-md-6 col-xl-4">
                <RunCard item={it} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
