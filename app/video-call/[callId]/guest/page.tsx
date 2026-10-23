'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { StreamCall, StreamTheme, StreamVideo, StreamVideoClient } from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { Loader2, PhoneOff, Shield, XOctagon } from '@/components/icons'
import { CallLobby, CallRoom, CallStatusScreen } from '@/components/video/room'

type StreamCallHandle = ReturnType<StreamVideoClient['call']>

const primaryButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-8 text-[15px] font-medium text-white shadow-[0_12px_30px_-12px_rgba(0,91,87,0.7)] transition-all hover:bg-brand-dark active:scale-[0.98]'

// AwaDoc guest patients join with a signed guest token instead of a login.
export default function GuestVideoCallPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const callId = params.callId as string
  const guestToken = searchParams.get('guest')

  const [phase, setPhase] = useState<'validating' | 'lobby' | 'joining' | 'in_call' | 'ended' | 'error'>('validating')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [physioName, setPhysioName] = useState<string | null>(null)
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  const [call, setCall] = useState<StreamCallHandle | null>(null)
  const initializedRef = useRef(false)

  // Validate the guest token, then prepare the call for the lobby.
  useEffect(() => {
    if (!guestToken || !callId || initializedRef.current) return
    initializedRef.current = true
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const init = async () => {
      try {
        const res = await fetch('/api/awadoc/validate-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ therapyId: callId, guestToken }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (!res.ok || !data.valid) {
          setError(data.error ?? 'Invalid or expired link')
          setPhase('error')
          return
        }
        setPhysioName(data.session.physioName ?? null)
        const streamClient = StreamVideoClient.getOrCreateInstance({
          apiKey: data.stream.apiKey,
          user: { id: data.stream.userId, name: data.stream.userName },
          token: data.stream.token,
        })
        setClient(streamClient)
        setCall(streamClient.call('default', callId))
        setPhase('lobby')
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === 'AbortError'
            ? 'Connection timed out. Please try again.'
            : err instanceof Error ? err.message : 'Failed to open your therapy session',
        )
        setPhase('error')
        console.error('[AwaDoc Guest] Init error:', err)
      } finally {
        clearTimeout(timeoutId)
      }
    }
    // No abort on cleanup: the ref guard means a Strict Mode remount would never retry.
    void init()
  }, [callId, guestToken])

  // Release the camera, microphone and socket when the page closes.
  useEffect(() => () => { void client?.disconnectUser() }, [client])

  const join = async () => {
    if (!call) return
    setPhase('joining')
    setNotice(null)
    try {
      await call.join({ create: false })
      setPhase('in_call')
    } catch (err) {
      console.error('[AwaDoc Guest] Join error:', err)
      setNotice("We couldn't connect you. Your physiotherapist may not have started the session yet — try again in a moment.")
      setPhase('lobby')
    }
  }

  const handleLeft = useCallback(() => {
    setCall(null)
    setPhase('ended')
  }, [])

  const rejoin = () => {
    if (!client) return
    // A call that has been left can't be rejoined, so take a fresh handle.
    setCall(client.call('default', callId))
    setPhase('lobby')
  }

  const withPhysio = physioName ?? 'your physiotherapist'

  if (!guestToken) {
    return (
      <CallStatusScreen
        icon={<Shield className="h-6 w-6" />}
        title="Link incomplete"
        description="This link is missing its access token. Please use the link AwaDoc sent you to join your therapy session."
      />
    )
  }

  if (phase === 'error') {
    return (
      <CallStatusScreen
        icon={<XOctagon className="h-6 w-6" />}
        title="Unable to join"
        description={
          <>
            {error}
            <br />
            Please contact AwaDoc for a new link.
          </>
        }
      />
    )
  }

  if (phase === 'ended') {
    return (
      <CallStatusScreen
        icon={<PhoneOff className="h-6 w-6" />}
        title="Session complete"
        description={`Thank you for your session with ${withPhysio}. Your physiotherapist will follow up with any recommended next steps.`}
      >
        {client && (
          <button type="button" onClick={rejoin} className={primaryButton}>
            Rejoin
          </button>
        )}
      </CallStatusScreen>
    )
  }

  if (!client || !call || phase === 'validating') {
    return <CallStatusScreen icon={<Loader2 className="h-6 w-6 animate-spin text-brand" />} title="Verifying your access" description="Powered by Rehabify Health" />
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamTheme className="h-full">
          {phase === 'in_call' ? (
            <CallRoom title={`Therapy session with ${withPhysio}`} waitingFor={physioName ?? undefined} onLeft={handleLeft} />
          ) : (
            <CallLobby
              eyebrow="AwaDoc therapy session"
              details={<p>with <span className="font-medium text-neutral-900">{withPhysio}</span></p>}
              joining={phase === 'joining'}
              notice={notice}
              onJoin={() => void join()}
            />
          )}
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}
