'use client'
import React, { useEffect, useState, useRef } from 'react'
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  useCallStateHooks,
  SpeakerLayout,
  CallingState,
  useCall,
  StreamTheme,
  CallControls,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { useUser } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Loader2, Phone, Video, Users, Copy, XOctagon, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { StreamChat } from 'stream-chat'
import { Chat as StreamChatUI, Channel, MessageList, MessageInput, Window as ChatWindow, ChannelHeader, Thread } from 'stream-chat-react'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { useActionUntyped, useMutationUntyped } from '@/lib/convexUntyped'

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

// Floating control bar wrapped around Stream's reliable CallControls
const FloatingCallControls = ({ onLeave, canEndForAll, onEndForAll }: { onLeave: () => void; canEndForAll: boolean; onEndForAll: () => void }) => {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex items-center justify-center">
      <div className="pointer-events-auto rounded-full bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40 shadow-lg ring-1 ring-white/10">
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 text-white">
          <CallControls onLeave={onLeave} />
          {canEndForAll && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onEndForAll}
              className="ml-1 rounded-full bg-red-600/80 hover:bg-red-600 text-white"
              title="End call for everyone"
            >
              <XOctagon className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// Call UI Component
const CallUI = ({ onCallEnd, callId, showChat, onToggleChat, chatClient, chatChannel, onEndForAll, canEndForAll }: { onCallEnd: () => void, callId: string, showChat: boolean, onToggleChat: () => void, chatClient: StreamChat | null, chatChannel: ReturnType<StreamChat['channel']> | null, onEndForAll: () => void, canEndForAll: boolean }) => {
  const call = useCall()
  const { useCallCallingState, useParticipantCount } = useCallStateHooks()
  const callingState = useCallCallingState()
  const participantCount = useParticipantCount()
  const [copied, setCopied] = useState(false)
  const [showShareLink, setShowShareLink] = useState(true)

  const shareLink = `${window.location.origin}/video-call/${callId}`

  // Do not auto-navigate on transient LEFT/OFFLINE states; only navigate on explicit user actions.

  const handleLeave = async () => {
    try {
      await call?.leave()
      onCallEnd()
    } catch (error) {
      // Ignore error if already left; callingState effect will handle navigation
      console.error('Error leaving call:', error)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (callingState === CallingState.JOINING) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-700" />
          <p className="text-xl">Joining call...</p>
          <p className="text-sm text-gray-400">Call ID: {callId}</p>
        </div>
      </div>
    )
  }

  if (callingState === CallingState.OFFLINE) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        <div className="text-center space-y-4">
          <Phone className="h-12 w-12 text-red-600 mx-auto" />
          <p className="text-xl">Call Disconnected</p>
          <Button onClick={onCallEnd} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-white">
      {/* Share Link Banner */}
      {showShareLink && (
        <div className="bg-emerald-600 text-white p-3 relative">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-medium whitespace-nowrap">Share link:</span>
              <code className="bg-emerald-700 px-3 py-1 rounded text-sm flex-1 overflow-x-auto">
                {shareLink}
              </code>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={copyLink}
                    className="whitespace-nowrap"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Link
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy link</TooltipContent>
              </Tooltip>
              {copied && (
                <span className="text-xs text-white/90 bg-green-700 px-2 py-1 rounded">Copied!</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowShareLink(false)}
                className="text-white hover:text-gray-200"
              >
                ✕
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-neutral-900/60 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-white" />
            <span className="text-white/90">{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Video className="h-5 w-5 text-emerald-400" />
            <span className="text-emerald-400">Stream Video Active</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={onToggleChat}>
            <MessageSquare className="h-4 w-4 mr-1" /> {showChat ? 'Hide Chat' : 'Show Chat'}
          </Button>
          <div className="text-sm text-white/60">
            Call ID: {callId}
          </div>
        </div>
      </div>

      {/* Video + Chat */}
      <div className="flex-1 relative bg-neutral-950 p-0 sm:p-4">
        <div className="h-full w-full flex gap-0 sm:gap-4">
          <div className="flex-1 min-w-0 rounded-none sm:rounded-md overflow-hidden border-0 sm:border">
            <SpeakerLayout participantsBarPosition="bottom" />
          </div>
          {showChat && chatClient && chatChannel && (
            <div className="w-[360px] min-w-[320px] max-w-[420px] h-full rounded-md overflow-hidden border bg-white text-gray-900">
              <StreamChatUI client={chatClient} theme="str-chat__theme-light">
                <Channel channel={chatChannel}>
                  <ChatWindow>
                    <ChannelHeader title={`Call ${callId}`} live />
                    <MessageList hideDeletedMessages={true} />
                    <MessageInput focus />
                    <Thread fullWidth={false} />
                  </ChatWindow>
                </Channel>
              </StreamChatUI>
            </div>
          )}
        </div>
      </div>

      {/* Floating Controls (never disappear) */}
      <FloatingCallControls onLeave={handleLeave} canEndForAll={canEndForAll} onEndForAll={onEndForAll} />
    </div>
  )
}

// Main Stream Video Call Component
export default function StreamVideoCall({
  callId,
  callType = 'default',
  onCallEnd,
  isFullscreen = false,
  participants,
}: StreamVideoCallProps) {
  const { user, isLoaded } = useUser()
  // Prefer Convex user's uploaded profile photo (fallback to Clerk)
  const apiUntypedAll = api as unknown as Record<string, unknown>
  const usersModule = apiUntypedAll['users'] as Record<string, unknown>
  const getMyUserQuery = usersModule['getMyUser']
  const convexUser = useQueryUntyped(getMyUserQuery) as { firstName?: string; imageUrl?: string } | null | undefined
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  type StreamCallHandle = ReturnType<StreamVideoClient['call']>
  const [call, setCall] = useState<StreamCallHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initializedRef = useRef(false)
  const [chatClient, setChatClient] = useState<StreamChat | null>(null)
  const [chatChannel, setChatChannel] = useState<ReturnType<StreamChat['channel']> | null>(null)
  const [showChat, setShowChat] = useState(true)
  const [canEndForAll, setCanEndForAll] = useState(false)
  
  // Access Convex API modules via unknown-indexers to avoid deep type instantiation
  const apiUntyped = api as unknown as Record<string, unknown>
  const streamModule = apiUntyped['stream'] as Record<string, unknown>
  const videoCallsModule = apiUntyped['videoCalls'] as Record<string, unknown>

  const getStreamToken = useActionUntyped(streamModule['getStreamToken']) as unknown as (
    args: { userId: string; userName: string; userImage?: string }
  ) => Promise<{ token: string; apiKey: string; chatToken?: string }>
  const createStreamCall = useActionUntyped(streamModule['createStreamCall']) as unknown as (
    args: {
      callId: string
      callType: string
      participants: Array<{ userId: string; userName: string; userImage?: string; role?: 'host' | 'participant' }>
      settings?: { recordingEnabled?: boolean; transcriptionEnabled?: boolean; maxDuration?: number; geoFencing?: boolean }
    }
  ) => Promise<{ callId: string; callType: string; cid: string; created: boolean }>
  const endStreamCall = useActionUntyped(streamModule['endStreamCall']) as unknown as (
    args: { callId: string; callType: string }
  ) => Promise<void>
  const ensureChatMembership = useActionUntyped(streamModule['ensureChatMembership']) as unknown as (
    args: { callId: string; userId: string }
  ) => Promise<void>
  const setMyRsvpStatus = useMutationUntyped(videoCallsModule['setMyRsvpStatus']) as unknown as (
    args: { roomId: string; status: 'accepted' | 'declined' | 'maybe' }
  ) => Promise<void>
  
  const onCallEndRef = useRef(onCallEnd)
  useEffect(() => {
    onCallEndRef.current = onCallEnd
  }, [onCallEnd])

  // Determine if the current user can end the call for everyone (host)
  useEffect(() => {
    if (!user) return
    try {
      // Prefer roles from provided participants if available
      const isHostFromProps = Array.isArray(participants)
        ? !!participants.find(p => p.userId === user.id && p.role === 'host')
        : false
      setCanEndForAll(isHostFromProps)
    } catch {
      setCanEndForAll(false)
    }
  }, [participants, user])

  // Compute display fields used in initialization
  const displayName = React.useMemo(
    () => convexUser?.firstName || user?.fullName || user?.emailAddresses[0]?.emailAddress || 'Anonymous',
    [convexUser?.firstName, user?.fullName, user?.emailAddresses]
  )
  const displayImage = React.useMemo(
    () => convexUser?.imageUrl || user?.imageUrl,
    [convexUser?.imageUrl, user?.imageUrl]
  )

  // Initialize Stream client and call
  useEffect(() => {
    if (!isLoaded || !user || client) return
    if (initializedRef.current) return
    initializedRef.current = true

    const initializeStream = async () => {
      try {
        console.log('Initializing Stream Video for call:', callId)

        // Get Stream token from Convex
        const { token, apiKey, chatToken } = await getStreamToken({
          userId: user.id,
          userName: displayName,
          userImage: displayImage,
        })

        console.log('Got Stream token, API Key:', apiKey)

        // Initialize or reuse Stream client instance to avoid duplicates
        const streamClient = StreamVideoClient.getOrCreateInstance({
          apiKey,
          user: {
            id: user.id,
            name: displayName,
            image: displayImage,
          },
          token,
        })

        console.log('Stream client initialized')
        setClient(streamClient)

        // Ensure the call exists server-side with proper roles (host for creator)
        try {
          await createStreamCall({
            callId,
            callType,
            participants: [
              {
                userId: user.id,
                userName: displayName,
                userImage: displayImage,
                role: 'host',
              },
            ],
            settings: {
              recordingEnabled: false,
              transcriptionEnabled: false,
              maxDuration: 7200,
              geoFencing: false,
            },
          })
        } catch (e) {
          // Safe to ignore if it already exists
          console.debug('[stream] createStreamCall idempotent failure (likely exists):', e)
        }

        // Create call handle and join (create if needed) without auto-starting devices
        const streamCall = streamClient.call(callType, callId)
        await streamCall.join({ create: true })

        // Mark RSVP as accepted for this user
        try {
          await setMyRsvpStatus({ roomId: callId, status: 'accepted' })
        } catch (error) {
          console.warn('[rsvp] failed to mark accepted:', error)
        }

        setCall(streamCall)
        console.log('Successfully joined Stream call')
        toast.success('Joined call successfully')

        // Initialize Stream Chat client and channel for this call
        if (chatToken) {
          try {
            const sc = StreamChat.getInstance(apiKey)
            await sc.connectUser({
              id: user.id,
              name: displayName,
              image: displayImage,
            }, chatToken)

            const channel = sc.channel('messaging', callId, { name: `Call ${callId}` })
            try {
              await channel.watch()
            } catch {
              // If watch fails (likely due to membership), ensure membership server-side then retry
              try { await ensureChatMembership({ callId, userId: user.id }) } catch {}
              try {
                await channel.watch()
              } catch {
                try { await channel.create(); await channel.watch() } catch {}
              }
            }
            // Ensure the current user is a channel member even if watch succeeded (non-member watchers can't markRead)
            try {
              type ChannelLike = {
                state?: { members?: Record<string, unknown> | Map<string, unknown> }
                addMembers?: (ids: string[]) => Promise<void>
                markRead?: () => Promise<void>
              }
              const c = channel as unknown as ChannelLike
              const members = c?.state?.members
              const meMember = members instanceof Map
                ? members.get(user.id)
                : (members as Record<string, unknown> | undefined)?.[user.id]
              if (!meMember) {
                try { await ensureChatMembership({ callId, userId: user.id }) } catch {}
                // Best-effort client-side addMembers in case server path is slow
                try { await c.addMembers?.([user.id]) } catch {}
                try { await channel.watch() } catch {}
              }
              // Best-effort markRead now that membership should be ensured
              try { await c.markRead?.() } catch {}
            } catch {}
            setChatClient(sc)
            setChatChannel(channel)
          } catch (error) {
            console.warn('Chat initialization failed:', error)
          }
        } else {
          console.warn('No Stream Chat token issued; disabling in-call chat UI to prevent markRead errors')
          setShowChat(false)
        }
      } catch (error) {
        console.error('Failed to initialize Stream:', error)
        setError(error instanceof Error ? error.message : 'Failed to initialize video call')
        toast.error('Failed to join call: ' + (error instanceof Error ? error.message : 'Unknown error'))
      }
    }

    initializeStream()
  }, [isLoaded, user, callId, callType, client, getStreamToken, createStreamCall, ensureChatMembership, setMyRsvpStatus, displayName, displayImage])

  // Disconnect only on actual page unload to avoid Strict Mode double-unmounts interrupting the call.
  useEffect(() => {
    const handleUnload = () => {
      // Fire-and-forget; the browser may terminate the process quickly
      try { chatClient?.disconnectUser() } catch {}
      try { client?.disconnectUser() } catch {}
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleUnload)
      window.addEventListener('pagehide', handleUnload)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleUnload)
        window.removeEventListener('pagehide', handleUnload)
      }
    }
  }, [client, chatClient])

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-700" />
          <p className="text-xl">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        <div className="text-center space-y-4">
          <Phone className="h-12 w-12 text-red-600 mx-auto" />
          <p className="text-xl">Call Connection Failed</p>
          <p className="text-gray-400">{error}</p>
          <Button onClick={onCallEnd} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  if (!client || !call) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-700" />
          <p className="text-xl">Initializing video call...</p>
          <p className="text-gray-500">Please wait while we set up your call</p>
          <Button onClick={onCallEnd} variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamTheme>
          <div className={`rehabify-stream ${isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'}`}>
            <CallUI 
              onCallEnd={onCallEnd} 
              callId={callId} 
              showChat={showChat} 
              onToggleChat={() => setShowChat(!showChat)} 
              chatClient={chatClient}
              chatChannel={chatChannel}
              onEndForAll={async () => {
                if (window.confirm('End call for everyone? Participants will not be able to rejoin this call.')) {
                  try {
                    // End the call for everyone on the server first
                    try { await endStreamCall({ callId, callType }) } catch (error) {
                      console.error('endStreamCall failed:', error)
                      toast.error('Failed to end call for everyone')
                    }
                    // Best-effort local leave; ignore if already left
                    try {
                      const state = call?.state?.callingState
                      if (state !== CallingState.LEFT && state !== CallingState.OFFLINE) {
                        await call?.leave()
                      }
                    } catch (leaveErr) {
                      console.warn('Ignoring leave error during end-for-all:', leaveErr)
                    }
                  } finally {
                    // Always navigate away from the call page
                    onCallEnd()
                  }
                }
              }}
              canEndForAll={canEndForAll}
            />
          </div>
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}
