'use client'

import { Lock } from '@/components/icons'
import { useClinicMode } from '@/components/physio/clinicMode'

/**
 * Clinic mode: why changes are refused, when they are. Records stay readable; the server refuses
 * the changes (helpers/careAccess.ts requireClinicCareAccess), this only says why up front.
 */
export function ClinicModeBanner() {
  const clinic = useClinicMode()
  if (!clinic.active || !clinic.readOnly) return null
  return (
    <div className="mx-auto mb-5 flex w-full max-w-6xl items-start gap-3 rounded-2xl bg-pt-primary px-4 py-3 text-pt-on-primary">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-pt-accent" />
      <p className="text-sm">
        <span className="font-semibold">{clinic.clinicName ?? 'Your clinic'} is read-only for now.</span>{' '}
        <span className="opacity-80">
          You can see every record, but new notes, plans, programmes and bookings are paused until the clinic sorts out its
          Rehabify account. Your clinic owner has the details.
        </span>
      </p>
    </div>
  )
}
