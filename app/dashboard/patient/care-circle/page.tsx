'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ArrowRight, HeartPulse } from '@/components/icons'
import { PageContainer, PageHeader, initials } from '@/components/patient/ui'
import { CareCircleManager } from '@/components/family/CareCircleManager'
import { careRefs } from '@/components/family/refs'

/**
 * The patient's care circle: family and carers who follow their care, what each can do, and
 * invites. Below it, anyone the patient themselves helps care for.
 */
export default function PatientCareCirclePage() {
  const caring = useQuery(careRefs.myCaredFor, {})
  const people = caring?.people ?? []

  return (
    <PageContainer>
      <PageHeader
        title="Care circle"
        description="Family and carers who help with your care"
        info="They see your visits, care plan and progress, never your private clinical notes. You choose whether each person can also book, pay or message your physio, and can change or remove them at any time."
      />
      <CareCircleManager audience="patient" />

      {people.length > 0 && (
        <section className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">You also help care for</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {people.map((person) => (
              <Link
                key={person.patientId}
                href={`/dashboard/family?person=${person.patientId}`}
                className="group flex items-center gap-3 rounded-3xl border border-pt-line bg-pt-surface p-4 shadow-pt transition hover:-translate-y-0.5 hover:shadow-pt-lift dark:shadow-none"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pt-green-bg text-sm font-semibold text-pt-green-fg">
                  {initials(`${person.firstName} ${person.lastName}`)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-pt-ink">
                    {person.firstName} {person.lastName}
                  </span>
                  <span className="block truncate text-xs text-pt-muted">Your {person.relationship.toLowerCase()}</span>
                </span>
                <HeartPulse className="h-4 w-4 shrink-0 text-pt-faint" />
                <ArrowRight className="h-4 w-4 shrink-0 text-pt-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  )
}
