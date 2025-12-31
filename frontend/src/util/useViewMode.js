import { useEffect, useState } from 'react'

const KEY = 'xai.viewMode'
const EVENT = 'xai:viewMode'

// viewMode: 'simple' | 'technical'
export default function useViewMode(defaultMode = 'simple'){
  const [viewMode, setViewMode] = useState(defaultMode)

  useEffect(() => {
    const readStored = () => {
      try{
        const v = window.localStorage.getItem(KEY)
        if(v === 'simple' || v === 'technical') setViewMode(v)
      }catch{}
    }

    readStored()

    const onStorage = (e) => {
      try{
        if(e?.key !== KEY) return
        const v = e?.newValue
        if(v === 'simple' || v === 'technical') setViewMode(v)
      }catch{}
    }

    const onCustom = (e) => {
      const v = e?.detail
      if(v === 'simple' || v === 'technical') setViewMode(v)
    }

    // Keep multiple components (and tabs) in sync
    window.addEventListener('storage', onStorage)
    window.addEventListener(EVENT, onCustom)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(EVENT, onCustom)
    }
  }, [])

  const setAndPersist = (mode) => {
    const next = mode === 'technical' ? 'technical' : 'simple'
    setViewMode(next)
    try{ window.localStorage.setItem(KEY, next) }catch{}
    try{ window.dispatchEvent(new CustomEvent(EVENT, { detail: next })) }catch{}
  }

  return { viewMode, setViewMode: setAndPersist }
}
