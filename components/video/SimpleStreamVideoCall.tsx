'use client'

import React, { useEffect, useState } from 'react'
import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  SpeakerLayout,
  CallControls,
  StreamTheme,
} from '@stream-io/video-react-sdk'
import '@stream-io/video-react-sdk/dist/css/styles.css'
import { useUser } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { Loader2, Copy, X } from '@/components/icons'
import { toast } from 'sonner'

interface SimpleStreamVideoCallProps {
  callId: string
  onCallEnd: () => void
}

export default function SimpleStreamVideoCall({
  callId,
  onCallEnd
}: SimpleStreamVideoCallProps) {
  const { user, isLoaded } = useUser()
  const [client, setClient] = useState<StreamVideoClient | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [call, setCall] = useState<any>(null)
  const [showShareLink, setShowShareLink] = useState(true)
  
  const shareLink = `${window.location.origin}/video-call/${callId}`
  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY || 'thgtj8s8svph' // Your Stream API key

  useEffect(() => {
    if (!isLoaded || !user) return

    let isMounted = true

    const initializeStream = async () => {
      try {
        console.log('Initializing Stream client...')
        
        // Create a simple token (for testing - in production use server-side token generation)
        const userId = user.id
        let token = null
        try {
          const response = await fetch('/api/stream/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
          })
          const data = await response.json()
          token = data.token
        } catch (err) {
          console.error('Failed to get token from API:', err)
        }

        // Initialize Stream client
        if (!token) {
          console.error('No token available, cannot initialize Stream client')
          toast.error('Authentication failed. Please refresh and try again.')
          return
        }
        
        const streamClient = new StreamVideoClient({
          apiKey,
          user: {
            id: userId,
            name: user.fullName || 'User',
            image: user.imageUrl,
          },
          token,
        })

        if (!isMounted) {
          streamClient.disconnectUser().catch(console.error)
          return
        }

        setClient(streamClient)
        console.log('Stream client created')

        // Create and join call
        const streamCall = streamClient.call('default', callId)
        await streamCall.join({ create: true })
        
        if (!isMounted) {
          streamCall.leave().catch(console.error)
          return
        }

        setCall(streamCall)
        console.log('Joined call successfully')
        toast.success('Video call started!')
      } catch (error) {
        console.error('Stream initialization error:', error)
        if (isMounted) {
          toast.error('Failed to start video call. Please check your connection.')
        }
      }
    }

    initializeStream()

    return () => {
      isMounted = false
      if (call) {
        call.leave().catch(console.error)
      }
      if (client) {
        client.disconnectUser().catch(console.error)
      }
    }
    // Only depend on isLoaded, user, callId, and apiKey - NOT on client or call
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, user, callId, apiKey])

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink)
    toast.success('Call link copied!')
  }

  const handleEndCall = async () => {
    try {
      if (call) {
        await call.leave()
      }
      onCallEnd()
    } catch (error) {
      console.error('Error ending call:', error)
      onCallEnd()
    }
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

  if (!client || !call) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto" />
          <p className="text-xl">Connecting to video call...</p>
          <p className="text-sm text-gray-400">Call ID: {callId}</p>
          <Button variant="outline" onClick={onCallEnd}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <StreamVideo client={client}>
      <StreamCall call={call}>
        <StreamTheme>
          <div className="h-screen flex flex-col">
            {/* Share Link Banner */}
            {showShareLink && (
              <div className="bg-green-600 text-white p-3">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="font-medium">Share this link:</span>
                    <code className="bg-green-700 px-3 py-1 rounded text-sm flex-1">
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
            
            {/* Video Layout */}
            <div className="flex-1 bg-gray-900">
              <SpeakerLayout participantsBarPosition="bottom" />
            </div>
            
            {/* Controls */}
            <div className="bg-white border-t p-4">
              <CallControls onLeave={handleEndCall} />
            </div>
          </div>
        </StreamTheme>
      </StreamCall>
    </StreamVideo>
  )
}
