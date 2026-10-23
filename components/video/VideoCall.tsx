'use client'

// @ts-nocheck
/*
  DEPRECATED: Legacy Daily.co VideoCall (not used in Stream flow)
  ----------------------------------------------------------------
  This file is part of the previous Daily.co implementation. The app
  has migrated to Stream Video SDK. Do NOT use this component in new code.
  Use `components/video/StreamVideoCall.tsx` instead.
*/
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.warn('[DEPRECATED] components/video/VideoCall.tsx (Daily) — use StreamVideoCall instead.')
}

import React, { useEffect, useCallback, useState, useRef } from 'react'

import { useQueryUntyped } from '@/lib/convexUntyped'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { DailyProvider, useDaily, useParticipantIds, useScreenShare, useMeetingState, useLocalSessionId } from '@daily-co/daily-react'
import { Button } from '@/components/ui/button'

import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import ParticipantTile from '@/components/video/ParticipantTile'
import CallControls from '@/components/video/CallControls'
import { useMutation } from 'convex/react'

import {
  MessageSquare,

  Maximize,
  Minimize,
  Send,
  Copy,
  Phone,
  Loader2,
} from '@/components/icons'
import type { DailyCall } from '@daily-co/daily-js'

import { toast } from 'sonner'
import TokenDebug from "@/components/debug/TokenDebug";

interface VideoCallProps {
  roomId: string
  userId: string
  userName: string
  onCallEnd: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  callId?: Id<"videoCalls">
  meetingToken?: string
}

interface RoomInfo {
  dailyRoomUrl?: string;
  dailyRoomName?: string;
  isHost?: boolean;
  meetingToken?: string;
  tokenExpiration?: number;
}

// DailyCallInterface component - handles the actual call UI
const DailyCallInterface = ({ 
  onCallEnd, 
  isFullscreen, 
  onToggleFullscreen,
  roomInfo,
  userName,
  callId
}: {
  onCallEnd: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  roomInfo: RoomInfo
  userName: string
  callId?: Id<"videoCalls">
}) => {
  const daily = useDaily()
  const meetingState = useMeetingState()
  const participantIds = useParticipantIds()
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare()
  const localSessionId = useLocalSessionId()
  
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [messages, setMessages] = useState<Array<{
    id: string
    sender: string
    text: string
    timestamp: Date
  }>>([])
  const [newMessage, setNewMessage] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  
  // Keep a stable reference to onCallEnd to avoid re-running effects due to function identity changes
  const onCallEndRef = useRef(onCallEnd)
  useEffect(() => {
    onCallEndRef.current = onCallEnd
  }, [onCallEnd])

  // Convex mutations for chat
  const sendMessageMutation = useMutation(api.videoCalls.sendMessage)
  const messagesQuery = useQueryUntyped(
    api.videoCalls.getMessages as unknown,
    callId ? ({ callId } as unknown) : ("skip" as unknown)
  ) as Array<{
    _id: string
    sender: string
    text: string
    timestamp: number
  }> | undefined

  // Update local messages from query
  useEffect(() => {
    if (messagesQuery) {
      setMessages(messagesQuery.map(msg => ({
        id: msg._id,
        sender: msg.sender,
        text: msg.text,
        timestamp: new Date(msg.timestamp)
      })))
    }
  }, [messagesQuery])

  // Handle meeting state changes
  useEffect(() => {
    if (meetingState === 'joined-meeting') {
      setConnectionStatus('connected')
      toast.success('Joined call successfully')
    } else if (meetingState === 'error') {
      setConnectionStatus('disconnected')
      toast.error('Call connection failed')
    } else if (meetingState === 'left-meeting') {
      setConnectionStatus('disconnected')
      // onCallEnd handled via event
    }
  }, [meetingState])

  // Handle Daily events
  useEffect(() => {
    if (!daily) return

    const handleAppMessage = (event: { data?: { type?: string; sender?: string; text?: string } }) => {
      if (event?.data?.type === 'chat-message') {
        const message = {
          id: Date.now().toString(),
          sender: event.data.sender || 'Unknown',
          text: event.data.text || '',
          timestamp: new Date()
        }
        setMessages(prev => [...prev, message])
      }
    }

    const handleParticipantJoined = (event: { participant?: { user_name?: string } }) => {
      if (event?.participant?.user_name) {
        toast.info(`${event.participant.user_name} joined the call`)
      }
    }

    const handleParticipantLeft = (event: { participant?: { user_name?: string } }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (event?.participant?.user_name && (event.participant as any).session_id !== localSessionId) {
        toast.info(`${event.participant.user_name} left the call`)
      }
    }

    const handleLeftMeeting = () => {
      console.log('Left meeting event triggered')
      onCallEndRef.current?.()
    }

    daily.on('app-message', handleAppMessage)
    daily.on('participant-joined', handleParticipantJoined)
    daily.on('participant-left', handleParticipantLeft)
    daily.on('left-meeting', handleLeftMeeting)

    return () => {
      daily.off('app-message', handleAppMessage)
      daily.off('participant-joined', handleParticipantJoined)
      daily.off('participant-left', handleParticipantLeft)
      daily.off('left-meeting', handleLeftMeeting)
    }
  }, [daily, localSessionId])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !daily) return

    try {
      // Send via Daily for real-time delivery
      await daily.sendAppMessage({
        type: 'chat-message',
        sender: userName,
        text: newMessage.trim()
      }, '*')

      // Also save to Convex for persistence
      if (callId) {
        await sendMessageMutation({
          message: newMessage.trim(),
          callId,
          messageType: 'text'
        })
      }

      setNewMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
      toast.error('Failed to send message')
    }
  }

  const handleEndCall = useCallback(async () => {
    if (daily) {
      try {
        await daily.leave()
      } catch (error) {
        console.error('Error leaving call:', error)
      }
    }
    onCallEndRef.current?.()
  }, [daily])

  const handleCopyRoomId = () => {
    if (roomInfo?.dailyRoomName) {
      navigator.clipboard.writeText(roomInfo.dailyRoomName)
      toast.success('Room ID copied to clipboard')
    }
  }

  const toggleScreenShare = useCallback(async () => {
    if (!daily) return
    
    try {
      if (isSharingScreen) {
        await stopScreenShare()
        toast.info('Screen sharing stopped')
      } else {
        await startScreenShare()
        toast.success('Screen sharing started')
      }
    } catch (error) {
      console.error('Screen share error:', error)
      toast.error('Failed to toggle screen sharing')
    }
  }, [daily, isSharingScreen, startScreenShare, stopScreenShare])

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : ''} bg-call-bg text-gray-800 flex flex-col`}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
              'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {connectionStatus === 'connected' ? 'Connected' : 
               connectionStatus === 'connecting' ? 'Connecting...' : 
               'Disconnected'}
            </span>
          </div>
          {roomInfo?.dailyRoomName && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Room: {roomInfo.dailyRoomName}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyRoomId}
                className="h-6 w-6 p-0"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="relative"
          >
            <MessageSquare className="h-4 w-4" />
            {messages.length > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {messages.length}
              </span>
            )}
          </Button>
          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video grid */}
        <div className="flex-1 p-4">
          <div className={`grid gap-4 h-full ${
            participantIds.length === 1 ? 'grid-cols-1' :
            participantIds.length === 2 ? 'grid-cols-2' :
            participantIds.length <= 4 ? 'grid-cols-2 grid-rows-2' :
            participantIds.length <= 6 ? 'grid-cols-3 grid-rows-2' :
            'grid-cols-3 grid-rows-3'
          }`}>
            {participantIds.map(id => (
              <ParticipantTile key={id} participantId={id} />
            ))}
          </div>
        </div>

        {/* Chat sidebar */}
        {isChatOpen && (
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold">Chat</h3>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.map(msg => (
                  <div key={msg.id} className="space-y-1">
                    <div className="flex items-baseline space-x-2">
                      <span className="font-medium text-sm">{msg.sender}</span>
                      <span className="text-xs text-gray-500">
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{msg.text}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-gray-200">
              <div className="flex space-x-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button onClick={handleSendMessage} size="sm">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Call controls */}
      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <CallControls 
          isVideoEnabled={true}
          isAudioEnabled={true}
          isAudioOutputEnabled={true}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          isSharingScreen={isSharingScreen as any}
          showChat={isChatOpen}
          onToggleVideo={() => {}}
          onToggleAudio={() => {}}
          onToggleAudioOutput={() => {}}
          onToggleScreenShare={toggleScreenShare}
          onToggleChat={() => setIsChatOpen((prev) => !prev)}
          onEndCall={handleEndCall}
        />
      </div>
    </div>
  )
}

// Main VideoCall Component
export default function VideoCall({
  roomId,
  userId,
  userName,
  onCallEnd,
  isFullscreen = false,
  onToggleFullscreen = () => {},
  callId,
  meetingToken,
}: VideoCallProps) {

  const [dailyCall, setDailyCall] = useState<DailyCall | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Keep a stable reference to onCallEnd to avoid re-running effects due to function identity changes
  const onCallEndRef = useRef(onCallEnd)
  useEffect(() => {
    onCallEndRef.current = onCallEnd
  }, [onCallEnd])

  // Fetch room info from backend - try both by callId and roomId
  const roomInfoByCallId = useQueryUntyped(
    api.videoCalls.getDailyRoomInfo as unknown,
    callId ? ({ callId } as unknown) : ("skip" as unknown)
  ) as RoomInfo | undefined
  
  const roomInfoByRoomId = useQueryUntyped(
    api.videoCalls.getCallByRoomId as unknown,
    !callId && roomId ? ({ roomId } as unknown) : ("skip" as unknown)
  )
  
  // Use whichever room info is available
  const roomInfo = React.useMemo(() => roomInfoByCallId || (roomInfoByRoomId ? {
    dailyRoomUrl: roomInfoByRoomId.dailyRoomUrl,
    dailyRoomName: roomInfoByRoomId.dailyRoomName,
    isHost: roomInfoByRoomId.isHost,
    meetingToken: roomInfoByRoomId.meetingToken || meetingToken,
    tokenExpiration: roomInfoByRoomId.tokenExpiration,
  } : undefined), [roomInfoByCallId, roomInfoByRoomId, meetingToken])

  // Handle left meeting
  const handleLeftMeeting = useCallback(() => {
    console.log('User left meeting, calling onCallEnd')
    onCallEndRef.current?.()
  }, [])

  // Create Daily call instance
  useEffect(() => {
    if (!roomInfo?.dailyRoomUrl || !userId || !userName || dailyCall) return

    const initCall = async () => {
      try {
        // Check for HTTPS in production
        if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
          console.warn('Video calls require HTTPS for camera/microphone access')
        }

        // Check browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Your browser does not support video calls')
        }

        const DailyIframe = (await import('@daily-co/daily-js')).default
        
        const callConfig: { url: string; showLeaveButton: boolean; showFullscreenButton: boolean; iframeStyle: { position: string; width: string; height: string; border: string; borderRadius: string; }; token?: string; userName?: string; } = {
          url: roomInfo.dailyRoomUrl,
          showLeaveButton: false,
          showFullscreenButton: false,
          iframeStyle: {
            position: 'relative',
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '8px',
          },
        }

        // Add meeting token if available
        if (roomInfo.meetingToken || meetingToken) {
          callConfig.token = roomInfo.meetingToken || meetingToken
        }

        // Add user name
        if (userName) {
          callConfig.userName = userName
        }

        console.log('🎥 Creating Daily call with config:', {
          url: callConfig.url,
          hasToken: !!callConfig.token,
          userName: callConfig.userName,
          roomId: roomId,
          callId: callId,
        })

        const callInstance = DailyIframe.createCallObject(callConfig)
        
        // Set up event listeners before joining
        callInstance.on('joined-meeting', () => {
          console.log('✅ Successfully joined meeting')
        })
        
        callInstance.on('left-meeting', () => {
          console.log('👋 Left meeting')
          handleLeftMeeting()
        })
        
        callInstance.on('error', (error: { errorMsg?: string; error?: string }) => {
          console.error('❌ Daily call error:', error)
          setError(`Call error: ${error?.errorMsg || error?.error || 'Unknown error'}`)
        })

        setDailyCall(callInstance)
        
        // Join the call
        console.log('🔄 Joining call...')
        await callInstance.join()
        
      } catch (err) {
        console.error('Failed to initialize Daily call:', err)
        setError(err instanceof Error ? err.message : 'Failed to initialize video call')
      }
    }

    initCall()
  }, [roomInfo, userId, userName, meetingToken, handleLeftMeeting, callId, dailyCall, roomId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dailyCall) {
        console.log('🧹 Cleaning up Daily call instance')
        dailyCall.destroy().catch((e: Error) => {
          console.error('Error cleaning up Daily call:', e)
        })
      }
    }
  }, [dailyCall])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Phone className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-xl">Call Connection Failed</p>
          <p className="text-gray-400">{error}</p>
          <Button onClick={onCallEnd} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  if (!dailyCall || !roomInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-call-bg text-neutral-900">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-call-accent" />
          <p className="text-xl">Initializing video call...</p>
          <p className="text-neutral-500">Please wait while we set up your call</p>
          <div className="mt-6">
            <Button 
              onClick={onCallEnd} 
              variant="outline" 
              className="text-call-accent border-call-accent hover:bg-call-bg"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <DailyProvider callObject={dailyCall}>
        <DailyCallInterface
          onCallEnd={onCallEnd}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen || (() => {})}
          roomInfo={roomInfo}
          userName={userName}
          callId={callId}
        />
      </DailyProvider>
      
      {/* Temporary debug component */}
      {process.env.NODE_ENV !== 'production' && callId && <TokenDebug callId={callId} />}
    </div>
  )
}
