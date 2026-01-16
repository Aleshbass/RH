'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import PendingApprovalPage from '@/components/dashboard/shared/PendingApprovalPage'

interface DashboardAuthGuardProps {
  children: React.ReactNode
}

export default function DashboardAuthGuard({ children }: DashboardAuthGuardProps) {
  const router = useRouter()
  const currentUser = useQuery(api.users.getMyUser)
  const approvalStatus = useQuery(
    api.accountApproval.getStatus,
    currentUser ? { userId: currentUser._id } : "skip"
  )
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    // Wait for user data to load
    if (currentUser === undefined) return
    if (isRedirecting) return

    // If no user found, check for pending invite first
    if (!currentUser) {
      // Check if there's a pending patient invitation
      const pendingInvite = typeof window !== 'undefined' ? localStorage.getItem('rehabify_pending_invite') : null
      if (pendingInvite) {
        // User is authenticated but not in Convex yet - redirect to invitation to complete onboarding
        setIsRedirecting(true)
        router.replace(`/patient-invite/${pendingInvite}`)
        return
      }
      // No pending invite, redirect to sign-in (will handle the case properly)
      setIsRedirecting(true)
      router.replace('/sign-in')
      return
    }

    // If user hasn't selected a role yet, but they already have a profile, route to their dashboard
    if (!currentUser.role) {
      if (currentUser.patientProfileId) {
        setIsRedirecting(true)
        router.replace('/dashboard/patient')
        return
      }
      if (currentUser.physiotherapistProfileId) {
        setIsRedirecting(true)
        router.replace('/dashboard/physiotherapist')
        return
      }
      if (currentUser.clinicOwnerProfileId) {
        setIsRedirecting(true)
        router.replace('/dashboard/clinic')
        return
      }
      // No role and no profile: go to role selection
      setIsRedirecting(true)
      router.replace('/role-selection')
      return
    }

    // If user hasn't completed onboarding, redirect to appropriate onboarding flow
    if (!currentUser.onboarded) {
      setIsRedirecting(true)
      switch (currentUser.role) {
        case 'physiotherapist':
          router.replace('/physiotherapist')
          break
        case 'clinic_owner':
          router.replace('/clinic-owner')
          break
        case 'patient':
          // Patients typically complete onboarding via invitation. If a patient profile exists, allow dashboard access.
          if (currentUser.patientProfileId) {
            router.replace('/dashboard/patient')
          } else {
            // Check if there's a pending invitation in localStorage
            const pendingInvite = typeof window !== 'undefined' ? localStorage.getItem('rehabify_pending_invite') : null
            if (pendingInvite) {
              router.replace(`/patient-invite/${pendingInvite}`)
            } else {
              router.replace('/role-selection')
            }
          }
          break
        default:
          router.replace('/role-selection')
      }
      return
    }

    // For roles that require approval (physiotherapist, clinic_owner), check approval status
    if (currentUser.role === 'physiotherapist' || currentUser.role === 'clinic_owner') {
      // If approval status is still loading, wait
      if (approvalStatus === undefined) return

      // If no approval status exists, user needs to submit for review
      if (!approvalStatus) {
        // This should not happen if onboarding flow is working correctly
        // But we'll handle it gracefully
        console.warn('User completed onboarding but no approval status found')
        return
      }

      // If approval is declined, show pending approval page with decline reason
      if (approvalStatus.status === 'declined') {
        // Don't redirect, show pending approval page instead
        return
      }

      // If approval is still pending, show pending approval page
      if (approvalStatus.status === 'pending_review') {
        // Don't redirect, show pending approval page instead
        return
      }

      // If approved, we allow access to the dashboard layout.
      // Specific dashboard redirection (e.g. /dashboard -> /dashboard/physiotherapist)
      // is handled by app/dashboard/page.tsx
    }

    // Admin and patient roles don't require approval, allow access
    // Approved physiotherapists and clinic owners also reach here
  }, [currentUser, approvalStatus, router, isRedirecting])

  // Show loading state while checking authentication or redirecting
  if (isRedirecting || currentUser === undefined ||
    (currentUser?.role === 'physiotherapist' || currentUser?.role === 'clinic_owner') && approvalStatus === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">
            {isRedirecting ? 'Redirecting...' : 'Loading...'}
          </p>
        </div>
      </div>
    )
  }

  // If user needs approval and status is pending or declined, show pending approval page
  if (currentUser &&
    (currentUser.role === 'physiotherapist' || currentUser.role === 'clinic_owner') &&
    approvalStatus &&
    (approvalStatus.status === 'pending_review' || approvalStatus.status === 'declined')) {
    return (
      <PendingApprovalPage
        userRole={currentUser.role}
        approvalStatus={approvalStatus.status}
        declineReason={approvalStatus.comments}
      />
    )
  }

  // All checks passed, render dashboard
  return <>{children}</>
}
