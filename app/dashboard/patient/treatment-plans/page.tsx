'use client'

import { FlexPaymentReturn } from '@/components/exercise-programs/FlexUpgradeCard'
import { PatientCarePlan } from '@/components/dashboard/patient/treatment/PatientTreatmentPlanView'
import { PatientCheckInCard } from '@/components/patient/PatientCheckInCard'
import { PageContainer, PageHeader } from '@/components/patient/ui'
import { useOnline } from '@/lib/offline/session'

/** My care plan: the treatment plan and home exercises together (/dashboard/patient/exercises redirects here). */
export default function PatientCarePlanPage() {
  // Offline, the app opens here (the home page needs internet), so the daily check-in is here too
  const online = useOnline()
  return (
    <PageContainer>
      {/* Paystack's Flex return arrives here (?reference=…), through the /exercises redirect */}
      <FlexPaymentReturn />
      <PageHeader
        title="My care plan"
        description="Today’s exercises, your goals and the plan your physio wrote for you."
        info="Your physio writes this plan after assessing you and updates it as you improve. Doing your exercises little and often between visits is what makes physio work: your physio sees what you’ve done and how it felt."
      />
      {!online && <PatientCheckInCard />}
      <PatientCarePlan />
    </PageContainer>
  )
}
