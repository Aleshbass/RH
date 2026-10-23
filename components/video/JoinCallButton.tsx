'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Video, Loader2 } from '@/components/icons'
import { useUser } from '@clerk/nextjs'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface JoinCallButtonProps {
  callId?: string
  participants?: Array<{
    userId: string
    userName: string
    userImage?: string
    role?: 'host' | 'participant'
  }>
  onJoinCall?: (callId: string) => void
  className?: string
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  children?: React.ReactNode
}

export default function JoinCallButton({
  callId,
  participants = [],
  onJoinCall,
  className,
  variant = 'default',
  size = 'default',
  children,
}: JoinCallButtonProps) {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const createStreamCall = useAction(api.stream.createStreamCall)

  const handleJoinCall = async () => {
    if (!isLoaded || !user) {
      toast.error('Please sign in to join a call')
      return
    }

    setIsLoading(true)

    try {
      // Generate a call ID if not provided
      const finalCallId = callId || `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      // If a callId is provided, do NOT create; route directly and let the call page join (create if needed)
      if (!callId) {
        // Prepare participants list only when creating a new call
        const callParticipants = participants.length > 0 ? participants : [
          {
            userId: user.id,
            userName: user.fullName || user.emailAddresses[0]?.emailAddress || 'Anonymous',
            userImage: user.imageUrl,
            role: 'host' as const,
          }
        ]

        // Ensure current user is in participants list
        const currentUserInList = callParticipants.some(p => p.userId === user.id)
        if (!currentUserInList) {
          callParticipants.push({
            userId: user.id,
            userName: user.fullName || user.emailAddresses[0]?.emailAddress || 'Anonymous',
            userImage: user.imageUrl,
            role: participants.length === 0 ? 'host' : 'participant',
          })
        }

        // Create the call in Stream (server-side metadata + chat setup)
        await createStreamCall({
          callId: finalCallId,
          callType: 'default',
          participants: callParticipants,
          settings: {
            recordingEnabled: false,
            transcriptionEnabled: false,
            maxDuration: 7200, // 2 hours
            geoFencing: false,
          },
        })
      }

      // Navigate to call page or trigger callback
      if (onJoinCall) {
        onJoinCall(finalCallId)
      } else {
        // Navigate to the video call page
        router.push(`/video-call/${finalCallId}`)
      }
    } catch (error) {
      console.error('Failed to create/join call:', error)
      toast.error('Failed to start video call')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      onClick={handleJoinCall}
      disabled={isLoading || !isLoaded}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Starting call...
        </>
      ) : (
        <>
          <Video className="mr-2 h-4 w-4" />
          {children || 'Join Call'}
        </>
      )}
    </Button>
  )
}
