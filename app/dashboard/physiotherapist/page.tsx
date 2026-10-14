'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { PhysioHome } from '@/components/physio/PhysioHome'
import { PhysioTour } from '@/components/physio/PhysioTour'
import { SetupReminder } from '@/components/physio/SetupReminder'
import type { SetupStatus } from '@/components/physio/SetupChecklist'

/** Home. Access (sign-in, role, approval) is handled by the portal shell in layout.tsx. */
export default function PhysiotherapistDashboardPage() {
  const user = useQuery(api.users.getMyUser)
  const setup = useQuery(api.physioSetup.getMySetupStatus) as SetupStatus | null | undefined

  return (
    <>
      <PhysioHome setup={setup} />
      <PhysioTour firstName={user?.firstName} enabled={setup?.approvalStatus !== 'pending_review'} />
      <SetupReminder setup={setup} />
    </>
  )
}
