'use client'

import Link from 'next/link'
import { ADMIN_HOME } from '@/components/admin/shell/adminNav'

/**
 * How finance pages identify a patient: their Rehabify ID, linked to the admin user page.
 * Names and contact details stay off finance screens; open the patient to follow up.
 */
export function PatientRef({
  userId,
  patientNumber,
  isGuest,
}: {
  userId?: string | null
  patientNumber?: string | null
  isGuest?: boolean
}) {
  const label = patientNumber ?? (isGuest ? 'Guest' : 'No ID yet')
  const className = 'font-mono text-xs font-medium text-rh-night dark:text-white'
  if (!userId) return <span className={className}>{label}</span>
  return (
    <Link href={`${ADMIN_HOME}/users/${userId}`} className={`${className} hover:underline`} title="Open patient to follow up">
      {label}
    </Link>
  )
}

/** The value a CSV export uses for the patient column. */
export function patientRefText(patientNumber?: string | null, isGuest?: boolean) {
  return patientNumber ?? (isGuest ? 'guest' : '')
}
