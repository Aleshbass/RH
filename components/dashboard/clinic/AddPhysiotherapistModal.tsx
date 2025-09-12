'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'
import AddPhysiotherapistDirectForm from './AddPhysiotherapistDirectForm'

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

  const handleCancel = () => {
    setOpenValue(false)
  }

  return (
    <Dialog open={openValue} onOpenChange={setOpenValue}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Physiotherapist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Physiotherapist</DialogTitle>
        </DialogHeader>
        <AddPhysiotherapistDirectForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  )
}

