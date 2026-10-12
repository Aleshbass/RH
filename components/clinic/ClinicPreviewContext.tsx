'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ArrowRight, Lock, Clock } from 'lucide-react'

/** Pages a clinic role can be given (matches CLINIC_AREAS in convex/clinicTools.ts). Home is always available. */
export const CLINIC_AREAS = ['appointments', 'patients', 'referrals', 'billing', 'team', 'reports', 'settings'] as const
export type ClinicArea = (typeof CLINIC_AREAS)[number]

export const CLINIC_AREA_LABELS: Record<ClinicArea, string> = {
  appointments: 'Appointments',
  patients: 'Patients',
  referrals: 'Referrals',
  billing: 'Billing',
  team: 'Team',
  reports: 'Reports',
  settings: 'Clinic settings',
}

interface ClinicPreviewContextType {
  /** True while loading, for preview visitors, and until the clinic is approved */
  isPreviewMode: boolean
  isPendingApproval: boolean
  isOnboardingIncomplete: boolean
  isDeclined: boolean
  /** Signed in as the clinic owner */
  isOwner: boolean
  /** Signed in as a clinic team member (clinician or front desk) */
  isStaff: boolean
  /** Team member whose access was suspended by the owner */
  isSuspended: boolean
  /** Whether the signed-in owner/member can use a page. Preview visitors can look at everything. */
  canUse: (area: ClinicArea) => boolean
  clinicName: string | null
  logoUrl: string | null
  roleName: string | null
  /** False until access has loaded */
  isLoaded: boolean
  requireFullAccess: (actionName?: string, callback?: () => void) => boolean
  openOnboardingWizard: () => void
}

const ClinicPreviewContext = createContext<ClinicPreviewContextType | undefined>(undefined)

export function ClinicPreviewProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const access = useQuery(api.clinicTools.getMyClinicAccess)
  const currentUser = useQuery(api.users.getMyUser)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [attemptedAction, setAttemptedAction] = useState<string>('Live Action')

  const isLoaded = access !== undefined
  const member = access && access.mode !== 'preview' ? access : null
  const isOwner = member?.mode === 'owner'
  const isStaff = member?.mode === 'staff'

  const isDeclined = member?.approvalStatus === 'declined'
  // A skip always leaves onboarded=false, so a stale onboardingSkipped flag on an onboarded account is ignored.
  // Signed-in visitors who aren't a clinic member yet (e.g. mid-onboarding) count as not finished too.
  const isOnboardingIncomplete = member
    ? !member.ownerOnboarded
    : Boolean(currentUser && !currentUser.onboarded)
  // The backend only allows changes once approved, so anything short of that waits for approval
  const isPendingApproval = Boolean(
    member && member.ownerOnboarded && member.approvalStatus !== 'approved' && !isDeclined
  )
  const isSuspended = Boolean(member?.suspended)

  const isPreviewMode = !member || isOnboardingIncomplete || isPendingApproval || isDeclined || isSuspended

  const canUse = (area: ClinicArea) => {
    if (!member) return true
    return member.permissions === 'all' || member.permissions.includes(area)
  }

  const openOnboardingWizard = () => {
    setIsModalOpen(false)
    router.push('/clinic-owner')
  }

  const requireFullAccess = (actionName = 'This action', callback?: () => void): boolean => {
    if (isPreviewMode) {
      setAttemptedAction(actionName)
      setIsModalOpen(true)
      return false
    }

    if (callback) {
      callback()
    }
    return true
  }

  // Team members can't finish the owner's setup, so they only get an explanation
  const canFinishSetup = !isPendingApproval && !isStaff

  return (
    <ClinicPreviewContext.Provider
      value={{
        isPreviewMode,
        isPendingApproval,
        isOnboardingIncomplete,
        isDeclined,
        isOwner,
        isStaff,
        isSuspended,
        canUse,
        clinicName: member?.clinicName ?? null,
        logoUrl: member?.logoUrl ?? null,
        roleName: member?.roleName ?? null,
        isLoaded,
        requireFullAccess,
        openOnboardingWizard,
      }}
    >
      {children}

      {/* Shown when a live action is attempted in preview */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              {isPendingApproval ? <Clock className="h-4 w-4 text-amber-600" /> : <Lock className="h-4 w-4 text-neutral-400" />}
              {isPendingApproval
                ? 'Waiting for approval'
                : isSuspended
                  ? 'Access paused'
                  : isStaff
                    ? 'Not available yet'
                    : 'Finish setting up your clinic'}
            </DialogTitle>
            <DialogDescription>
              {isPendingApproval
                ? `"${attemptedAction}" will work once Rehabify has verified the clinic.`
                : isSuspended
                  ? 'The clinic owner has paused your access. Contact them to restore it.'
                  : isStaff
                    ? `"${attemptedAction}" will work once the clinic owner finishes setting up the clinic.`
                    : `"${attemptedAction}" needs a set-up clinic. It takes a few minutes, and you can pick up where you left off.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {canFinishSetup && !isSuspended ? 'Not now' : 'OK'}
            </Button>
            {canFinishSetup && !isSuspended && (
              <Button
                type="button"
                onClick={openOnboardingWizard}
                className="bg-[#005b57] text-white hover:bg-[#00443e]"
              >
                Finish setup
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClinicPreviewContext.Provider>
  )
}

export function useClinicPreview() {
  const context = useContext(ClinicPreviewContext)
  if (!context) {
    throw new Error('useClinicPreview must be used within a ClinicPreviewProvider')
  }
  return context
}

/** Same context; the name reads better where it's about access rather than preview. */
export const useClinicAccess = useClinicPreview
