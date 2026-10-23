'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import StreamVideoCall from '@/components/video/StreamVideoCall'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Loader2 } from '@/components/icons'

export default function VideoCallPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoaded } = useUser()
  const callId = params.callId as string

  // Get call metadata from Convex
  const callMetadata = useQuery(api.stream_queries.getCallMetadata, { callId })

  // Check if this is an AwaDoc session (therapy IDs start with "thp-")
  const isAwadocSession = callId.startsWith('thp-')
  const awadocSession = useQuery(
    api.awadoc.getSessionByTherapyId,
    isAwadocSession ? { therapyId: callId } : "skip"
  )

  // Track whether we've already sent the completion callback
  const completionSentRef = useRef(false)

  const handleCallEnd = useCallback(async () => {
    // If this is an AwaDoc session and the user is a physio, send completion callback
    if (
      isAwadocSession &&
      !completionSentRef.current &&
      user?.publicMetadata?.role === 'physiotherapist' &&
      awadocSession?.status !== 'completed'
    ) {
      completionSentRef.current = true
      try {
        await fetch('/api/awadoc/complete-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ therapyId: callId }),
        })
        console.log('[AwaDoc] Session completion callback sent')
      } catch (err) {
        console.error('[AwaDoc] Failed to send completion:', err)
      }
    }

    // Redirect based on user role
    if (user?.publicMetadata?.role === 'physiotherapist') {
      router.push('/dashboard/physiotherapist')
    } else if (user?.publicMetadata?.role === 'patient') {
      router.push('/dashboard/patient')
    } else if (user?.publicMetadata?.role === 'clinic_owner') {
      router.push('/dashboard/clinic')
    } else {
      router.push('/dashboard')
    }
  }, [router, user?.publicMetadata?.role, isAwadocSession, callId, awadocSession?.status])

  // If the backend marks the call as ended (e.g., host clicked "End for Everyone"),
  // redirect all participants back to their dashboards.
  const redirectedRef = useRef(false)
  useEffect(() => {
    if (!isLoaded || !user) return
    if (callMetadata?.status === 'ended' && !redirectedRef.current) {
      redirectedRef.current = true
      handleCallEnd()
    }
  }, [callMetadata?.status, isLoaded, user, handleCallEnd])

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto" />
          <p className="text-xl">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    router.push('/sign-in')
    return null
  }

  // Prepare participants from call metadata
  type ParticipantLite = { id: string; firstName?: string; lastName?: string; email?: string; imageUrl?: string };
  const participants = callMetadata?.participantDetails?.map((p: ParticipantLite) => ({
    userId: p.id,
    userName: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
    userImage: p.imageUrl,
    role: callMetadata.initiatorId === p.id ? 'host' : 'participant',
  })) || []

  return (
    <StreamVideoCall
      callId={callId}
      callType="default"
      onCallEnd={handleCallEnd}
      participants={participants}
      isFullscreen={true}
    />
  )
}
