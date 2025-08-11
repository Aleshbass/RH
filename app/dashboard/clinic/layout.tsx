'use client'

import { useAuth } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import ClinicSidebar from '@/components/clinic/ClinicSidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Toaster } from "sonner"
import NotificationToaster from '@/components/dashboard/shared/NotificationToaster'

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
  }, [isLoaded, isSignedIn])

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
            onClick={() => router.push('/onboarding/role-selection')}
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
    <div className="min-h-screen bg-gray-50">
      {/* Dashboard Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-900">Clinic Dashboard</h1>
        </div>
      </div>
      
      <div className="flex">
        {/* Clinic Sidebar */}
        <ClinicSidebar />
        
        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="h-full px-6 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
      
      <NotificationToaster />
      <Toaster position="top-right" />
    </div>
  )
}
