'use client'

import { Suspense } from 'react'
import { PlanPage } from '@/components/physio/plan/PlanPage'

/** Settings › Plan & billing: Free or Individual Pro (convex/physioPlans.ts). */
export default function PhysioPlanSettingsPage() {
  return (
    <Suspense>
      <PlanPage />
    </Suspense>
  )
}
