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

type UserRole = 'physiotherapist' | 'clinic_owner' | 'patient' | 'family_member' | 'doctor' | 'admin';

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  // Only fetch Convex data once Clerk auth is ready to avoid null results while still loading
  const user: User | null | undefined = useQuery(
    api.users.getMyUser,
    isLoaded && isSignedIn ? {} : "skip"
  ) as unknown as User | null | undefined
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

    // Derive an effective role if the stored role is missing
    const effectiveRole: UserRole | undefined = ((): UserRole | undefined => {
      if (user.role) return user.role as UserRole
      // Fallback based on existing profile IDs
      if (user.patientProfileId) return 'patient'
      if (user.physiotherapistProfileId) return 'physiotherapist'
      if (user.clinicOwnerProfileId) return 'clinic_owner'
      if (user.doctorProfileId) return 'doctor'
      return undefined
    })()

    // If onboarding isn't marked complete:
    if (!user.onboarded) {
      // Patients invited via code may have profile created; allow them straight to dashboard
      if (effectiveRole === 'patient' && user.patientProfileId) {
        if (!isRedirecting) setIsRedirecting(true)
        router.replace('/dashboard/patient')
        return
      }
      return // Will show onboarding message below for others
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

      // For any other access issues, do not redirect to onboarding to avoid loops
      return
    }

    // Route to appropriate dashboard based on role - set redirecting state to show user what's happening
    if (!isRedirecting && dashboardAccess.canAccess) {
      setIsRedirecting(true)

      switch (effectiveRole) {
        case 'physiotherapist':
          router.replace('/dashboard/physiotherapist')
          break
        case 'clinic_owner':
          router.replace('/dashboard/clinic')
          break
        case 'patient':
          router.replace('/dashboard/patient')
          break
        case 'doctor':
          router.replace('/dashboard/doctor')
          break
        case 'admin':
          router.replace('/dashboard/admin')
          break
        default:
          // If no role assigned, redirect to role selection
          router.replace('/role-selection')
      }
    }
  }, [isLoaded, isSignedIn, user, dashboardAccess, isRedirecting, router])

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

  // Check if user needs to complete onboarding (except auto-handled patients with profile)
  const hasPatientProfile = Boolean(user.patientProfileId)
  if (!user.onboarded && !hasPatientProfile) {
    // If user already has a physiotherapist role (e.g. invited staff), send them directly to the wizard
    // instead of role selection
    if (user.role === 'physiotherapist') {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
            <p className="text-gray-600 mb-4">Please complete your professional profile to access the dashboard</p>
            <Button onClick={() => router.push('/physiotherapist')}>
              Continue Setup
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Complete Your Profile</h2>
          <p className="text-gray-600 mb-4">Please complete your profile setup to access the dashboard</p>
          <Button onClick={() => router.push('/role-selection')}>
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

  // Catch-all: access denied for other reasons. Avoid redirecting to onboarding for onboarded users.
  if (!dashboardAccess.canAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Not Available</h2>
          <p className="text-gray-600 mb-4">{dashboardAccess.reason || 'Your account cannot access the dashboard at this time.'}</p>
          <Button onClick={() => router.push('/')}>Go to Home</Button>
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