'use client'

import { useQuery } from 'convex/react'
import { VisitIdentityCard } from './VisitIdentityCard'
import { safetyApi } from './safetyApi'

/** Patient dashboard: the home-visit physio on the way or with them now, with their photo and the door code. */
export function IncomingVisitCard() {
  const visit = useQuery(safetyApi.myIncomingVisit, {})
  if (!visit) return null
  return <VisitIdentityCard visit={visit} />
}
