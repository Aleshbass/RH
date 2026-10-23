'use client'

import { useState } from 'react'
import { UserPlus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import AddPatientDirectForm from './AddPatientDirectForm'

interface AddPatientModalProps {
  trigger?: React.ReactNode
  onSuccess?: () => void
}

export default function AddPatientModal({ trigger, onSuccess }: AddPatientModalProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add patient
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-0 p-6 sm:max-w-lg dark:bg-rh-ink-2">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-rh-night dark:text-white">Add a patient</DialogTitle>
          <DialogDescription>Invite them to Rehabify so you can share plans, messages and bookings.</DialogDescription>
        </DialogHeader>
        <AddPatientDirectForm
          onSuccess={() => {
            setIsOpen(false)
            onSuccess?.()
          }}
          onCancel={() => setIsOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
