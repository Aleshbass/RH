'use client'

import { useRef, useState } from 'react'
import { UserPlus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { InvitePanel } from '@/components/patient-join/InvitePanel'
import AddPatientDirectForm, { type AddedPatient } from './AddPatientDirectForm'

interface AddPatientModalProps {
  trigger?: React.ReactNode
  onSuccess?: () => void
}

/** Add a patient, then send them their personal link on WhatsApp (they join with phone + PIN). */
export default function AddPatientModal({ trigger, onSuccess }: AddPatientModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [added, setAdded] = useState<AddedPatient | null>(null)
  // onAdded runs just before onSuccess, in the same tick: a ref tells onSuccess to stay open
  const addedRef = useRef<AddedPatient | null>(null)

  const close = () => {
    setIsOpen(false)
    // Reset after the closing animation
    window.setTimeout(() => {
      addedRef.current = null
      setAdded(null)
    }, 200)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : close())}>
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
          <DialogTitle className="text-xl font-semibold tracking-tight text-rh-ink dark:text-white">
            {added ? `${added.name.split(' ')[0]} is on your list` : 'Add a patient'}
          </DialogTitle>
          <DialogDescription>
            {added ? 'One more step: send them their link so they can see their care.' : 'Name and phone number. Email only if they have one.'}
          </DialogDescription>
        </DialogHeader>
        {added ? (
          <InvitePanel patientId={added.patientId} firstName={added.name.split(' ')[0] || 'them'} onDone={close} />
        ) : (
          <AddPatientDirectForm
            onAdded={(patient) => {
              addedRef.current = patient
              setAdded(patient)
              onSuccess?.()
            }}
            onSuccess={() => {
              if (addedRef.current) return
              close()
              onSuccess?.()
            }}
            onCancel={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
