'use client'

import { useQuery } from 'convex/react'
import { Skeleton } from '@/components/ui/skeleton'
import { PageShell } from '@/components/clinic/ui'
import { AgreementCenter, getMyAgreementsRef } from '@/components/agreements/AgreementCenter'

export default function ClinicAgreementPage() {
  const data = useQuery(getMyAgreementsRef, {})

  return (
    <PageShell
      title="Agreement"
      description="Your clinic's agreement with Rehabify and its order form. Sign online and download your copy."
    >
      {data === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-[1.75rem]" />
          <Skeleton className="h-96 rounded-[1.75rem]" />
        </div>
      ) : data === null ? null : (
        <AgreementCenter data={data} />
      )}
    </PageShell>
  )
}
