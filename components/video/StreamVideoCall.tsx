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
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { useUser } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Loader2, Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Monitor, Users, Copy, XOctagon, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { StreamChat } from 'stream-chat'
import { Chat as StreamChatUI, Channel, MessageList, MessageInput, Window as ChatWindow, ChannelHeader, Thread } from 'stream-chat-react'
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

// Custom Call Controls Component
const CustomCallControls = ({ onLeave, onEndForAll }: { onLeave: () => void, onEndForAll: () => void }) => {
  const { useMicrophoneState, useCameraState, useScreenShareState } = useCallStateHooks()
  
  const { microphone, isMute: isMicMuted } = useMicrophoneState()
  const { camera, isMute: isCameraMuted } = useCameraState()
  const { screenShare } = useScreenShareState()

  const toggleMicrophone = async () => {
    try {
      if (isMicMuted) {
        await microphone.enable()
      } else {
        await microphone.disable()
      }
    } catch (error: unknown) {
      const e = error as Error & { name?: string }
      const msg = e?.name === 'NotReadableError'
        ? 'Your microphone is in use by another app. Close other apps using the mic and try again.'
        : (e?.message || 'Failed to access microphone')
      toast.error(msg)
      console.error('[devices]: Failed to get audio stream', e)
    }
  }

  const toggleCamera = async () => {
    try {
      if (isCameraMuted) {
        await camera.enable()
      } else {
        await camera.disable()
      }
    } catch (error: unknown) {
      const e = error as Error & { name?: string }
      const msg = e?.name === 'NotReadableError'
        ? 'Could not start camera. It may be in use by another app (Zoom/Teams/browser tab) or blocked by OS permissions.'
        : (e?.message || 'Failed to access camera')
      toast.error(msg)
      console.error('[devices]: Failed to get video stream', e)
    }
  }

  const toggleScreenShare = async () => {
    try {
      const isSharing = (screenShare as { status?: string } | undefined)?.status === 'enabled'
      if (isSharing) {
        await screenShare.disable()
      } else {
        await screenShare.enable()
      }
    } catch (error: unknown) {
      const e = error as Error
      toast.error(e?.message || 'Failed to toggle screen sharing')
      console.error('[devices]: Failed to toggle screen share', e)
    }
  }

  return (
    <div className="flex items-center justify-center space-x-4 p-4 bg-gray-900 border-t border-gray-800 text-white">
      <Button
        variant="ghost"
        size="lg"
        onClick={toggleMicrophone}
        className={`rounded-full bg-white/10 hover:bg-white/20 text-white ${isMicMuted ? 'ring-2 ring-red-500/40' : ''}`}
      >
        {isMicMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </Button>
      
      <Button
        variant="ghost"
        size="lg"
        onClick={toggleCamera}
        className={`rounded-full bg-white/10 hover:bg-white/20 text-white ${isCameraMuted ? 'ring-2 ring-red-500/40' : ''}`}
      >
        {isCameraMuted ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
      </Button>
      
      <Button
        variant="ghost"
        size="lg"
        onClick={toggleScreenShare}
        className={`rounded-full bg-white/10 hover:bg-white/20 text-white ${((screenShare as { status?: string } | undefined)?.status === 'enabled') ? 'ring-2 ring-emerald-500/40' : ''}`}
      >
        <Monitor className="h-5 w-5" />
      </Button>
      
      <Button
        variant="ghost"
        size="lg"
        onClick={onLeave}
        className="rounded-full bg-red-600/80 hover:bg-red-600 text-white"
      >
        <PhoneOff className="h-5 w-5" />
      </Button>

      {/* End for Everyone (host-controlled in future) */}
      <Button
        variant="ghost"
        size="lg"
        onClick={onEndForAll}
        className="rounded-full bg-red-700/80 hover:bg-red-700 text-white"
        title="End call for everyone"
      >
        <XOctagon className="h-5 w-5" />
      </Button>
    </div>
  )
}

// Call UI Component
const CallUI = ({ onCallEnd, callId, showChat, onToggleChat, chatClient, chatChannel, onEndForAll }: { onCallEnd: () => void, callId: string, showChat: boolean, onToggleChat: () => void, chatClient: StreamChat | null, chatChannel: ReturnType<StreamChat['channel']> | null, onEndForAll: () => void }) => {
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
    <div className="h-screen flex flex-col bg-white">
      {/* Share Link Banner */}
      {showShareLink && (
        <div className="bg-green-600 text-white p-3 relative">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-medium whitespace-nowrap">Share link:</span>
              <code className="bg-green-700 px-3 py-1 rounded text-sm flex-1 overflow-x-auto">
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
      <div className="bg-white text-gray-900 px-4 py-3 flex items-center justify-between border-b">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Video className="h-5 w-5 text-green-600" />
            <span className="text-green-600">Stream Video Active</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={onToggleChat}>
            <MessageSquare className="h-4 w-4 mr-1" /> {showChat ? 'Hide Chat' : 'Show Chat'}
          </Button>
          <div className="text-sm text-gray-500">
            Call ID: {callId}
          </div>
        </div>
      </div>

      {/* Video + Chat */}
      <div className="flex-1 relative bg-white p-4">
        <div className="h-full w-full flex gap-4">
          <div className="flex-1 min-w-0 rounded-md overflow-hidden border">
            <SpeakerLayout participantsBarPosition="bottom" />
          </div>
          {showChat && chatClient && chatChannel && (
            <div className="w-[360px] min-w-[320px] max-w-[420px] h-full rounded-md overflow-hidden border">
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

      {/* Controls */}
      <CustomCallControls 
        onLeave={handleLeave} 
        onEndForAll={onEndForAll}
      />
    </div>
  )
}

// Main Stream Video Call Component
export default function StreamVideoCall({
  callId,
  callType = 'default',
  onCallEnd,
  isFullscreen = false,
}: StreamVideoCallProps) {
  const { user, isLoaded } = useUser()
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  type StreamCallHandle = ReturnType<StreamVideoClient['call']>
  const [call, setCall] = useState<StreamCallHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initializedRef = useRef(false)
  const [chatClient, setChatClient] = useState<StreamChat | null>(null)
  const [chatChannel, setChatChannel] = useState<ReturnType<StreamChat['channel']> | null>(null)
  const [showChat, setShowChat] = useState(true)
  
  // Access Convex API modules via unknown-indexers to avoid deep type instantiation
  const apiUntyped = api as unknown as Record<string, unknown>
  const streamModule = apiUntyped['stream'] as Record<string, unknown>
  const videoCallsModule = apiUntyped['videoCalls'] as Record<string, unknown>

  const getStreamToken = useActionUntyped(streamModule['getStreamToken']) as unknown as (
    args: { userId: string; userName: string; userImage?: string }
  ) => Promise<{ token: string; apiKey: string; chatToken?: string }>
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
          userName: user.fullName || user.emailAddresses[0]?.emailAddress || 'Anonymous',
          userImage: user.imageUrl,
        })

        console.log('Got Stream token, API Key:', apiKey)

        // Initialize or reuse Stream client instance to avoid duplicates
        const streamClient = StreamVideoClient.getOrCreateInstance({
          apiKey,
          user: {
            id: user.id,
            name: user.fullName || user.emailAddresses[0]?.emailAddress || 'Anonymous',
            image: user.imageUrl,
          },
          token,
        })

        console.log('Stream client initialized')
        setClient(streamClient)

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
              name: user.fullName || user.emailAddresses[0]?.emailAddress || 'Anonymous',
              image: user.imageUrl,
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
  }, [isLoaded, user, callId, callType, client, getStreamToken, ensureChatMembership, setMyRsvpStatus])

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
          <div className={isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'}>
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
            />
          </div>
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}
