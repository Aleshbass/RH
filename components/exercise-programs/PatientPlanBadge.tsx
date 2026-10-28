'use client'

import { makeFunctionReference } from 'convex/server'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { StatusBadge } from '@/components/physio/ui'

type CareTeamPlan = { plan: 'flex' | 'flex_max' | null; name: string; expiresAt: number | null; waiting: boolean } | null

const planRef = makeFunctionReference<'query', { patientId: string }, CareTeamPlan>('exercisePrograms:patientPlanForCareTeam')

/**
 * For an independent physio's own patient: whether they have Flex or Flex Max (bought from
 * Rehabify; the physio earns no commission on it). Renders nothing for Rehabify Care and clinic
 * patients, or before Flex launches.
 */
export function PatientPlanBadge({ patientId }: { patientId: string }) {
  const data = useQuery(planRef, { patientId })
  if (!data) return null
  if (data.plan) {
    return (
      <StatusBadge tone="green" className="bg-rh-lime text-rh-ink">
        {data.name}
        {data.expiresAt ? ` until ${format(data.expiresAt, 'd MMM')}` : ''}
      </StatusBadge>
    )
  }
  return <StatusBadge>{data.waiting ? 'Flex paid, starts with a programme' : 'Basic plan'}</StatusBadge>
}
