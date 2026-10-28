'use client'

import { useParams } from 'next/navigation'
import type { Id } from '@/convex/_generated/dataModel'
import { ProgressReportScreen } from '@/components/physio/workspace/ProgressReportPanel'

/** The patient's progress report for their referrer: edit, preview, print or share. */
export default function PatientProgressReportPage() {
  const params = useParams()
  return <ProgressReportScreen patientId={params.patientId as Id<'users'>} />
}
