'use client'

/**
 * Keeps a joined video call alive while its person moves around the app (e.g. a physio opening
 * the patient's record to send exercises or write a note during the call). The call screen
 * (components/video/StreamVideoCall.tsx) creates the call and hands it over here; whenever no
 * full call screen is showing it, a small floating window (FloatingCall) does, with mute, camera,
 * back-to-call and leave.
 *
 * This file loads no video code: the call objects arrive from the call page, and the floating
 * window's code is fetched only when a call is actually floating. Mounted once in the root layout.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import type { StreamVideoClient } from '@stream-io/video-react-sdk'
import type { CallChat } from '@/components/video/room'

type StreamCallHandle = ReturnType<StreamVideoClient['call']>

export type ActiveCallSession = {
  callId: string
  callType: string
  client: StreamVideoClient
  call: StreamCallHandle
  chat: CallChat | null
  /** When the person joined, so the timer carries on across pages */
  joinedAt: number
  /** Heading for the floating window, e.g. "David Falola" */
  withName?: string
  /** Hosts only: end the call for everyone */
  endForAll?: () => Promise<void>
  /** Runs once after leaving, wherever they left from (e.g. tell AwaDoc the session is complete) */
  afterLeave?: () => void
}

type ActiveCallContextValue = {
  session: ActiveCallSession | null
  /** The call page hands over a joined call */
  setSession: (session: ActiveCallSession | null) => void
  /** Updates the handed-over call (chat connected, names known...) */
  updateSession: (patch: Partial<ActiveCallSession>) => void
  /** Leaves the call (or it ended): disconnects and forgets it */
  endSession: () => Promise<void>
  /** A full call screen is showing this call (no small window meanwhile). Returns the undo. */
  showFull: (callId: string) => () => void
}

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null)

const FloatingCall = dynamic(() => import('./FloatingCall'), { ssr: false })

export function callPagePath(callId: string) {
  return `/video-call/${encodeURIComponent(callId)}`
}

async function disconnect(session: ActiveCallSession) {
  try {
    await session.call.leave()
  } catch {
    // Already left
  }
  try {
    await session.chat?.client.disconnectUser()
  } catch {
    // Chat was never connected
  }
  try {
    await session.client.disconnectUser()
  } catch {
    // Already disconnected
  }
}

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ActiveCallSession | null>(null)
  const sessionRef = useRef<ActiveCallSession | null>(null)
  // Calls shown full-size right now (the call page, or a call embedded in a page)
  const [fullViews, setFullViews] = useState<string[]>([])

  const showFull = useCallback((callId: string) => {
    setFullViews((views) => [...views, callId])
    return () =>
      setFullViews((views) => {
        const index = views.indexOf(callId)
        return index === -1 ? views : [...views.slice(0, index), ...views.slice(index + 1)]
      })
  }, [])

  const setSession = useCallback((next: ActiveCallSession | null) => {
    sessionRef.current = next
    setSessionState(next)
  }, [])

  const updateSession = useCallback((patch: Partial<ActiveCallSession>) => {
    const current = sessionRef.current
    if (!current) return
    const next = { ...current, ...patch }
    sessionRef.current = next
    setSessionState(next)
  }, [])

  const endSession = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    sessionRef.current = null
    setSessionState(null)
    await disconnect(current)
    current.afterLeave?.()
  }, [])

  // Closing the tab or the app: leave properly, so nobody is left "in the call" with a live camera
  useEffect(() => {
    const onUnload = () => {
      const current = sessionRef.current
      if (current) void disconnect(current)
    }
    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  const value = useMemo(
    () => ({ session, setSession, updateSession, endSession, showFull }),
    [session, setSession, updateSession, endSession, showFull]
  )
  const shownFull = session !== null && fullViews.includes(session.callId)

  return (
    <ActiveCallContext.Provider value={value}>
      {children}
      {session && !shownFull ? <FloatingCall session={session} onEnded={endSession} /> : null}
    </ActiveCallContext.Provider>
  )
}

export function useActiveCall(): ActiveCallContextValue {
  const value = useContext(ActiveCallContext)
  if (!value) throw new Error('useActiveCall must be used inside ActiveCallProvider')
  return value
}
