'use client'

import { useAuth } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { User } from '@/app/types'
import PendingApprovalPage from '@/components/dashboard/shared/PendingApprovalPage'
import { Button } from '@/components/ui/button'

type UserRole = 'physiotherapist' | 'clinic_owner' | 'patient' | 'family_member' | 'admin';

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  // Only fetch Convex data once Clerk auth is ready to avoid null results while still loading
  const user: User | null | undefined = useQuery(
    api.users.getMyUser,
    isLoaded && isSignedIn ? {} : "skip"
  )
  const dashboardAccess = useQuery(
    api.queries.checkDashboardAccess,
    isLoaded && isSignedIn ? {} : "skip"
  )
  const [isRedirecting, setIsRedirecting] = useState(false)

  // Handle redirects based on user role and approval status
  useEffect(() => {
    if (!isLoaded || user === undefined || dashboardAccess === undefined) return
    
    if (!isSignedIn) {
      if (!isRedirecting) setIsRedirecting(true)
      router.push('/sign-in')
      return
    }

    if (user === null) return // Will show error message below

    // Check if user needs to complete onboarding
    if (!user.onboarded) {
      return // Will show onboarding message below
    }

    // Use the proper dashboard access check
    if (!dashboardAccess.canAccess) {
      // If it's due to pending approval, show the pending approval page
      if (dashboardAccess.reason === "Application pending approval" && dashboardAccess.approvalStatus === "pending_review") {
        return // Will show pending approval component below
      }
      
      // For other reasons (like declined), redirect to appropriate page
      if (dashboardAccess.reason === "Application was declined") {
        return // Will show declined message below
      }
      
      // For any other access issues, redirect to onboarding
      if (!isRedirecting) setIsRedirecting(true)
      router.push('/onboarding/role-selection')
      return
    }

    // Route to appropriate dashboard based on role - set redirecting state to show user what's happening
    if (!isRedirecting && dashboardAccess.canAccess) {
      setIsRedirecting(true)
      
      switch (user.role) {
        case 'physiotherapist':
          router.replace('/dashboard/physiotherapist')
          break
        case 'clinic_owner':
          router.replace('/dashboard/clinic')
          break
        case 'patient':
          router.replace('/dashboard/patient')
          break
        case 'admin':
          router.replace('/dashboard/admin')
          break
        default:
          // If no role assigned, redirect to role selection
          router.replace('/onboarding/role-selection')
      }
    }
  }, [isLoaded, isSignedIn, user, dashboardAccess, isRedirecting])

  // Loading state while checking auth and user data
  if (!isLoaded || user === undefined || dashboardAccess === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // If not signed in, don't show anything (redirect handled in useEffect)
  if (!isSignedIn) {
    return null
  }

  // If user is null (not found in database)
  if (user === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">User Not Found</h2>
          <p className="text-gray-600 mb-4">Your user account was not found in our system.</p>
          <Button onClick={() => router.push('/sign-in')}>
            Sign In Again
          </Button>
        </div>
      </div>
    )
  }

  // Check if user needs to complete onboarding
  if (!user.onboarded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
          <p className="text-gray-600 mb-4">Please complete your profile setup to access the dashboard</p>
          <Button onClick={() => router.push('/onboarding/role-selection')}>
            Complete Profile
          </Button>
        </div>
      </div>
    )
  }

  // Check if access is denied due to pending approval
  if (!dashboardAccess.canAccess && dashboardAccess.reason === "Application pending approval") {
    return (
      <PendingApprovalPage
        userRole={user.role as UserRole}
        approvalStatus="pending_review"
        declineReason={undefined}
      />
    )
  }

  // Check if access is denied due to declined application
  if (!dashboardAccess.canAccess && dashboardAccess.reason === "Application was declined") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Application Declined</h2>
          <p className="text-gray-600 mb-4">Your application has been declined. Please contact support for more information.</p>
          <Button onClick={() => router.push('/sign-in')}>
            Back to Sign In
          </Button>
        </div>
      </div>
    )
  }

  // Show redirecting state while navigation happens
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
        <p className="text-gray-600">Redirecting to your dashboard...</p>
      </div>
    </div>
  )
} 