'use client'

import { PatientTreatmentPlanView } from '@/components/dashboard/patient/treatment/PatientTreatmentPlanView'
import { PageContainer, PageHeader } from '@/components/patient/ui'

export default function PatientTreatmentPlansPage() {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Treatment plan"
        description="Your goals, the stages of your recovery and the exercises your physio set for you."
        info="Your physio writes this plan after assessing you and updates it as you improve. Tap any exercise to see how to do it."
      />
      <PatientTreatmentPlanView />
    </PageContainer>
  )
}
