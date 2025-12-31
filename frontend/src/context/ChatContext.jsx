import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ChatContext = createContext({ analysisData: null, setAnalysisData: ()=>{} })

export function ChatProvider({ children }){
  const [analysisData, setAnalysisData] = useState(null)
  const value = useMemo(()=>({ analysisData, setAnalysisData }), [analysisData])
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChatContext(){
  return useContext(ChatContext)
}
