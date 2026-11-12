'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StreamVideo, StreamVideoClient, StreamCall, StreamTheme, CallingState } from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { useUser } from '@clerk/nextjs'
import { PhoneOff } from '@/components/icons'
import { toast } from 'sonner'
import { StreamChat } from 'stream-chat'
import { useAction, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { CallLobby, CallRoom, CallStatusScreen } from '@/components/video/room'
import { useActiveCall } from '@/components/video/activeCall/ActiveCallProvider'
import type { CallScribeConfig } from '@/components/video/room/CallScribePanel'

// By name: the generated api type is at TypeScript's depth limit (TS2589)
const myUserRef = makeFunctionReference<
  'query',
  Record<string, never>,
  { _id: string; firstName?: string; lastName?: string; imageUrl?: string } | null
>('users:getMyUser')
const getStreamTokenRef = makeFunctionReference<
  'action',
  { userId: string; userName: string; userImage?: string; callId?: string; callType?: string },
  { token: string; apiKey: string; userId: string; chatToken?: string }
>('stream:getStreamToken')
const createStreamCallRef = makeFunctionReference<
  'action',
  {
    callId: string
    callType?: 'default' | 'livestream' | 'audio_room' | 'development'
    participants: Array<{ userId: string; userName: string; userImage?: string; role?: 'host' | 'participant' }>
    settings?: { recordingEnabled?: boolean; transcriptionEnabled?: boolean; maxDuration?: number; geoFencing?: boolean }
  },
  unknown
>('stream:createStreamCall')
const endStreamCallRef = makeFunctionReference<'action', { callId: string; callType?: string }, unknown>(
  'stream:endStreamCall'
)
const ensureChatMembershipRef = makeFunctionReference<'action', { callId: string; userId?: string }, unknown>(
  'stream:ensureChatMembership'
)
const setMyRsvpStatusRef = makeFunctionReference<
  'mutation',
  { roomId: string; status: 'invited' | 'accepted' | 'declined' | 'tentative' },
  unknown
>('videoCalls:setMyRsvpStatus')
const joinVideoCallRef = makeFunctionReference<'mutation', { roomId: string }, unknown>('videoCalls:joinVideoCall')

interface StreamVideoCallProps {
  callId: string
  callType?: 'default' | 'livestream' | 'audio_room' | 'development'
  /** After leaving from this page: where to go next */
  onCallEnd: () => void
  /** After leaving from anywhere, this page or the small call window (e.g. tell AwaDoc) */
  afterLeave?: () => void
  /** Physios: the patient's record, opened with the call carrying on in a small window */
  recordHref?: string
  /** Physios: the AI scribe for this call's patient (components/video/room/CallScribePanel.tsx) */
  scribe?: CallScribeConfig
  /** Where "Use the app" goes, with the call carrying on in a small window */
  appHref?: string
  /** Navigates within the app (the call keeps going) */
  navigate?: (href: string) => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  participants?: Array<{
    userId: string
    userName: string
    userImage?: string
    role?: 'host' | 'participant'
  }>
}

type StreamCallHandle = ReturnType<StreamVideoClient['call']>

export default function StreamVideoCall({
  callId,
  callType = 'default',
  onCallEnd,
  afterLeave,
  recordHref,
  appHref,
  navigate,
  isFullscreen = false,
  participants,
  scribe,
}: StreamVideoCallProps) {
  const { user, isLoaded } = useUser()
  // Prefer the Convex profile (uploaded photo, full name) over Clerk's.
  const convexUser = useQuery(myUserRef)
  const active = useActiveCall()
  // This call is already joined and kept going (back from the small call window)
  const resumed = active.session?.callId === callId ? active.session : null
  const showingCall = resumed !== null
  const { showFull } = active

  // Shown full-size here, so no small call window on top of it
  useEffect(() => {
    if (!showingCall) return
    return showFull(callId)
  }, [showingCall, callId, showFull])

  const [client, setClient] = useState<StreamVideoClient | null>(null)
  const [call, setCall] = useState<StreamCallHandle | null>(null)
  const [chatToken, setChatToken] = useState<string | undefined>()
  const [apiKey, setApiKey] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const initializedRef = useRef(false)

  const getStreamToken = useAction(getStreamTokenRef)
  const createStreamCall = useAction(createStreamCallRef)
  const endStreamCall = useAction(endStreamCallRef)
  const ensureChatMembership = useAction(ensureChatMembershipRef)
  const setMyRsvpStatus = useMutation(setMyRsvpStatusRef)
  const joinVideoCallMutation = useMutation(joinVideoCallRef)

  // Participant IDs come from the call's Convex record (Convex user IDs), not Clerk.
  const isMe = (id: string) => id === user?.id || id === convexUser?._id
  // Hosts may end the call for everyone.
  const canEndForAll = !!participants?.some((p) => isMe(p.userId) && p.role === 'host')
  const others = (participants ?? []).filter((p) => !isMe(p.userId))

  const displayName = React.useMemo(() => {
    const full = [convexUser?.firstName, convexUser?.lastName].filter(Boolean).join(' ')
    return full || user?.fullName || user?.emailAddresses[0]?.emailAddress || 'Guest'
  }, [convexUser?.firstName, convexUser?.lastName, user?.fullName, user?.emailAddresses])
  const displayImage = convexUser?.imageUrl || user?.imageUrl

  // Connect and prepare the call (without joining) so the lobby can preview devices.
  useEffect(() => {
    if (resumed || !isLoaded || !user || initializedRef.current) return
    initializedRef.current = true

    const prepare = async () => {
      try {
        // The token only works for this call, so each call gets its own client
        // (a cached client would still hold the token for a previous call)
        const res = await getStreamToken({ userId: user.id, userName: displayName, userImage: displayImage, callId, callType })
        const streamClient = new StreamVideoClient({
          apiKey: res.apiKey,
          user: { id: user.id, name: displayName, image: displayImage },
          token: res.token,
        })
        setApiKey(res.apiKey)
        setChatToken(res.chatToken)
        setClient(streamClient)
        setCall(streamClient.call(callType, callId))
      } catch (err) {
        console.error('Failed to prepare Stream call:', err)
        setError(err instanceof Error ? err.message : 'Failed to set up the video call')
      }
    }
    void prepare()
  }, [resumed, isLoaded, user, callId, callType, getStreamToken, displayName, displayImage])

  const connectChat = useCallback(async () => {
    if (!chatToken || !apiKey || !user) return
    try {
      const chatClient = StreamChat.getInstance(apiKey)
      if (!chatClient.userID) {
        await chatClient.connectUser({ id: user.id, name: displayName, image: displayImage }, chatToken)
      }
      const channel = chatClient.channel('messaging', callId, { name: 'In-call messages' })
      try {
        await channel.watch()
      } catch {
        // Not a member yet: add membership server-side, then retry.
        try { await ensureChatMembership({ callId, userId: user.id }) } catch { }
        try { await channel.watch() } catch {
          try { await channel.create(); await channel.watch() } catch { }
        }
      }
      // Non-member watchers can't mark messages read.
      if (!channel.state.members[user.id]) {
        try { await ensureChatMembership({ callId, userId: user.id }) } catch { }
        try { await channel.watch() } catch { }
      }
      active.updateSession({ chat: { client: chatClient, channel } })
    } catch (err) {
      console.warn('In-call chat unavailable:', err)
    }
  }, [chatToken, apiKey, user, displayName, displayImage, callId, ensureChatMembership, active])

  const join = async () => {
    if (!call || !client || !user) return
    setJoining(true)
    try {
      // Only one call at a time: leave any other call still going in the small window
      if (active.session && active.session.callId !== callId) {
        await active.endSession()
        toast.info('You left your other call')
      }
      try {
        // Ensures the call exists with this user as host; harmless if it already exists.
        await createStreamCall({
          callId,
          callType,
          participants: [{ userId: user.id, userName: displayName, userImage: displayImage, role: 'host' }],
          settings: { recordingEnabled: false, transcriptionEnabled: false, maxDuration: 7200, geoFencing: false },
        })
      } catch (e) {
        console.debug('[stream] createStreamCall (likely already exists):', e)
      }
      await call.join({ create: true })
      // From here the call belongs to the whole app: it keeps going on other pages
      active.setSession({
        callId,
        callType,
        client,
        call,
        chat: null,
        joinedAt: Date.now(),
        withName: others.length === 1 ? others[0].userName : undefined,
        afterLeave,
      })
      void joinVideoCallMutation({ roomId: callId }).catch((e) => console.warn('[stream] joinVideoCall failed:', e))
      void setMyRsvpStatus({ roomId: callId, status: 'accepted' }).catch((e) => console.warn('[rsvp] failed:', e))
      void connectChat()
    } catch (err) {
      console.error('Failed to join call:', err)
      toast.error("Couldn't join the call. Check your connection and try again.")
    } finally {
      setJoining(false)
    }
  }

  // Left from this page (or the call ended here): disconnect, then go on
  const [ended, setEnded] = useState(false)
  const left = useCallback(async () => {
    setEnded(true)
    await active.endSession()
    onCallEnd()
  }, [active, onCallEnd])

  const endForAll = async () => {
    const current = active.session
    try {
      await endStreamCall({ callId, callType })
    } catch (err) {
      console.error('endStreamCall failed:', err)
      toast.error("Couldn't end the call for everyone")
      return
    }
    try {
      if (current && current.call.state.callingState !== CallingState.LEFT) await current.call.leave()
    } catch { }
    await left()
  }

  if (error) {
    return (
      <CallStatusScreen icon={<PhoneOff className="h-6 w-6" />} title="Couldn't set up the call" description={error}>
        <button
          type="button"
          onClick={onCallEnd}
          className="h-11 rounded-full bg-neutral-900 px-6 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Go back
        </button>
      </CallStatusScreen>
    )
  }

  if (ended) {
    return <CallStatusScreen icon={<PhoneOff className="h-6 w-6" />} title="Call ended" />
  }

  const shownClient = resumed?.client ?? client
  const shownCall = resumed?.call ?? call
  if (!isLoaded || !shownClient || !shownCall) {
    return <CallStatusScreen loading title="Getting your call ready" />
  }

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50' : 'h-[100dvh]'}>
      <StreamVideo client={shownClient}>
        <StreamCall call={shownCall}>
          <StreamTheme className="h-full">
            {resumed ? (
              <CallRoom
                onLeft={() => void left()}
                onEndForAll={canEndForAll ? () => void endForAll() : undefined}
                waitingFor={others.length === 1 ? others[0].userName : undefined}
                chat={resumed.chat}
                startedAt={resumed.joinedAt}
                onOpenRecord={recordHref && navigate ? () => navigate(recordHref) : undefined}
                onMinimize={appHref && navigate ? () => navigate(appHref) : undefined}
                scribe={scribe}
              />
            ) : (
              <CallLobby
                eyebrow="Video call"
                details={others.length > 0 && <p>With {others.map((p) => p.userName).join(', ')}</p>}
                joining={joining}
                onJoin={() => void join()}
              />
            )}
          </StreamTheme>
        </StreamCall>
      </StreamVideo>
    </div>
  )
}
