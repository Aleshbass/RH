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

interface ClinicPreviewContextType {
  isPreviewMode: boolean
  isPendingApproval: boolean
  isOnboardingIncomplete: boolean
  isDeclined: boolean
  requireFullAccess: (actionName?: string, callback?: () => void) => boolean
  openOnboardingWizard: () => void
}

const ClinicPreviewContext = createContext<ClinicPreviewContextType | undefined>(undefined)

export function ClinicPreviewProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const currentUser = useQuery(api.users.getMyUser)
  const approvalStatus = useQuery(
    api.users.getUserApprovalStatus,
    currentUser ? {} : "skip"
  )

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [attemptedAction, setAttemptedAction] = useState<string>('Live Action')

  // A skip always leaves onboarded=false, so a stale onboardingSkipped flag on an onboarded account is ignored
  const isOnboardingIncomplete = Boolean(currentUser && !currentUser.onboarded)

  const isDeclined = Boolean(approvalStatus && approvalStatus.status === 'declined')
  // The backend only allows live actions once approved, so anything short of that
  // (pending, more info requested, or no review record yet) waits for approval.
  const isPendingApproval = Boolean(
    currentUser?.role === 'clinic_owner' &&
      currentUser.onboarded &&
      approvalStatus !== undefined &&
      approvalStatus?.status !== 'approved' &&
      !isDeclined
  )

  // Preview mode is true if guest, non-clinic-owner exploring preview, onboarding was skipped, not finished, or pending admin approval
  const isPreviewMode =
    !currentUser ||
    currentUser.role !== 'clinic_owner' ||
    isOnboardingIncomplete ||
    isPendingApproval

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

  return (
    <ClinicPreviewContext.Provider
      value={{
        isPreviewMode,
        isPendingApproval,
        isOnboardingIncomplete,
        isDeclined,
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
              {isPendingApproval ? 'Waiting for approval' : 'Finish setting up your clinic'}
            </DialogTitle>
            <DialogDescription>
              {isPendingApproval
                ? `"${attemptedAction}" will work once we've verified your clinic. We'll email you as soon as you're approved.`
                : `"${attemptedAction}" needs a set-up clinic. It takes a few minutes, and you can pick up where you left off.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Not now
            </Button>
            {!isPendingApproval && (
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
