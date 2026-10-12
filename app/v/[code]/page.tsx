'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useAction, useQuery } from 'convex/react'
import {
  CallControls,
  CallingState,
  SpeakerLayout,
  StreamCall,
  StreamTheme,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { Loader2, Video } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 py-8">
      <Image src="/logos/MainRehabify.svg" alt="Rehabify Health" width={100} height={32} className="mb-8 h-8 w-auto self-start" priority />
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">{children}</div>
      <p className="mt-6 text-center text-sm text-neutral-500">Need help? Reply to Joy on WhatsApp.</p>
    </main>
  )
}

function InCall({ clinicianName, onLeft }: { clinicianName: string; onLeft: () => void }) {
  const { useCallCallingState, useRemoteParticipants } = useCallStateHooks()
  const callingState = useCallCallingState()
  const remoteParticipants = useRemoteParticipants()

  // Covers both hanging up and the clinician ending the call for everyone.
  useEffect(() => {
    if (callingState === CallingState.LEFT) onLeft()
  }, [callingState, onLeft])

  return (
    <div className="flex h-[100dvh] flex-col bg-neutral-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="truncate text-sm text-white/80">Online appointment with {clinicianName}</span>
        <span className="shrink-0 text-xs text-white/40">Rehabify Health</span>
      </header>
      <div className="relative min-h-0 flex-1">
        <SpeakerLayout participantsBarPosition="bottom" />
        {remoteParticipants.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
            <p className="rounded-full bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur">
              Waiting for {clinicianName} to join…
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <CallControls />
      </div>
    </div>
  )
}

export default function PatientJoinPage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params.code ?? '')
  const session = useQuery(api.joyIntegration.getJoyJoinSession, { code })
  const getCallToken = useAction(api.stream.getJoyPatientCallToken)
  const now = useNow(15_000)

  const [phase, setPhase] = useState<'lobby' | 'connecting' | 'in_call' | 'left'>('lobby')
  const [notice, setNotice] = useState<string | null>(null)
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  const [call, setCall] = useState<StreamCallHandle | null>(null)

  // A signed-in clinician opening the patient link goes to their own call page.
  useEffect(() => {
    if (session?.clinicianCallPath) router.replace(session.clinicianCallPath)
  }, [session?.clinicianCallPath, router])

  // Release the camera, microphone and socket when the call is left or the page closes.
  useEffect(() => () => { void client?.disconnectUser() }, [client])

  const join = useCallback(async () => {
    setPhase('connecting')
    setNotice(null)
    let streamClient: StreamVideoClient | null = null
    try {
      const res = await getCallToken({ code })
      if (!res.ok) {
        // convex/stream.ts is @ts-nocheck, so the action result arrives untyped.
        setNotice(REFUSAL_TEXT[res.reason as JoinRefusal])
        setPhase('lobby')
        return
      }
      streamClient = StreamVideoClient.getOrCreateInstance({
        apiKey: res.apiKey,
        user: { id: res.userId, name: res.userName },
        token: res.token,
      })
      const streamCall = streamClient.call('default', res.callId)
      await streamCall.join({ create: false })
      setClient(streamClient)
      setCall(streamCall)
      setPhase('in_call')
    } catch (error) {
      console.error('[patient-join] failed to join call', error)
      await streamClient?.disconnectUser().catch(() => {})
      setNotice("We couldn't connect you. Check your internet connection and try again.")
      setPhase('lobby')
    }
  }, [code, getCallToken])

  const handleLeft = useCallback(() => {
    setCall(null)
    setClient(null)
    setPhase('left')
  }, [])

  if (phase === 'in_call' && client && call && session) {
    return (
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamTheme>
            <InCall clinicianName={session.clinicianName} onLeft={handleLeft} />
          </StreamTheme>
        </StreamCall>
      </StreamVideo>
    )
  }

  if (session === undefined || session?.clinicianCallPath) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
        </div>
      </Shell>
    )
  }

  if (session === null) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold text-neutral-900">Link not recognised</h1>
        <p className="mt-2 text-neutral-600">Check that you opened the full link Joy sent you on WhatsApp.</p>
      </Shell>
    )
  }

  const durationMinutes = Math.round((session.endTime - session.startTime) / 60_000)
  const windowState = session.cancelled
    ? 'cancelled'
    : now < session.opensAt
      ? 'too_early'
      : now > session.closesAt
        ? 'ended'
        : 'open'

  return (
    <Shell>
      <p className="text-sm font-medium text-brand">
        {phase === 'left' ? "You've left the appointment" : 'Online appointment'}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-neutral-900">with {session.clinicianName}</h1>
      <dl className="mt-5 space-y-3 text-neutral-700">
        <div>
          <dt className="sr-only">Date</dt>
          <dd>{formatDay(session.startTime)}</dd>
        </div>
        <div>
          <dt className="sr-only">Time</dt>
          <dd>{formatTime(session.startTime)} · {durationMinutes} minutes</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-sm text-neutral-500">Booking code</dt>
          <dd className="font-mono text-base tracking-wider text-neutral-900">{session.bookingCode}</dd>
        </div>
      </dl>

      <div className="mt-6">
        {windowState === 'open' && (
          <>
            <Button
              size="lg"
              className="h-12 w-full bg-brand text-base text-white hover:bg-brand-dark"
              disabled={phase === 'connecting'}
              onClick={join}
            >
              {phase === 'connecting' ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Connecting…</>
              ) : (
                <><Video className="mr-2 h-5 w-5" /> {phase === 'left' ? 'Rejoin appointment' : 'Join appointment'}</>
              )}
            </Button>
            <p className="mt-3 text-center text-sm text-neutral-500">
              We&apos;ll ask to use your camera and microphone.
            </p>
          </>
        )}
        {windowState === 'too_early' && (
          <>
            <Button size="lg" className="h-12 w-full text-base" disabled>
              Opens at {formatTime(session.opensAt)}
            </Button>
            <p className="mt-3 text-center text-sm text-neutral-500">
              You can join from {Math.round((session.startTime - session.opensAt) / 60_000)} minutes before your appointment. Keep this page open.
            </p>
          </>
        )}
        {windowState === 'ended' && <p className="text-neutral-600">{REFUSAL_TEXT.ended}</p>}
        {windowState === 'cancelled' && <p className="text-neutral-600">{REFUSAL_TEXT.cancelled}</p>}
        {notice && windowState === 'open' && (
          <p role="alert" className="mt-3 text-center text-sm text-red-600">{notice}</p>
        )}
      </div>
    </Shell>
  )
}
