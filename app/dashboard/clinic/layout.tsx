'use client'

import { useAuth } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

export default function ClinicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const currentUser = useQuery(api.users.getMyUser)
  const approvalStatus = useQuery(api.users.getUserApprovalStatus)
  const authRedirected = useRef(false)
  

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn && !authRedirected.current) {
      authRedirected.current = true
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  // Show loading while auth is loading
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex h-screen">
        <div className="w-64 border-r border-gray-200 bg-white">
          <Skeleton className="h-full" />
        </div>
        <div className="flex-1 p-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    )
  }

  // Show loading while user data is loading
  if (currentUser === undefined || approvalStatus === undefined) {
    return (
      <div className="flex h-screen">
        <div className="w-64 border-r border-gray-200 bg-white">
          <Skeleton className="h-full" />
        </div>
        <div className="flex-1 p-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    )
  }

  // Handle user not found
  if (currentUser === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            User not found. Please complete your registration.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Check if user is a clinic owner
  if (currentUser.role !== 'clinic_owner') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Access denied. This area is for clinic owners only.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Check if user needs to complete onboarding
  if (!currentUser.onboarded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
          <p className="text-gray-600 mb-4">Please complete your profile setup to access the clinic dashboard</p>
          <button 
            onClick={() => router.push('/role-selection')}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            Complete Profile
          </button>
        </div>
      </div>
    )
  }

  // Check approval status
  if (approvalStatus && approvalStatus.status === 'pending_review') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Application Under Review</h2>
          <p className="text-gray-600 mb-4">
            Your clinic owner application is currently being reviewed by our team. 
            You&apos;ll receive an email notification once approved.
          </p>
        </div>
      </div>
    )
  }

  if (approvalStatus && approvalStatus.status === 'declined') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Your application has been declined. Please contact support for more information.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <>{children}</>
  )
}
