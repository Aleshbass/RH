'use client'

import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { PatientDashboard } from '@/components/dashboard/patient/PatientDashboard'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { User } from '@/app/types'

export default function PatientDashboardPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const user = useQuery(api.users.getMyUser) as User | null | undefined

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  // Redirect if not patient
  useEffect(() => {
    if (user && user.role !== 'patient') {
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

  if (user === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-600">User not found. Please try signing in again.</p>
      </div>
    )
  }

  return <PatientDashboard />
} 