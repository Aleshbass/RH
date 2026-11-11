'use client'

import { PatientDrawer } from '@/components/patient/ui'
import { InviteStep } from './InviteStep'
import type { PatientJoinState } from './refs'

/**
 * "Send link" from a patient's record (also opened by ?invite=1 from a notification), in the
 * portal's drawer: WhatsApp, or a QR code when they're in the room, with live progress.
 */
export function InviteDialog({
  open,
  onOpenChange,
  patientId,
  firstName,
  join,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: string
  firstName: string
  join?: PatientJoinState | null
}) {
  const joined = join?.status === 'joined' || join?.status === 'programme_started'
  return (
    <PatientDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={joined ? `New sign-in link for ${firstName}` : `Send ${firstName} their link`}
      description={
        joined
          ? 'For a forgotten PIN or a locked account. They choose a new PIN; the old one stops working.'
          : 'They join with their phone number and a PIN. No email or password.'
      }
    >
      {open && <InviteStep patientId={patientId} firstName={firstName} reset={joined} onDone={() => onOpenChange(false)} />}
    </PatientDrawer>
  )
}
