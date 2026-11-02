'use client'

import { useParams } from 'next/navigation'
import { PatientTreatmentPlanView } from '@/components/dashboard/patient/treatment/PatientTreatmentPlanView'
import { PageContainer, PageHeader } from '@/components/patient/ui'

/** One treatment plan, linked from My physiotherapist, notifications and earlier plans. */
export default function PatientTreatmentPlanPage() {
  const params = useParams()
  const planId = params.planId as string

  return (
    <PageContainer>
      <PageHeader title="Treatment plan" back={{ href: '/dashboard/patient/treatment-plans', label: 'My care plan' }} />
      <PatientTreatmentPlanView planId={planId} />
    </PageContainer>
  )
}
