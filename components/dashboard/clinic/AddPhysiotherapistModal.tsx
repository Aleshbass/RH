'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'
import EnhancedClinicStaffInviteModal from './EnhancedClinicStaffInviteModal'

interface AddPhysiotherapistModalProps {
  trigger?: React.ReactNode
  onSuccess?: () => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function AddPhysiotherapistModal({ trigger, onSuccess, open, defaultOpen, onOpenChange }: AddPhysiotherapistModalProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
  const isControlled = open !== undefined
  const openValue = isControlled ? open : internalOpen
  const setOpenValue = isControlled && onOpenChange ? onOpenChange : setInternalOpen

  const handleSuccess = () => {
    setOpenValue(false)
    onSuccess?.()
  }

  return (
    <>
      {/* Trigger button - always show if provided or if not controlled */}
      {trigger ? (
        <div onClick={() => setOpenValue(true)}>
          {trigger}
        </div>
      ) : !isControlled ? (
        <Button onClick={() => setOpenValue(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Physiotherapist
        </Button>
      ) : null}
      
      {/* Enhanced modal */}
      <EnhancedClinicStaffInviteModal
        isOpen={openValue}
        onClose={() => setOpenValue(false)}
        onSuccess={handleSuccess}
      />
    </>
  )
}

