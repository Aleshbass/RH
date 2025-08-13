'use client'

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
} from 'lucide-react'
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

// Daily.co Call Interface Component
function DailyCallInterface({ 
  onCallEnd,
  isFullscreen, 
  onToggleFullscreen, 
  roomInfo,
  userName,
  callId,
}: {
  onCallEnd: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  roomInfo: RoomInfo
  userName: string
  callId?: Id<"videoCalls">
}) {
  const daily = useDaily()
  const participantIds = useParticipantIds()
  const localSessionId = useLocalSessionId()
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare()
  const meetingState = useMeetingState()
  const saveMessage = useMutation(api.videoCalls.saveVideoCallMessage)
  // Stable ref for onCallEnd to avoid re-runs and enable safe fallback usage
  const onCallEndRef = useRef(onCallEnd)
  useEffect(() => {
    onCallEndRef.current = onCallEnd
  }, [onCallEnd])
  
  const [showChat, setShowChat] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string
    message: string
    sender: string
    timestamp: number
    isLocal: boolean
  }>>([])
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isAudioOutputEnabled, setIsAudioOutputEnabled] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // Load persisted chat messages
  const backendMessages = useQueryUntyped(
    api.videoCalls.getVideoCallMessages as unknown,
    callId ? ({ callId, limit: 100 } as unknown) : ("skip" as unknown)
  )

  useEffect(() => {
    if (!backendMessages) return
    try {
      const mapped = (Array.isArray(backendMessages) ? backendMessages : []).map((m: { sender?: { firstName?: string; lastName?: string; email?: string }; _id?: string; timestamp: number; message: string }) => {
        const senderName = m.sender?.firstName || m.sender?.lastName
          ? `${m.sender?.firstName || ''} ${m.sender?.lastName || ''}`.trim()
          : (m.sender?.email || 'Anonymous')
        return {
          id: String(m._id || `${m.timestamp}-${Math.random()}`),
          message: m.message,
          sender: senderName,
          timestamp: m.timestamp,
          isLocal: false,
        }
      })
      setChatMessages(mapped)
    } catch {
      // ignore mapping errors
    }
  }, [backendMessages])

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
      // onCallEnd is handled via Daily 'left-meeting' event to avoid duplicate calls
    }
  }, [meetingState])

  // Handle Daily.co app messages (chat)
  useEffect(() => {
    if (!daily) return

    interface AppMessage {
  data: { message: string; sender?: string; timestamp?: number };
  fromId: string;
}

const handleAppMessage = (event: AppMessage) => {
      const { data, fromId } = event
      const isLocal = fromId === localSessionId
      
      const newMessage = {
        id: `${Date.now()}-${Math.random()}`,
        message: data.message,
        sender: data.sender || 'Anonymous',
        timestamp: data.timestamp || Date.now(),
        isLocal
      }
      
      setChatMessages(prev => [...prev, newMessage])
      
      // Show toast for new messages from others
      if (!isLocal) {
        toast.info(`${data.sender}: ${data.message}`)
      }
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
        }
      }, 100)
    }

    daily.on('app-message', handleAppMessage)
    
    return () => {
      daily.off('app-message', handleAppMessage)
    }
  }, [daily, localSessionId])

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
    } else {
      // Fallback: if no call object exists, invoke end handler directly
      onCallEndRef.current?.()
    }
  }, [daily])

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (daily && chatMessage.trim()) {
      const messageData = {
        message: chatMessage.trim(),
        sender: userName || 'Anonymous',
        timestamp: Date.now(),
      }
      
      // Send via Daily.co
      daily.sendAppMessage(messageData)

      // Persist to backend (best-effort)
      if (callId) {
        try {
          // fire-and-forget
          saveMessage({ callId, message: messageData.message, messageType: 'text' } as unknown)
        } catch {
          console.warn('Failed to persist chat message:', e)
        }
      }
      
      // Add to local state immediately for better UX
      const newMessage = {
        id: `${Date.now()}-${Math.random()}`,
        message: messageData.message,
        sender: messageData.sender,
        timestamp: messageData.timestamp,
        isLocal: true
      }
      setChatMessages(prev => [...prev, newMessage])
      setChatMessage('')
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
        }
      }, 100)
    }
  }, [daily, chatMessage, userName, callId, saveMessage])

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
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-call-accent" />
          <p className="text-xl">Connecting to call...</p>
          <p className="text-gray-400">Please wait while we establish the connection</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : ''} bg-call-bg text-gray-800 flex flex-col`}>
        {/* Header */}
      <div className="bg-call-control p-4 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium text-call-accent">
              {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-sm text-gray-600">
            {participantIds.length} participant{participantIds.length !== 1 ? 's' : ''}
          </div>
        </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
            size="sm"
            onClick={copyRoomUrl}
            className="text-call-accent hover:text-call-accent/80"
              >
                <Copy className="h-4 w-4 text-call-accent" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFullscreen}
            className="text-call-accent hover:text-call-accent/80"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
          </div>
        </div>

      {/* Video Grid */}
        <div className="flex-1 flex">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {participantIds.map((id) => (
            <ParticipantTile key={id} participantId={id} />
          ))}

        </div>

          {/* Chat Sidebar */}
          {showChat && (
            <div className="w-80 bg-call-control border-l border-gray-300 flex flex-col">
            <div className="p-4 border-b border-gray-300">
              <h3 className="text-lg font-semibold flex items-center text-call-accent">
                <MessageSquare className="h-5 w-5 mr-2 text-call-accent" />
                Chat
              </h3>
            </div>
            <ScrollArea className="flex-1 p-4 space-y-3" ref={chatScrollRef}>
              {chatMessages.length === 0 ? (
                <div className="text-gray-500 text-sm text-center py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isLocal ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      msg.isLocal 
                        ? 'bg-call-accent text-white' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <div className="text-sm font-medium mb-1">
                        {msg.sender}
                      </div>
                      <div className="text-sm">
                        {msg.message}
                      </div>
                      <div className={`text-xs mt-1 opacity-70`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
            <div className="p-4 border-t border-gray-300">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Type a message..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  className="bg-white border-gray-300 text-gray-800 focus:border-call-accent"
                  />
                <Button onClick={sendChatMessage} size="sm" className="bg-call-accent hover:bg-call-accent/80 text-white">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <CallControls
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          isAudioOutputEnabled={isAudioOutputEnabled}
          isSharingScreen={isSharingScreen}
          showChat={showChat}
          onToggleVideo={toggleVideo}
          onToggleAudio={toggleAudio}
          onToggleAudioOutput={toggleAudioOutput}
          onToggleScreenShare={toggleScreenShare}
          onToggleChat={() => setShowChat(!showChat)}
          onEndCall={handleEndCall}
        />

      {/* Keyboard Shortcuts Help */}
      <div className="absolute top-4 right-4 text-xs text-gray-500">
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
  meetingToken,
}: VideoCallProps) {

  const [dailyCall, setDailyCall] = useState<DailyCall | null>(null)
  // Keep a stable reference to onCallEnd to avoid re-running effects due to function identity changes
  const onCallEndRef = useRef(onCallEnd)
  useEffect(() => {
    onCallEndRef.current = onCallEnd
  }, [onCallEnd])

  // ... (rest of the code remains the same)

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isCreatingCall = React.useRef(false)

  const roomInfoQuery = useQueryUntyped(
    api.videoCalls.getDailyRoomInfo as unknown,
    callId ? ({ callId } as unknown) : ("skip" as unknown)
  )

  // Get room info by roomId if callId is not provided
  const roomInfoByIdQuery = useQueryUntyped(
    api.videoCalls.getCallByRoomId as unknown,
    !callId ? ({ roomId } as unknown) : ("skip" as unknown)
  )

  // Use the appropriate room info
  useEffect(() => {
    console.log('🔍 Room info debug:', {
      callId,
      roomId,
      roomInfoQuery,
      roomInfoByIdQuery,
      userId,
      userName
    })
    
    if (callId && roomInfoQuery) {
      console.log('✅ Using roomInfoQuery:', roomInfoQuery)
      setRoomInfo(roomInfoQuery)
    } else if (!callId && roomInfoByIdQuery) {
      console.log('✅ Using roomInfoByIdQuery:', roomInfoByIdQuery)
      setRoomInfo(roomInfoByIdQuery)
    } else if (callId && roomInfoQuery === null) {
      console.error('❌ Room info query returned null for callId:', callId)
      setError('Video call not found or you do not have permission to join this call')
    } else if (!callId && roomInfoByIdQuery === null) {
      console.error('❌ Room info by ID query returned null for roomId:', roomId)
      setError('Video call room not found or you do not have permission to join this call')
    }
  }, [callId, roomInfoQuery, roomInfoByIdQuery, roomId, userId, userName])

  // Create Daily call instance
  useEffect(() => {
    let callInstance: DailyCall | null = null;
    let timeoutId: NodeJS.Timeout | undefined;
    const token = meetingToken || roomInfo?.meetingToken;
    
    const createCall = async () => {
      if (!roomInfo || !(roomInfo.dailyRoomUrl || roomInfo.dailyRoomName)) {
        return;
      }
      
      // Prevent duplicate DailyIframe instances
      if (isCreatingCall.current || dailyCall) {
        console.warn('Daily call creation already in progress or call object already exists, skipping creation');
        return;
      }
      
      isCreatingCall.current = true;
      
      try {
        const { default: DailyCall } = await import('@daily-co/daily-js');
          
        // Construct the Daily.co URL properly
        const DAILY_DOMAIN = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
        let dailyUrl = roomInfo.dailyRoomUrl;
        if (!dailyUrl && roomInfo.dailyRoomName) {
          if (!DAILY_DOMAIN) {
            throw new Error('Daily domain not configured. Set NEXT_PUBLIC_DAILY_DOMAIN.');
          }
          dailyUrl = `https://${DAILY_DOMAIN}/${roomInfo.dailyRoomName}`;
        }
        
        if (!roomInfo) {
          throw new Error('Failed to get room information');
        }

        // Check for secure context and device access
        if (typeof window === 'undefined' || !window.navigator) {
          setError('Window or navigator not available');
          return;
        }

        if (!window.isSecureContext) {
          setError('Camera/mic access requires HTTPS or localhost. Please reload over HTTPS.');
          return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          setError('Camera/mic access is not supported in this browser. Please use a modern browser over HTTPS.');
          return;
        }

        interface DailyCallConfig {
          url: string | undefined;
          userName: string;
          userData: {
            userId: string;
            isHost: boolean | undefined;
          };
          token?: string;
        }

        const callConfig: DailyCallConfig = {
          url: dailyUrl,
          userName: userName,
          userData: {
            userId: userId,
            isHost: roomInfo.isHost,
          },
        };

        // Add meeting token if available and not expired
        
        if (token) {
          // Check if token is expired
          const tokenExpiration = roomInfo.tokenExpiration;
          if (tokenExpiration && Date.now() / 1000 > tokenExpiration) {
            console.error('❌ Token expired:', { tokenExpiration, currentTime: Date.now() / 1000 });
            throw new Error('Meeting token has expired. Please refresh and try again.');
          }
          console.log('✅ Adding token to call config');
          (callConfig as { token?: string }).token = token;
        } else {
          console.warn('⚠️ No meeting token available - this may cause permission issues');
        }

        console.log('🚀 Creating Daily call with config:', callConfig);
        callInstance = DailyCall.createCallObject(callConfig);
        setDailyCall(callInstance);

        // Set up event listeners
        const handleJoinedMeeting = () => {
          console.log('✅ Joined Daily.co meeting successfully');
        };
        
        const handleLeftMeeting = () => {
          console.log('👋 Left Daily.co meeting');
          onCallEndRef.current?.();
        };
        
        const handleError = (err: unknown) => {
          console.error('❌ Daily.co error:', err);
          if (typeof err === 'object' && err !== null) {
            const e = err as {
              type?: string;
              message?: string;
              errorMsg?: string;
              action?: string;
              details?: unknown;
              callClientId?: string;
            };
            console.error('Error details:', e);
            setError(e.message ?? e.errorMsg ?? 'Call connection failed');
          } else {
            setError('Call connection failed');
          }
        };
        
        const handleJoiningMeeting = () => {
          console.log('🔄 Joining Daily.co meeting...');
        };
        
        const handleLoading = () => {
          console.log('⏳ Daily.co call loading...');
        };

        const handleNetworkConnection = (ev: unknown) => {
          console.log('🌐 Daily network-connection event:', ev);
        };

        callInstance.on('joined-meeting', handleJoinedMeeting);
        callInstance.on('left-meeting', handleLeftMeeting);
        callInstance.on('error', handleError);
        callInstance.on('joining-meeting', handleJoiningMeeting);
        callInstance.on('loading', handleLoading);
        callInstance.on('network-connection', handleNetworkConnection);

        // Join the call with timeout
        console.log('🔗 Attempting to join call...');
        // Pre-authenticate first to lock in URL/token and catch access issues early
        try {
          await (callInstance as unknown as { preAuth: (args: { url: string; token?: string; userName: string; userData: unknown }) => Promise<void> }).preAuth({
            url: dailyUrl,
            token: (callConfig as unknown as { token?: string }).token,
            userName: callConfig.userName,
            userData: callConfig.userData,
          });
          console.log('🔐 preAuth successful');
        } catch (preAuthErr) {
          console.error('❌ preAuth failed:', preAuthErr);
          throw preAuthErr as Error;
        }
        const joinPromise = callInstance.join();
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            console.error('⏰ Call join timeout after 15 seconds');
            reject(new Error('Call join timeout - this may be due to Daily.co account setup. Please ensure your Daily.co account has a credit card added.'));
          }, 15000);
        });

        const result = await Promise.race([joinPromise, timeoutPromise]);
        // Clear the timeout if the promise resolves before the timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        console.log('✅ Call join result:', result);
      } catch (error) {
        console.error('❌ Failed to create Daily.co call:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        setError(error instanceof Error ? error.message : 'Failed to initialize video call');
      } finally {
        isCreatingCall.current = false;
      }
    };

    if (roomInfo && userId && userName) {
      createCall();
    }

    // Cleanup function for useEffect
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (callInstance) {
        console.log('🧹 Cleaning up Daily call instance');
        callInstance.destroy().catch(() => {
          console.error('Error cleaning up Daily call:', e);
        });
      }
    };
  }, [roomInfo, userId, userName, meetingToken, dailyCall])

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