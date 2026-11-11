'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InvitePanel } from './InvitePanel'
import type { PatientJoinState } from './refs'

/** "Send link on WhatsApp" from a patient's record (also opened by ?invite=1 from a notification). */
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl border-0 p-6 sm:max-w-md dark:bg-rh-ink-2">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-semibold tracking-tight text-rh-ink dark:text-white">
            {joined ? `New sign-in link for ${firstName}` : `Invite ${firstName} on WhatsApp`}
          </DialogTitle>
          <DialogDescription>
            {joined
              ? 'For a forgotten PIN or a locked account. They choose a new PIN; the old one stops working.'
              : 'They join with their phone number and a PIN. No email or password.'}
          </DialogDescription>
        </DialogHeader>
        {open && <InvitePanel patientId={patientId} firstName={firstName} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
