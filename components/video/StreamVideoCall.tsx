'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StreamVideo, StreamVideoClient, StreamCall, StreamTheme, CallingState } from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { useUser } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import { Loader2, PhoneOff } from '@/components/icons'
import { toast } from 'sonner'
import { StreamChat } from 'stream-chat'
import { useAction, useMutation, useQuery } from 'convex/react'
import { CallLobby, CallRoom, CallStatusScreen, type CallChat } from '@/components/video/room'

interface StreamVideoCallProps {
  callId: string
  callType?: 'default' | 'livestream' | 'audio_room' | 'development'
  onCallEnd: () => void
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
  isFullscreen = false,
  participants,
}: StreamVideoCallProps) {
  const { user, isLoaded } = useUser()
  // Prefer the Convex profile (uploaded photo, full name) over Clerk's.
  const convexUser = useQuery(api.users.getMyUser)
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  const [call, setCall] = useState<StreamCallHandle | null>(null)
  const [chatToken, setChatToken] = useState<string | undefined>()
  const [apiKey, setApiKey] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [chat, setChat] = useState<CallChat | null>(null)
  const initializedRef = useRef(false)

  const getStreamToken = useAction(api.stream.getStreamToken)
  const createStreamCall = useAction(api.stream.createStreamCall)
  const endStreamCall = useAction(api.stream.endStreamCall)
  const ensureChatMembership = useAction(api.stream.ensureChatMembership)
  const setMyRsvpStatus = useMutation(api.videoCalls.setMyRsvpStatus)
  const joinVideoCallMutation = useMutation(api.videoCalls.joinVideoCall)

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
    if (!isLoaded || !user || initializedRef.current) return
    initializedRef.current = true

    const prepare = async () => {
      try {
        // The token only works for this call, so each call page gets its own client
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
  }, [isLoaded, user, callId, callType, getStreamToken, displayName, displayImage])

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
      setChat({ client: chatClient, channel })
    } catch (err) {
      console.warn('In-call chat unavailable:', err)
    }
  }, [chatToken, apiKey, user, displayName, displayImage, callId, ensureChatMembership])

  const join = async () => {
    if (!call || !user) return
    setJoining(true)
    try {
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
      setJoined(true)
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

  const endForAll = async () => {
    try {
      await endStreamCall({ callId, callType })
    } catch (err) {
      console.error('endStreamCall failed:', err)
      toast.error("Couldn't end the call for everyone")
      return
    }
    try {
      const state = call?.state.callingState
      if (state !== CallingState.LEFT) await call?.leave()
    } catch { }
    onCallEnd()
  }

  // Disconnect only on real page unload so Strict Mode remounts don't drop the call.
  useEffect(() => {
    const handleUnload = () => {
      try { void chat?.client.disconnectUser() } catch { }
      try { void client?.disconnectUser() } catch { }
    }
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [client, chat])

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

  if (!isLoaded || !client || !call) {
    return <CallStatusScreen icon={<Loader2 className="h-6 w-6 animate-spin text-brand" />} title="Getting your call ready" />
  }

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50' : 'h-[100dvh]'}>
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamTheme className="h-full">
            {joined ? (
              <CallRoom
                onLeft={onCallEnd}
                onEndForAll={canEndForAll ? () => void endForAll() : undefined}
                waitingFor={others.length === 1 ? others[0].userName : undefined}
                chat={chat}
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
