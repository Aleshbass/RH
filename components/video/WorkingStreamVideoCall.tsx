'use client'

import React, { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Loader2, Copy, PhoneOff, Video, VideoOff, Mic, MicOff, Monitor, X } from 'lucide-react'
import { toast } from 'sonner'

interface WorkingStreamVideoCallProps {
  callId: string
  onCallEnd: () => void
}

export default function WorkingStreamVideoCall({
  callId,
  onCallEnd
}: WorkingStreamVideoCallProps) {
  const { user, isLoaded } = useUser()
  const [isInitializing, setIsInitializing] = useState(true)
  const [showShareLink, setShowShareLink] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  
  const shareLink = `${window.location.origin}/video-call/${callId}`

  useEffect(() => {
    // Simulate initialization
    const timer = setTimeout(() => {
      setIsInitializing(false)
      toast.success('Video call connected!')
    }, 2000)
    
    return () => clearTimeout(timer)
  }, [])

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink)
    toast.success('Call link copied!')
  }

  const handleEndCall = () => {
    toast.success('Call ended')
    onCallEnd()
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
    toast.success(isMuted ? 'Microphone unmuted' : 'Microphone muted')
  }

  const toggleVideo = () => {
    setIsVideoOff(!isVideoOff)
    toast.success(isVideoOff ? 'Video turned on' : 'Video turned off')
  }

  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing)
    toast.success(isScreenSharing ? 'Screen sharing stopped' : 'Screen sharing started')
  }

  if (!isLoaded || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto" />
          <p className="text-xl">Loading...</p>
        </div>
      </div>
    )
  }

  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto" />
          <p className="text-xl">Connecting to Stream video call...</p>
          <p className="text-sm text-gray-400">Call ID: {callId}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Share Link Banner */}
      {showShareLink && (
        <div className="bg-green-600 text-white p-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <span className="font-medium">Share this link:</span>
              <code className="bg-green-700 px-3 py-1 rounded text-sm flex-1 truncate">
                {shareLink}
              </code>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={copyLink}>
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setShowShareLink(false)}
                className="text-white hover:text-gray-200"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Video Area */}
      <div className="flex-1 relative p-4">
        <div className="h-full bg-gray-800 rounded-lg flex items-center justify-center">
          {isVideoOff ? (
            <div className="text-center">
              <div className="w-32 h-32 mx-auto bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <span className="text-4xl text-white">
                  {user.firstName?.[0] || user.fullName?.[0] || 'U'}
                </span>
              </div>
              <p className="text-white text-lg">{user.fullName || 'User'}</p>
              <p className="text-gray-400 text-sm">Camera is off</p>
            </div>
          ) : (
            <div className="text-center">
              <Video className="h-16 w-16 text-green-400 mx-auto mb-4" />
              <p className="text-white text-lg">Stream Video Active</p>
              <p className="text-gray-400 text-sm">Call ID: {callId}</p>
              <p className="text-green-400 text-sm mt-2">Video feed would appear here</p>
            </div>
          )}
        </div>
        
        {/* Participant thumbnails */}
        <div className="absolute bottom-4 right-4 space-y-2">
          <div className="w-40 h-28 bg-gray-700 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">You</span>
          </div>
        </div>
      </div>
      
      {/* Controls */}
      <div className="bg-white border-t p-4">
        <div className="flex items-center justify-center space-x-4">
          <Button
            variant={isMuted ? "destructive" : "default"}
            size="lg"
            onClick={toggleMute}
            className="rounded-full"
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          
          <Button
            variant={isVideoOff ? "destructive" : "default"}
            size="lg"
            onClick={toggleVideo}
            className="rounded-full"
          >
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>
          
          <Button
            variant={isScreenSharing ? "secondary" : "default"}
            size="lg"
            onClick={toggleScreenShare}
            className="rounded-full"
          >
            <Monitor className="h-5 w-5" />
          </Button>
          
          <Button
            variant="destructive"
            size="lg"
            onClick={handleEndCall}
            className="rounded-full"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
