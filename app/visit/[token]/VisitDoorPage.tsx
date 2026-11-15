'use client'

import Image from 'next/image'
import { useQuery } from 'convex/react'
import { Loader2 } from '@/components/icons'
import { VisitIdentityCard } from '@/components/visit-safety/VisitIdentityCard'
import { safetyApi } from '@/components/visit-safety/safetyApi'

export function VisitDoorPage({ token }: { token: string }) {
  const data = useQuery(safetyApi.visitByToken, { token })
  const logo = <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={120} height={33} className="mb-6 h-8 w-auto" />

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-[1.75rem] bg-pt-surface p-6 text-sm text-pt-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (data === null || data.expired) {
    return (
      <div className="rounded-[1.75rem] bg-pt-surface p-6 sm:p-8">
        {logo}
        <h1 className="text-xl font-semibold">{data?.expired ? 'This visit is over' : 'This link isn’t valid'}</h1>
        <p className="mt-2 text-sm text-pt-muted">
          {data?.expired
            ? 'Links like this only work during the visit. Your physio’s details are in your Rehabify app.'
            : 'Open the latest message from Rehabify, or message Joy on WhatsApp.'}
        </p>
      </div>
    )
  }
  return (
    <>
      {logo}
      <VisitIdentityCard visit={data} />
      <p className="mt-4 px-2 text-center text-xs text-pt-muted">This page updates by itself. Keep it open until your physio has checked in.</p>
    </>
  )
}
