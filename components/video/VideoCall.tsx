'use client'

import React, { useEffect, useCallback, useState } from 'react'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { DailyProvider, useDaily, useParticipantIds, useParticipant, useScreenShare, useMeetingState } from '@daily-co/daily-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  MessageSquare,

  Maximize,
  Minimize,
  Send,
  Copy,
  Phone,
  User,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react'

import { toast } from 'sonner'

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

// Daily.co Call Interface Component
function DailyCallInterface({ 
  onCallEnd,
  isFullscreen, 
  onToggleFullscreen, 
  roomInfo 
}: {
  onCallEnd: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  roomInfo: any
}) {
  const daily = useDaily()
  const participantIds = useParticipantIds()
  // Get all participants using the participant IDs
  const allParticipants = participantIds.map(id => useParticipant(id)).filter(Boolean)
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare()
  const meetingState = useMeetingState()
  
  const [showChat, setShowChat] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isAudioOutputEnabled, setIsAudioOutputEnabled] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Handle call state changes
  useEffect(() => {
    if (meetingState === 'joined-meeting') {
      setConnectionStatus('connected')
      toast.success('Joined call successfully')
    } else if (meetingState === 'error') {
      setConnectionStatus('disconnected')
      toast.error('Call connection failed')
    } else if (meetingState === 'left-meeting') {
      setConnectionStatus('disconnected')
      onCallEnd()
    }
  }, [meetingState, onCallEnd])

  // Handle video toggle
  const toggleVideo = useCallback(() => {
    if (daily) {
      daily.setLocalVideo(!isVideoEnabled)
      setIsVideoEnabled(!isVideoEnabled)
    }
  }, [daily, isVideoEnabled])

  // Handle audio toggle
  const toggleAudio = useCallback(() => {
    if (daily) {
      daily.setLocalAudio(!isAudioEnabled)
      setIsAudioEnabled(!isAudioEnabled)
    }
  }, [daily, isAudioEnabled])

  // Handle audio output toggle
  const toggleAudioOutput = useCallback(() => {
    if (daily) {
      daily.setOutputDeviceAsync({ outputDeviceId: isAudioOutputEnabled ? undefined : 'default' })
      setIsAudioOutputEnabled(!isAudioOutputEnabled)
    }
  }, [daily, isAudioOutputEnabled])

  // Handle screen share toggle
  const toggleScreenShare = useCallback(() => {
    if (isSharingScreen) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  }, [isSharingScreen, startScreenShare, stopScreenShare])

  // Handle ending call
  const handleEndCall = useCallback(() => {
    if (daily) {
      daily.leave()
    }
    onCallEnd()
  }, [daily, onCallEnd])

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (daily && chatMessage.trim()) {
      daily.sendAppMessage({
        message: chatMessage.trim(),
        sender: allParticipants.find((p: any) => p.local)?.user_name || 'Anonymous',
        timestamp: Date.now(),
      })
      setChatMessage('')
    }
  }, [daily, chatMessage, allParticipants])

  // Copy room URL
  const copyRoomUrl = useCallback(() => {
    if (roomInfo?.dailyRoomUrl) {
      navigator.clipboard.writeText(roomInfo.dailyRoomUrl)
      toast.success('Room URL copied to clipboard')
    }
  }, [roomInfo])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'd':
            e.preventDefault()
            toggleVideo()
            break
          case 'm':
            e.preventDefault()
            toggleAudio()
            break
          case 'e':
            e.preventDefault()
            handleEndCall()
            break
          case 'Enter':
            if (showChat && chatMessage.trim()) {
              e.preventDefault()
              sendChatMessage()
            }
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [toggleVideo, toggleAudio, handleEndCall, showChat, chatMessage, sendChatMessage])

  if (connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-400" />
          <p className="text-xl">Connecting to call...</p>
          <p className="text-gray-400">Please wait while we establish the connection</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : ''} bg-gray-900 text-white flex flex-col`}>
        {/* Header */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium">
              {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-sm text-gray-300">
            {participantIds.length} participant{participantIds.length !== 1 ? 's' : ''}
          </div>
        </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
            size="sm"
            onClick={copyRoomUrl}
            className="text-gray-300 hover:text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFullscreen}
            className="text-gray-300 hover:text-white"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
          </div>
        </div>

      {/* Video Grid */}
        <div className="flex-1 flex">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {participantIds.map((participantId) => {
            const participant = useParticipant(participantId)
            if (!participant) return null
            return (
            <Card key={participant.session_id} className="bg-gray-800 border-gray-700 relative overflow-hidden">
              <CardContent className="p-0 aspect-video">
                {(participant as any).video && (participant as any).videoTrack ? (
                  <video
                    ref={(el) => {
                      if (el && (participant as any).videoTrack) {
                        el.srcObject = new MediaStream([(participant as any).videoTrack])
                        el.play()
                      }
                    }}
                    className="w-full h-full object-cover"
                    autoPlay
                    muted={participant.local}
                    playsInline
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-700">
                    <User className="h-16 w-16 text-gray-400" />
                  </div>
                )}
                
                {/* Participant Info Overlay */}
                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                  <div className="bg-black bg-opacity-50 px-2 py-1 rounded text-sm">
                    {participant.user_name || 'Anonymous'}
                    {participant.local && ' (You)'}
                  </div>
                  <div className="flex space-x-1">
                    {!(participant as any).audio && (
                      <div className="bg-red-500 p-1 rounded">
                        <MicOff className="h-3 w-3" />
                      </div>
                    )}
                    {(participant as any).screen && (
                      <div className="bg-blue-500 p-1 rounded">
                        <Monitor className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>

          {/* Chat Sidebar */}
          {showChat && (
            <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                Chat
              </h3>
            </div>
            <ScrollArea className="flex-1 p-4">
              {/* Chat messages would go here */}
              <div className="text-gray-400 text-sm text-center py-8">
                No messages yet. Start the conversation!
                </div>
              </ScrollArea>
            <div className="p-4 border-t border-gray-700">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Type a message..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  className="bg-gray-700 border-gray-600 text-white"
                  />
                <Button onClick={sendChatMessage} size="sm">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
      <div className="bg-gray-800 p-4 flex justify-center items-center space-x-4">
        <Button
          variant={isVideoEnabled ? "default" : "destructive"}
          size="lg"
          onClick={toggleVideo}
          className="rounded-full p-4"
        >
          {isVideoEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
        </Button>
        
            <Button
          variant={isAudioEnabled ? "default" : "destructive"}
              size="lg"
              onClick={toggleAudio}
          className="rounded-full p-4"
            >
          {isAudioEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
        
        <Button
          variant={isAudioOutputEnabled ? "default" : "destructive"}
          size="lg"
          onClick={toggleAudioOutput}
          className="rounded-full p-4"
        >
          {isAudioOutputEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </Button>

            <Button
          variant={isSharingScreen ? "secondary" : "outline"}
              size="lg"
          onClick={toggleScreenShare}
          className="rounded-full p-4"
            >
          {isSharingScreen ? <MonitorOff className="h-6 w-6" /> : <Monitor className="h-6 w-6" />}
            </Button>

            <Button
          variant="outline"
              size="lg"
          onClick={() => setShowChat(!showChat)}
          className="rounded-full p-4"
            >
          <MessageSquare className="h-6 w-6" />
            </Button>

            <Button
              variant="destructive"
              size="lg"
              onClick={handleEndCall}
          className="rounded-full p-4"
            >
          <PhoneOff className="h-6 w-6" />
            </Button>
          </div>

      {/* Keyboard Shortcuts Help */}
      <div className="absolute top-4 right-4 text-xs text-gray-400">
        <div>Shortcuts: Ctrl+D (video), Ctrl+M (audio), Ctrl+E (end call)</div>
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
  onToggleFullscreen,
  callId,
  meetingToken
}: VideoCallProps) {
  const [dailyCall, setDailyCall] = useState<any>(null)
  const [roomInfo, setRoomInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Get room info from Convex if callId is provided
  const roomInfoQuery = useQuery(
    api.videoCalls.getDailyRoomInfo,
    callId ? { callId } : "skip"
  )

  // Get room info by roomId if callId is not provided
  const roomInfoByIdQuery = useQuery(
    api.videoCalls.getCallByRoomId,
    !callId ? { roomId } : "skip"
  )

  // Use the appropriate room info
  useEffect(() => {
    if (callId && roomInfoQuery) {
      setRoomInfo(roomInfoQuery)
    } else if (!callId && roomInfoByIdQuery) {
      setRoomInfo(roomInfoByIdQuery)
    }
  }, [callId, roomInfoQuery, roomInfoByIdQuery])

  // Create Daily call instance
  useEffect(() => {
    if (roomInfo && (roomInfo.dailyRoomUrl || roomInfo.dailyRoomName)) {
      const createCall = async () => {
        try {
          const DailyCall = (await import('@daily-co/daily-js')).default
          
          const callConfig: any = {
            url: roomInfo.dailyRoomUrl || `https://${process.env.NEXT_PUBLIC_DAILY_DOMAIN}/${roomInfo.dailyRoomName}`,
            userName: userName,
            userData: {
              userId: userId,
              isHost: roomInfo.isHost,
            },
          }

          // Add meeting token if available
          if (meetingToken || roomInfo.meetingToken) {
            callConfig.token = meetingToken || roomInfo.meetingToken
          }

          const call = DailyCall.createCallObject(callConfig)
          setDailyCall(call)

          // Set up event listeners
          call.on('joined-meeting', () => {
            console.log('Joined Daily.co meeting')
          })

          call.on('left-meeting', () => {
            console.log('Left Daily.co meeting')
            onCallEnd()
          })

          call.on('error', (error: any) => {
            console.error('Daily.co error:', error)
            setError(error.message || 'Call connection failed')
          })

          // Join the call
          await call.join()
        } catch (error) {
          console.error('Failed to create Daily.co call:', error)
          setError(error instanceof Error ? error.message : 'Failed to initialize video call')
        }
      }

      createCall()
    }

    // Cleanup
    return () => {
      if (dailyCall) {
        dailyCall.destroy()
      }
    }
  }, [roomInfo, userId, userName, meetingToken, onCallEnd])

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
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-400" />
          <p className="text-xl">Initializing video call...</p>
          <p className="text-gray-400">Please wait while we set up your call</p>
      </div>
    </div>
    )
}

  return (
    <DailyProvider callObject={dailyCall}>
      <DailyCallInterface
        onCallEnd={onCallEnd}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen || (() => {})}
        roomInfo={roomInfo}
      />
    </DailyProvider>
  )
} 