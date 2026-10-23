import { PageSkeleton } from '@/components/patient/ui'

/** Shown instantly while a patient page loads; the patient shell stays mounted around it. */
export default function PatientPageLoading() {
  return <PageSkeleton />
}
