// Lightweight Firebase setup for Auth (Google) and Firestore logging
// Configure via Vite env variables (see README and .env.example)

import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth'
import {
  getFirestore,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore'

let app
const enabled = !!import.meta.env.VITE_FIREBASE_API_KEY

function initFirebase(){
  if(!enabled) return null
  if(getApps().length){
    app = getApps()[0]
    return app
  }
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }
  app = initializeApp(cfg)
  return app
}

function ensure(){
  const a = initFirebase()
  if(!a) return null
  return {
    auth: getAuth(),
    db: getFirestore(),
    provider: (() => { const p = new GoogleAuthProvider(); try{ p.setCustomParameters({ prompt: 'select_account' }) }catch{} return p })(),
  }
}

export function listenAuth(callback){
  const svc = ensure()
  if(!svc){
    // env not configured; act as signed-out
    try{ callback(null) }catch{}
    return () => {}
  }
  return onAuthStateChanged(svc.auth, callback)
}

export async function signIn(){
  const svc = ensure()
  if(!svc) return Promise.reject(new Error('Firebase not configured'))
  try{
    await setPersistence(svc.auth, browserLocalPersistence)
  }catch{}
  try{
    return await signInWithPopup(svc.auth, svc.provider)
  }catch(err){
    // Fallback to redirect for popup blockers or CSP issues
    try{
      await signInWithRedirect(svc.auth, svc.provider)
      return null
    }catch(e){
      throw err
    }
  }
}

export async function signOutUser(){
  const svc = ensure()
  if(!svc) return Promise.resolve()
  return signOut(svc.auth)
}

export async function saveChatMessage(uid, { role, content, context }){
  const svc = ensure()
  if(!svc || !uid) return
  try{
    await addDoc(collection(svc.db, 'chats'), {
      uid,
      role,
      content,
      context: context || '',
      ts: serverTimestamp(),
    })
  }catch(e){
    // Non-blocking: ignore write errors in UI
  }
}

export function getDb(){
  const svc = ensure()
  return svc ? svc.db : null
}

export async function completeRedirectSignIn(){
  const svc = ensure()
  if(!svc) return null
  try{
    const res = await getRedirectResult(svc.auth)
    return res
  }catch{
    return null
  }
}

// Convenience: get current authenticated user (or null)
export function getCurrentUser(){
  const svc = ensure()
  if(!svc) return null
  try{
    return svc.auth.currentUser || null
  }catch{
    return null
  }
}

// Save analysis document under the signed-in user (client-side write)
export async function saveAnalysisForCurrentUser(payload){
  const svc = ensure()
  if(!svc) return
  const u = (()=>{ try{ return svc.auth.currentUser }catch{ return null } })()
  if(!u || !u.uid) return
  const doc = {
    uid: u.uid,
    status: payload?.status || 'done',
    overallCongestion: payload?.overall_congestion ?? payload?.overallCongestion ?? null,
    parkingScore: payload?.overall_parking_score ?? payload?.parkingScore ?? null,
    recommendation: payload?.recommendation_text ?? payload?.recommendation ?? '',
    processedVideoUrl: payload?.processed_video_path ?? payload?.processedVideoUrl ?? '',
    heatmapUrl: payload?.heatmap_url ?? payload?.heatmapUrl ?? '',
    createdAt: serverTimestamp(),
  }
  try{
    await addDoc(collection(svc.db, 'analyses'), doc)
  }catch(e){
    // Ignore UI errors; analyses page will remain empty if rules block writes
  }
}
