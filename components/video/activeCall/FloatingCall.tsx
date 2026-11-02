'use client'

/**
 * The call, small, while its person uses the rest of the app (ActiveCallProvider). Shows the other
 * person's video and the call time, with mute, camera, back to the full call, and leave (asked
 * twice, so a stray tap can't hang up on a patient). Drag it anywhere so it doesn't cover what
 * you're working on.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import Link from 'next/link'
import { CallingState, StreamCall, StreamTheme, StreamVideo, useCall, useCallStateHooks } from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { toast } from 'sonner'
import { Loader2, Maximize, Mic, MicOff, PhoneOff, Video, VideoOff } from '@/components/icons'
import { RoomTile } from '@/components/video/room/RoomTile'
import { cn } from '@/lib/utils'
import { callPagePath, type ActiveCallSession } from './ActiveCallProvider'

function useElapsed(since: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const total = Math.max(0, Math.floor((now - since) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Free placement after a drag; null = the default corner. */
type Position = { x: number; y: number } | null

function useDrag() {
  const [position, setPosition] = useState<Position>(null)
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)
  const box = useRef<HTMLDivElement | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, a')) return
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    const rect = box.current?.getBoundingClientRect()
    if (!current || !rect) return
    current.moved = true
    const x = Math.min(Math.max(8, event.clientX - current.dx), window.innerWidth - rect.width - 8)
    const y = Math.min(Math.max(8, event.clientY - current.dy), window.innerHeight - rect.height - 8)
    setPosition({ x, y })
  }
  const onPointerUp = () => {
    drag.current = null
  }
  return { box, position, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

function FloatingCallWindow({ session, onEnded }: { session: ActiveCallSession; onEnded: () => Promise<void> }) {
  const call = useCall()
  const { useCallCallingState, useRemoteParticipants, useLocalParticipant, useMicrophoneState, useCameraState } = useCallStateHooks()
  const callingState = useCallCallingState()
  const remotes = useRemoteParticipants()
  const local = useLocalParticipant()
  const mic = useMicrophoneState()
  const cam = useCameraState()
  const elapsed = useElapsed(session.joinedAt)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { box, position, handlers } = useDrag()
  const endedRef = useRef(false)

  // Ended from the other side (host ended it, or the connection was dropped for good)
  useEffect(() => {
    if (endedRef.current) return
    if (callingState === CallingState.LEFT) {
      endedRef.current = true
      void onEnded()
    }
  }, [callingState, onEnded])

  useEffect(() => {
    if (!call) return
    const offEnded = call.on('call.ended', () => {
      if (endedRef.current) return
      endedRef.current = true
      toast.info('The call has ended')
      void onEnded()
    })
    const offJoined = call.on('call.session_participant_joined', (event) => {
      if (event.participant.user.id !== call.currentUserId) toast(`${event.participant.user.name || 'Someone'} joined the call`)
    })
    const offLeft = call.on('call.session_participant_left', (event) => {
      if (event.participant.user.id !== call.currentUserId) toast(`${event.participant.user.name || 'Someone'} left the call`)
    })
    return () => {
      offEnded()
      offJoined()
      offLeft()
    }
  }, [call, onEnded])

  const toggleMic = () => {
    if (!mic.hasBrowserPermission) return toast.error('Microphone is blocked in your browser settings')
    void mic.microphone.toggle().catch(() => toast.error("Couldn't change your microphone"))
  }
  const toggleCam = () => {
    if (!cam.hasBrowserPermission) return toast.error('Camera is blocked in your browser settings')
    void cam.camera.toggle().catch(() => toast.error("Couldn't change your camera"))
  }
  const leave = async () => {
    setLeaving(true)
    endedRef.current = true
    await onEnded()
  }

  const other = remotes[0]
  const shown = other ?? local
  const micOn = !mic.optimisticIsMute
  const camOn = !cam.optimisticIsMute
  const reconnecting = callingState === CallingState.RECONNECTING || callingState === CallingState.MIGRATING

  return (
    <div
      ref={box}
      role="region"
      aria-label="Video call in progress"
      style={position ? { left: position.x, top: position.y } : undefined}
      className={cn(
        'fixed z-[70] w-[176px] touch-none select-none overflow-hidden rounded-2xl bg-[#0b1312] text-white shadow-2xl ring-1 ring-white/10 sm:w-[248px]',
        !position && 'bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-3 lg:bottom-6 lg:right-6'
      )}
      {...handlers}
    >
      <div className="relative aspect-[3/4] cursor-grab active:cursor-grabbing sm:aspect-video">
        {shown ? <RoomTile participant={shown} compact className="h-full w-full rounded-none ring-0" /> : null}
        {!other && (
          <p className="absolute inset-x-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="truncate">{session.withName ? `Waiting for ${session.withName}` : 'Waiting to join'}</span>
          </p>
        )}
        <span className="absolute left-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums">
          <span className={cn('h-1.5 w-1.5 rounded-full', reconnecting ? 'bg-amber-400' : 'bg-[#00cd0f]')} />
          {reconnecting ? 'Reconnecting' : elapsed}
        </span>
      </div>

      {confirmLeave ? (
        <div className="flex items-center gap-1.5 p-2">
          <span className="min-w-0 flex-1 truncate pl-1 text-xs font-medium">Leave call?</span>
          <button
            type="button"
            onClick={() => setConfirmLeave(false)}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-white/80 hover:text-white"
          >
            Stay
          </button>
          <button
            type="button"
            disabled={leaving}
            onClick={() => void leave()}
            className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {leaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Leave'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1 p-2">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            className={cn('flex h-9 w-9 items-center justify-center rounded-full', micOn ? 'bg-white/10' : 'bg-white text-[#0b1312]')}
          >
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleCam}
            aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
            className={cn('flex h-9 w-9 items-center justify-center rounded-full', camOn ? 'bg-white/10' : 'bg-white text-[#0b1312]')}
          >
            {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </button>
          <Link
            href={callPagePath(session.callId)}
            aria-label="Back to the full call"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
          >
            <Maximize className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setConfirmLeave(true)}
            aria-label="Leave call"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function FloatingCall({ session, onEnded }: { session: ActiveCallSession; onEnded: () => Promise<void> }) {
  return (
    <StreamVideo client={session.client}>
      <StreamCall call={session.call}>
        <StreamTheme>
          <FloatingCallWindow session={session} onEnded={onEnded} />
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}
