'use client'

/**
 * Keep listening while you browse (owner 2026-11-16: "I can't minimise or play the Space in the
 * background without leaving"). The live Space (Stream client + call) lives here, in the Learn
 * layout, so moving to another Learn page keeps it playing; a small floating player shows what's
 * on, with mute (speakers), open and leave. The voices play from here too (one place, never twice).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CallingState, ParticipantsAudio, StreamCall, StreamVideo, StreamVideoClient, useCallStateHooks } from '@stream-io/video-react-sdk'
import { toast } from 'sonner'
import { Maximize, Mic, MicOff, Radio, X } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { spacePath } from '../social/socialApi'
import { LoudAudio } from './LoudAudio'

type StreamCallHandle = ReturnType<StreamVideoClient['call']>

export type ActiveSpaceSession = {
  spaceId: string
  title: string
  host: string
  client: StreamVideoClient
  call: StreamCallHandle
  isHost: boolean
  canModerate: boolean
}

type ActiveSpaceApi = {
  session: ActiveSpaceSession | null
  start: (session: ActiveSpaceSession) => Promise<void>
  /** Leave the Space and drop the connection. */
  leave: () => Promise<void>
}

const ActiveSpaceContext = createContext<ActiveSpaceApi | null>(null)

export function useActiveSpace() {
  const api = useContext(ActiveSpaceContext)
  if (!api) throw new Error('useActiveSpace needs ActiveSpaceProvider (Learn layout)')
  return api
}

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ActiveSpaceSession | null>(null)
  const ref = useRef<ActiveSpaceSession | null>(null)
  ref.current = session

  const leave = useCallback(async () => {
    const s = ref.current
    if (!s) return
    ref.current = null
    setSession(null)
    try {
      await s.call.leave()
    } catch {
      // already left
    }
    try {
      await s.client.disconnectUser()
    } catch {
      // ignore
    }
  }, [])

  const start = useCallback(
    async (next: ActiveSpaceSession) => {
      // One Space at a time
      if (ref.current && ref.current.spaceId !== next.spaceId) await leave()
      ref.current = next
      setSession(next)
    },
    [leave]
  )

  // Closing the tab leaves cleanly
  useEffect(() => {
    const onUnload = () => void ref.current?.call.leave().catch(() => undefined)
    window.addEventListener('pagehide', onUnload)
    return () => window.removeEventListener('pagehide', onUnload)
  }, [])

  const api = useMemo(() => ({ session, start, leave }), [session, start, leave])

  return (
    <ActiveSpaceContext.Provider value={api}>
      {children}
      {session && (
        <StreamVideo client={session.client}>
          <StreamCall call={session.call}>
            <SpaceBackground session={session} onEnded={leave} />
          </StreamCall>
        </StreamVideo>
      )}
    </ActiveSpaceContext.Provider>
  )
}

/** The voices, the lock-screen card, "the Space ended" and the floating player. */
function SpaceBackground({ session, onEnded }: { session: ActiveSpaceSession; onEnded: () => Promise<void> }) {
  const { useParticipants, useCallCallingState, useMicrophoneState } = useCallStateHooks()
  const participants = useParticipants()
  const callingState = useCallCallingState()
  const { isMute } = useMicrophoneState()
  const pathname = usePathname() || ''
  const onPage = pathname.endsWith(`/spaces/${session.spaceId}`)
  const remote = participants.filter((p) => !p.isLocalParticipant)

  // The host ended it (or the connection closed for good)
  useEffect(() => {
    if (callingState !== CallingState.LEFT) return
    if (!onPage) {
      toast('The Space has ended')
      playSound('reject')
    }
    void onEnded()
  }, [callingState, onPage, onEnded])

  // Phones show what's playing on the lock screen and keep it going in the background
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: session.title, artist: `${session.host} · Rehabify Learn Space`, album: 'Rehabify Learn' })
      navigator.mediaSession.playbackState = 'playing'
      navigator.mediaSession.setActionHandler('stop', () => void onEnded())
    } catch {
      // not supported here
    }
    return () => {
      try {
        navigator.mediaSession.metadata = null
        navigator.mediaSession.playbackState = 'none'
        navigator.mediaSession.setActionHandler('stop', null)
      } catch {
        // not supported here
      }
    }
  }, [session.title, session.host, onEnded])

  const speakers = participants.filter((p) => p.publishedTracks.length > 0 || p.isSpeaking).length
  const toggleMic = async () => {
    try {
      await session.call.microphone.toggle()
    } catch {
      toast.error('Couldn’t use your microphone. Check the browser’s permission.')
    }
  }
  const canTalk = session.isHost || !isMute

  return (
    <>
      {/* Listening (mic off): voices boosted and evened out. Mic on: normal playback, so no echo */}
      {isMute ? <LoudAudio participants={remote} /> : <ParticipantsAudio participants={remote} />}

      {!onPage && (
        <div className="learn-fixed-dark fixed bottom-[max(12px,env(safe-area-inset-bottom))] right-3 z-[70] w-[min(360px,calc(100vw-24px))] rounded-[22px] bg-rh-ink p-2.5 pl-3 text-white shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rh-lime text-[#0b1312]">
              <Radio className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-rose-500 ring-2 ring-rh-ink" aria-hidden />
            </span>
            <Link href={spacePath(session.spaceId)} className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold leading-tight">{session.title}</span>
              <span className="block truncate text-[11px] text-white/55">
                Live · {participants.length} {participants.length === 1 ? 'person' : 'people'}
                {speakers ? ` · ${speakers} on stage` : ''}
              </span>
            </Link>
            {canTalk && (
              <button
                type="button"
                onClick={() => void toggleMic()}
                aria-label={isMute ? 'Unmute' : 'Mute'}
                className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', isMute ? 'bg-white/10 text-white' : 'bg-rh-lime text-[#0b1312]')}
              >
                {isMute ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            <Link href={spacePath(session.spaceId)} aria-label="Open the Space" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15">
              <Maximize className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => {
                if (session.isHost && !window.confirm('Leave your own Space? It keeps going if a co-host is there; otherwise end it from the Space page.')) return
                playSound('send')
                void onEnded()
              }}
              aria-label="Leave the Space"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-rose-500/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
