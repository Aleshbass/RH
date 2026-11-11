'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useAction } from 'convex/react'
import { CalendarPlus, UserPlus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PhysioDrawer } from '@/components/physio/ui'
import { useBooking } from '@/components/physio/schedule/BookingDrawer'
import { InviteStep } from '@/components/patient-join/InviteStep'
import { StepDots, StepSlide } from '@/components/patient-join/StepDrawerBody'
import { getInviteLink } from '@/components/patient-join/inviteLinkCache'
import { joinRefs } from '@/components/patient-join/refs'
import AddPatientDirectForm, { type AddedPatient } from './AddPatientDirectForm'

interface AddPatientModalProps {
  trigger?: React.ReactNode
  onSuccess?: () => void
}

const nextAction =
  'inline-flex h-9 items-center gap-1.5 rounded-full bg-rh-ink px-3.5 text-xs font-semibold text-white transition hover:opacity-90 active:scale-[0.97] dark:bg-white dark:text-rh-ink'

/**
 * Add a patient in the portal's drawer (from the right; a bottom sheet on phones), in two quick
 * steps: their details, then their link on WhatsApp or a QR code. The link is made the moment the
 * patient is saved, so step 2 opens ready.
 */
export default function AddPatientModal({ trigger, onSuccess }: AddPatientModalProps) {
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState<AddedPatient | null>(null)
  const [round, setRound] = useState(0)
  // onAdded runs just before onSuccess in the same tick; without it, the person was invited by email
  const addedNow = useRef(false)
  const createLink = useAction(joinRefs.createInviteLink)
  const openBooking = useBooking()

  const close = () => {
    setOpen(false)
    window.setTimeout(() => setAdded(null), 250)
  }
  const first = added?.name.split(' ')[0] || 'them'

  return (
    <>
      <span className="contents" onClick={() => setOpen(true)}>
        {trigger || (
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Add patient
          </Button>
        )}
      </span>
      <PhysioDrawer
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={added ? `Send ${first} their link` : 'Add a patient'}
        description={added ? `${added.name} is on your list` : 'Their WhatsApp number and name. That’s all you need.'}
      >
        <StepDots step={added ? 2 : 1} />
        <StepSlide stepKey={added ? `invite-${added.patientId}` : `details-${round}`} direction={added ? 1 : -1}>
          {added ? (
            <InviteStep
              patientId={added.patientId}
              firstName={first}
              onDone={close}
              onAddAnother={() => {
                setAdded(null)
                setRound((n) => n + 1)
              }}
              afterJoin={
                <>
                  <button
                    type="button"
                    className={nextAction}
                    onClick={() => {
                      close()
                      openBooking({ patient: { id: added.patientId, name: added.name } })
                    }}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Book first session
                  </button>
                  <Link href={`/dashboard/physiotherapist/patients/${added.patientId}`} onClick={close} className={nextAction}>
                    Open their record
                  </Link>
                </>
              }
            />
          ) : (
            <AddPatientDirectForm
              key={round}
              onAdded={(patient) => {
                // Start making their link now, while the drawer slides to step 2
                void getInviteLink(createLink, patient.patientId).catch(() => undefined)
                addedNow.current = true
                setAdded(patient)
                onSuccess?.()
              }}
              onSuccess={() => {
                // Someone already on Rehabify by email was invited instead: nothing more to do here
                if (!addedNow.current) close()
                addedNow.current = false
              }}
              onCancel={close}
            />
          )}
        </StepSlide>
      </PhysioDrawer>
    </>
  )
}
