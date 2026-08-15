'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { Loader2 } from 'lucide-react'
import { PhysiotherapistDashboardV2 } from '@/components/dashboard/physiotherapist/PhysiotherapistDashboardV2'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

import { PhysiotherapistTour } from '@/components/onboarding/PhysiotherapistTour'
import { PhysioGuideVideoModal } from '@/components/dashboard/shared/PhysioGuideVideoModal'

export default function PhysiotherapistDashboardPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const user = useQuery(api.users.getMyUser)
  const authRedirected = useRef(false)
  const roleRedirected = useRef(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn && !authRedirected.current) {
      authRedirected.current = true
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  // Redirect if not physiotherapist
  useEffect(() => {
    if (user && user.role !== 'physiotherapist' && !roleRedirected.current) {
      roleRedirected.current = true
      router.push('/sign-in')
    }
  }, [user, router])

  // Loading state
  if (!isLoaded || user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  // If user is null (not found in Convex), show error
  if (user === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600">User not found. Please try signing in again.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <PhysiotherapistDashboardV2 />
      {/* Platform guide video — shown once after approval on first dashboard visit */}
      <PhysioGuideVideoModal
        title="🎬 You're Approved! Welcome to Rehabify"
        subtitle="Watch this quick guide to get the most out of your new dashboard."
      />
      <PhysiotherapistTour />
    </>
  )
}

