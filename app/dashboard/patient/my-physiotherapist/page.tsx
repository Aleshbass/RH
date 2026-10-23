'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowRight, Search, Stethoscope } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  LoadingBlocks,
  PageContainer,
  PageHeader,
  Panel,
  StatusBadge,
  cardClass,
  primaryButtonClass,
} from '@/components/patient/ui'
import { PhysioPhoto } from '@/components/patient/PhysioPhoto'
import { cn } from '@/lib/utils'
import { physioName, type CareTeamMember } from '@/components/patient/careTeam'

export default function MyPhysiotherapistPage() {
  const router = useRouter()
  const careTeam = useQuery(api.patients.getPatientCareTeam) as CareTeamMember[] | undefined

  // With one physiotherapist there's nothing to choose: go straight to them
  const onlyOne = careTeam?.length === 1 ? careTeam[0].physiotherapist._id : null
  useEffect(() => {
    if (onlyOne) router.replace(`/dashboard/patient/my-physiotherapist/${onlyOne}`)
  }, [onlyOne, router])

  return (
    <PageContainer>
      <PageHeader
        title="My physiotherapists"
        description="The physiotherapists looking after you. Open one to message them, book or see your plan."
        info="Your care team is every physiotherapist you're currently seeing. Your main physio is the one who leads your treatment."
      />

      {careTeam === undefined || onlyOne ? (
        <LoadingBlocks rows={2} />
      ) : careTeam.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Stethoscope}
            title="No physiotherapist yet"
            description="Once you book a session or accept an invitation from a physio, they'll appear here."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href="/find-a-physio">
                  <Search className="mr-2 h-4 w-4" />
                  Find a physio
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {careTeam.map((member) => {
            const name = physioName(member)
            return (
              <Link
                key={member.physiotherapist._id}
                href={`/dashboard/patient/my-physiotherapist/${member.physiotherapist._id}`}
                className={cn(
                  cardClass,
                  'group flex flex-col gap-4 p-5 transition-all hover:-translate-y-0.5 hover:shadow-pt-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <PhysioPhoto name={name} imageUrl={member.physiotherapist.imageUrl} size={52} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-pt-ink">{name}</p>
                    <p className="truncate text-sm text-pt-muted">{member.clinic?.name ?? 'Independent physiotherapist'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {member.relationship.isPrimary && <StatusBadge tone="green">Main physio</StatusBadge>}
                  {(member.profile?.specializations ?? []).slice(0, 2).map((s) => (
                    <StatusBadge key={s}>{s}</StatusBadge>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between text-sm">
                  <span className="text-pt-muted">
                    {member.lastAppointment ? `Last visit ${format(member.lastAppointment, 'd MMM')}` : 'No visits yet'}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-pt-ink">
                    Open
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </PageContainer>
  )
}
