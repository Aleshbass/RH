'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAction, useQuery } from 'convex/react'
import { StreamCall, StreamTheme, StreamVideo, StreamVideoClient } from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { CalendarClock, CalendarX, Link2Off, Loader2, PhoneOff, WifiOff } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { CallLobby, CallRoom, CallStatusScreen } from '@/components/video/room'

// Short patient join link sent by Joy on WhatsApp: /v/<booking code>.
// Joy patients have no login; the code is checked server-side before a
// call-scoped Stream token is issued.

type StreamCallHandle = ReturnType<StreamVideoClient['call']>
type JoinRefusal = 'not_found' | 'cancelled' | 'too_early' | 'ended'

const REFUSAL_TEXT: Record<JoinRefusal, string> = {
  not_found: "We couldn't find this appointment.",
  cancelled: 'This appointment has been cancelled.',
  too_early: "It's not time to join yet.",
  ended: 'This appointment has ended.',
}

// Joy quotes appointment times in WAT, so the page does too.
const TIME_ZONE = 'Africa/Lagos'

function formatDay(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE }).format(ms)
}

function formatTime(ms: number) {
  return `${new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIME_ZONE }).format(ms)} WAT`
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const primaryButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-8 text-[15px] font-medium text-white shadow-[0_12px_30px_-12px_rgba(0,91,87,0.7)] transition-all hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60'

export default function PatientJoinPage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params.code ?? '')
  const session = useQuery(api.joyIntegration.getJoyJoinSession, { code })
  const getCallToken = useAction(api.stream.getJoyPatientCallToken)
  const now = useNow(15_000)

  const [phase, setPhase] = useState<'idle' | 'preparing' | 'lobby' | 'joining' | 'in_call' | 'left'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  const [call, setCall] = useState<StreamCallHandle | null>(null)
  const callIdRef = useRef<string | null>(null)

  const windowState = !session
    ? null
    : session.cancelled
      ? 'cancelled'
      : now < session.opensAt
        ? 'too_early'
        : now > session.closesAt
          ? 'ended'
          : 'open'

  // A signed-in clinician opening the patient link goes to their own call page.
  useEffect(() => {
    if (session?.clinicianCallPath) router.replace(session.clinicianCallPath)
  }, [session?.clinicianCallPath, router])

  // Release the camera, microphone and socket when the page closes.
  useEffect(() => () => { void client?.disconnectUser() }, [client])

  const prepare = useCallback(async () => {
    setPhase('preparing')
    setNotice(null)
    try {
      let streamClient = client
      let callId = callIdRef.current
      if (!streamClient || !callId) {
        const res = await getCallToken({ code })
        if (!res.ok) {
          // convex/stream.ts is @ts-nocheck, so the action result arrives untyped.
          setNotice(REFUSAL_TEXT[res.reason as JoinRefusal])
          setPhase('idle')
          return
        }
        streamClient = StreamVideoClient.getOrCreateInstance({
          apiKey: res.apiKey,
          user: { id: res.userId, name: res.userName },
          token: res.token,
        })
        callId = res.callId as string
        callIdRef.current = callId
        setClient(streamClient)
      }
      // A call that has been left can't be rejoined, so every attempt gets a fresh handle.
      setCall(streamClient.call('default', callId))
      setPhase('lobby')
    } catch (error) {
      console.error('[patient-join] failed to prepare call', error)
      setNotice("We couldn't connect you. Check your internet connection and try again.")
      setPhase('idle')
    }
  }, [client, code, getCallToken])

  // Get the call ready as soon as the join window is open.
  useEffect(() => {
    if (windowState === 'open' && phase === 'idle' && !notice && !session?.clinicianCallPath) void prepare()
  }, [windowState, phase, notice, session?.clinicianCallPath, prepare])

  const join = async () => {
    if (!call) return
    setPhase('joining')
    setNotice(null)
    try {
      await call.join({ create: false })
      setPhase('in_call')
    } catch (error) {
      console.error('[patient-join] failed to join call', error)
      setNotice("We couldn't connect you. Check your internet connection and try again.")
      setPhase('lobby')
    }
  }

  const handleLeft = useCallback(() => {
    setCall(null)
    setPhase('left')
  }, [])

  if (session === undefined || session?.clinicianCallPath) {
    return <CallStatusScreen icon={<Loader2 className="h-6 w-6 animate-spin text-brand" />} title="Loading your appointment" />
  }

  if (session === null) {
    return (
      <CallStatusScreen
        icon={<Link2Off className="h-6 w-6" />}
        title="Link not recognised"
        description="Check that you opened the full link Joy sent you on WhatsApp, or reply to Joy for help."
      />
    )
  }

  const durationMinutes = Math.round((session.endTime - session.startTime) / 60_000)
  const details = (
    <>
      <p>
        with <span className="font-medium text-neutral-900">{session.clinicianName}</span>
      </p>
      <p>
        {formatDay(session.startTime)} · {formatTime(session.startTime)} · {durationMinutes} min
      </p>
      <p className="pt-1 text-sm text-neutral-500">
        Booking code <span className="font-mono tracking-wider text-neutral-800">{session.bookingCode}</span>
      </p>
    </>
  )

  if (call && client && (phase === 'lobby' || phase === 'joining' || phase === 'in_call')) {
    return (
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamTheme className="h-full">
            {phase === 'in_call' ? (
              <CallRoom title={`Appointment with ${session.clinicianName}`} waitingFor={session.clinicianName} onLeft={handleLeft} />
            ) : (
              <CallLobby eyebrow="Online appointment" details={details} joining={phase === 'joining'} notice={notice} onJoin={() => void join()} />
            )}
          </StreamTheme>
        </StreamCall>
      </StreamVideo>
    )
  }

  if (windowState === 'cancelled') {
    return <CallStatusScreen icon={<CalendarX className="h-6 w-6" />} title="Appointment cancelled" description={REFUSAL_TEXT.cancelled} />
  }

  if (windowState === 'ended') {
    return (
      <CallStatusScreen
        icon={<PhoneOff className="h-6 w-6" />}
        title="This appointment has ended"
        description="Thank you for joining. Your physiotherapist will follow up with any next steps on WhatsApp."
      />
    )
  }

  if (windowState === 'too_early') {
    return (
      <CallStatusScreen
        icon={<CalendarClock className="h-6 w-6" />}
        title="Your appointment opens soon"
        description={
          <div className="space-y-1">
            {details}
            <p className="pt-3">
              You can join from <span className="font-medium text-neutral-900">{formatTime(session.opensAt)}</span>. Keep this page open.
            </p>
          </div>
        }
      />
    )
  }

  if (phase === 'left') {
    return (
      <CallStatusScreen icon={<PhoneOff className="h-6 w-6" />} title="You left the appointment" description={`Your appointment with ${session.clinicianName} is still open.`}>
        <button type="button" onClick={() => void prepare()} className={primaryButton}>
          Rejoin
        </button>
      </CallStatusScreen>
    )
  }

  if (notice) {
    return (
      <CallStatusScreen icon={<WifiOff className="h-6 w-6" />} title="Couldn't connect" description={notice}>
        <button type="button" onClick={() => void prepare()} className={primaryButton}>
          Try again
        </button>
      </CallStatusScreen>
    )
  }

  return <CallStatusScreen icon={<Loader2 className="h-6 w-6 animate-spin text-brand" />} title="Getting your appointment ready" />
}
