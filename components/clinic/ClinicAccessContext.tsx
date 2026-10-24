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
import { ArrowRight, Lock, Clock } from '@/components/icons'

/** Pages a clinic role can be given (matches CLINIC_AREAS in convex/clinicTools.ts). Home is always available. */
export const CLINIC_AREAS = ['appointments', 'patients', 'referrals', 'billing', 'team', 'reports', 'settings'] as const
export type ClinicArea = (typeof CLINIC_AREAS)[number]

export type ClinicStaffKind = 'owner' | 'clinician' | 'front_desk'

export const CLINIC_AREA_LABELS: Record<ClinicArea, string> = {
  appointments: 'Appointments',
  patients: 'Patients',
  referrals: 'Referrals',
  billing: 'Billing',
  team: 'Team',
  reports: 'Reports',
  settings: 'Clinic settings',
}

/** api.clinicTools.getMyClinicAccess for someone who isn't a clinic owner or team member. */
export type NonMemberAccess = { mode: 'none'; signedIn: boolean; role: string | null }

interface ClinicAccessContextType {
  /**
   * The clinic can't take changes yet: still loading, set-up unfinished, waiting for Rehabify's
   * approval, declined, or the member's access was paused. Pages stay readable; actions ask first.
   */
  isReadOnly: boolean
  isPendingApproval: boolean
  isOnboardingIncomplete: boolean
  isDeclined: boolean
  /** Signed in as the clinic owner */
  isOwner: boolean
  /** Signed in as a clinic team member (clinician or front desk) */
  isStaff: boolean
  /** owner, clinician or front desk; null until access has loaded */
  staffKind: ClinicStaffKind | null
  /** A clinician on the team (not the owner): gets a personal home instead of the clinic overview */
  isClinician: boolean
  /** Signed-in person's first name, for the greeting */
  firstName: string | null
  /** A clinician who also has their own approved Rehabify physio account (can switch to it) */
  hasOwnPhysioPortal: boolean
  /** Team member whose access was suspended by the owner */
  isSuspended: boolean
  /** The whole clinic was suspended by Rehabify: records stay readable, changes are refused */
  isClinicSuspended: boolean
  clinicSuspendedReason: string | null
  /** Whether the signed-in owner/member can use a page */
  canUse: (area: ClinicArea) => boolean
  clinicName: string | null
  logoUrl: string | null
  roleName: string | null
  /** False until access has loaded */
  isLoaded: boolean
  /** Signed in, but not a clinic owner or team member (the portal sends them elsewhere) */
  nonMember: NonMemberAccess | null
  requireFullAccess: (actionName?: string, callback?: () => void) => boolean
  openOnboardingWizard: () => void
}

const ClinicAccessContext = createContext<ClinicAccessContextType | undefined>(undefined)

export function ClinicAccessProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const access = useQuery(api.clinicTools.getMyClinicAccess)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [attemptedAction, setAttemptedAction] = useState<string>('This action')

  const isLoaded = access !== undefined
  const member = access && access.mode !== 'none' ? access : null
  const nonMember = access && access.mode === 'none' ? (access as NonMemberAccess) : null
  const isOwner = member?.mode === 'owner'
  const isStaff = member?.mode === 'staff'
  const staffKind = (member?.staffKind ?? null) as ClinicStaffKind | null
  const isClinician = staffKind === 'clinician'
  const firstName = (member?.firstName as string | null | undefined) ?? null
  const hasOwnPhysioPortal = Boolean(member?.hasOwnPhysioPortal)

  const isDeclined = member?.approvalStatus === 'declined'
  const isOnboardingIncomplete = Boolean(member && !member.ownerOnboarded)
  // The backend only allows changes once approved, so anything short of that waits for approval
  const isPendingApproval = Boolean(
    member && member.ownerOnboarded && member.approvalStatus !== 'approved' && !isDeclined
  )
  const isSuspended = Boolean(member?.suspended)
  // A suspended clinic still sees its real records; changes are refused by the backend
  const isClinicSuspended = Boolean(member?.clinicSuspended)
  const clinicSuspendedReason = member?.clinicSuspendedReason ?? null

  const isReadOnly = !member || isOnboardingIncomplete || isPendingApproval || isDeclined || isSuspended

  const canUse = (area: ClinicArea) => {
    if (!member) return false
    return member.permissions === 'all' || member.permissions.includes(area)
  }

  const openOnboardingWizard = () => {
    setIsModalOpen(false)
    router.push('/clinic-owner')
  }

  const requireFullAccess = (actionName = 'This action', callback?: () => void): boolean => {
    if (isReadOnly || isClinicSuspended) {
      setAttemptedAction(actionName)
      setIsModalOpen(true)
      return false
    }
    if (callback) callback()
    return true
  }

  // Team members can't finish the owner's setup, so they only get an explanation
  const canFinishSetup = !isPendingApproval && !isStaff && !isClinicSuspended

  return (
    <ClinicAccessContext.Provider
      value={{
        isReadOnly,
        isPendingApproval,
        isOnboardingIncomplete,
        isDeclined,
        isOwner,
        isStaff,
        staffKind,
        isClinician,
        firstName: firstName || null,
        hasOwnPhysioPortal,
        isSuspended,
        isClinicSuspended,
        clinicSuspendedReason,
        canUse,
        clinicName: member?.clinicName ?? null,
        logoUrl: member?.logoUrl ?? null,
        roleName: member?.roleName ?? null,
        isLoaded,
        nonMember,
        requireFullAccess,
        openOnboardingWizard,
      }}
    >
      {children}

      {/* Shown when an action is attempted before the clinic can take changes */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              {isPendingApproval ? <Clock className="h-4 w-4 text-amber-600" /> : <Lock className="h-4 w-4 text-neutral-400" />}
              {isClinicSuspended
                ? 'Clinic suspended'
                : isPendingApproval
                ? 'Waiting for approval'
                : isSuspended
                  ? 'Access paused'
                  : isStaff
                    ? 'Not available yet'
                    : 'Finish setting up your clinic'}
            </DialogTitle>
            <DialogDescription>
              {isClinicSuspended
                ? `Rehabify has suspended this clinic, so "${attemptedAction}" is turned off. Contact support@physioaroundme.com to restore access.`
                : isPendingApproval
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
    </ClinicAccessContext.Provider>
  )
}

export function useClinicAccess() {
  const context = useContext(ClinicAccessContext)
  if (!context) {
    throw new Error('useClinicAccess must be used within a ClinicAccessProvider')
  }
  return context
}
