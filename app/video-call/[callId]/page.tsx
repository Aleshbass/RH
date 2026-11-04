'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import StreamVideoCall from '@/components/video/StreamVideoCall'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Loader2 } from '@/components/icons'

export default function VideoCallPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoaded } = useUser()
  const callId = params.callId as string

  // Get call metadata from Convex
  const callMetadata = useQuery(api.stream_queries.getCallMetadata, { callId })

  // AwaDoc visits (rooms "thp-…-<n>"): joining tells AwaDoc the session started; when the call
  // ends the physio lands on the visit to write the summary AwaDoc needs (convex/awadoc.ts).
  const isAwadocRoom = callId.startsWith('thp-')
  const awadocVisit = useQuery((api as any).awadoc.visitForCall, isAwadocRoom ? { callId } : 'skip') as
    | { visitId: string; status: string }
    | null
    | undefined
  const startAwadocVisit = useMutation((api as any).awadoc.startVisitByCall)
  const awadocStartedRef = useRef(false)
  useEffect(() => {
    if (!isAwadocRoom || !awadocVisit || awadocVisit.status !== 'scheduled' || awadocStartedRef.current) return
    awadocStartedRef.current = true
    void startAwadocVisit({ callId }).catch(() => undefined)
  }, [isAwadocRoom, awadocVisit, callId, startAwadocVisit])

  const role = user?.publicMetadata?.role
  const home =
    role === 'physiotherapist'
      ? '/dashboard/physiotherapist'
      : role === 'patient'
        ? '/dashboard/patient'
        : role === 'clinic_owner'
          ? '/dashboard/clinic'
          : '/dashboard'

  const handleCallEnd = useCallback(async () => {
    const openAwadocVisit = awadocVisit && (awadocVisit.status === 'scheduled' || awadocVisit.status === 'started')
    router.push(role === 'physiotherapist' && openAwadocVisit ? `/dashboard/physiotherapist?awadoc=${awadocVisit.visitId}` : home)
  }, [router, home, role, awadocVisit])

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

  // Physios: open the call's patient's record (the call carries on in a small window)
  const patientId = role === 'physiotherapist' ? (callMetadata?.patientId ?? null) : null

  return (
    <StreamVideoCall
      callId={callId}
      callType="default"
      onCallEnd={handleCallEnd}
      recordHref={patientId ? `/dashboard/physiotherapist/patients/${patientId}` : undefined}
      appHref={home}
      navigate={(href) => router.push(href)}
      participants={participants}
      isFullscreen={true}
    />
  )
}
