'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
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

  useEffect(() => {
    // Wait for user data to load
    if (currentUser === undefined) return

    // If no user found, redirect to sign-in
    if (!currentUser) {
      router.replace('/sign-in')
      return
    }

    // If user hasn't selected a role yet, but they already have a profile, route to their dashboard
    if (!currentUser.role) {
      if (currentUser.patientProfileId) {
        router.replace('/dashboard/patient')
        return
      }
      if (currentUser.physiotherapistProfileId) {
        router.replace('/dashboard/physiotherapist')
        return
      }
      if (currentUser.clinicOwnerProfileId) {
        router.replace('/dashboard/clinic')
        return
      }
      // No role and no profile: go to role selection
      router.replace('/role-selection')
      return
    }

    // If user hasn't completed onboarding, redirect to appropriate onboarding flow
    if (!currentUser.onboarded) {
      switch (currentUser.role) {
        case 'physiotherapist':
          router.replace('/physiotherapist/step1')
          break
        case 'clinic_owner':
          router.replace('/clinic-owner/step1')
          break
        case 'patient':
          // Patients typically complete onboarding via invitation. If a patient profile exists, allow dashboard access.
          if (currentUser.patientProfileId) {
            router.replace('/dashboard/patient')
          } else {
            router.replace('/role-selection')
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

      // If approved, allow access to dashboard (continue to render children)
    }

    // Admin and patient roles don't require approval, allow access
    // Approved physiotherapists and clinic owners also reach here
  }, [currentUser, approvalStatus, router])

  // Show loading state while checking authentication
  if (currentUser === undefined || 
      (currentUser?.role === 'physiotherapist' || currentUser?.role === 'clinic_owner') && approvalStatus === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
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
