'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowUpRight, Building2, House, Mail, Phone, SearchX, Store, UserCheck, Users, Video } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, StatusBadge, cardClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { cn } from '@/lib/utils'
import {
  ADMIN_BASE,
  AccountBadges,
  CASELOAD_STATUS,
  MODE_DESCRIPTION,
  ModeChip,
  PersonAvatar,
  SourceBar,
  SourceLegend,
  dayLabel,
  physioCaseloadRef,
  sessionWhen,
  shortDate,
  sourceText,
  timeAgo,
  userHref,
  type CaseloadPatient,
  type CaseloadResult,
  type DirectoryRow,
  type UpcomingSession,
} from './shared'

const sectionTitle = 'text-sm font-semibold text-rh-ink dark:text-white'
const muted = 'text-xs text-neutral-500 dark:text-neutral-400'
const rowLink =
  'block rounded-xl px-3 py-2.5 transition-colors hover:bg-rh-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:hover:bg-white/[0.04]'

/**
 * Right-hand drawer for one physiotherapist: who they are, the patients they're handling now
 * and their next 14 days. `preview` is the directory row, shown while the caseload loads.
 */
export function PhysioSheet({
  physioId,
  preview,
  onClose,
}: {
  physioId: string | null
  preview: DirectoryRow | null
  onClose: () => void
}) {
  // Keep the last physio while the drawer slides closed, so it doesn't flash a skeleton
  const [shownId, setShownId] = useState(physioId)
  const [shownPreview, setShownPreview] = useState(preview)
  if (physioId && physioId !== shownId) setShownId(physioId)
  if (preview && preview !== shownPreview) setShownPreview(preview)
  const data = useQuery(physioCaseloadRef, shownId ? { physiotherapistId: shownId } : 'skip')

  return (
    <Sheet open={Boolean(physioId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-xl"
      >
        {data === null ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Physiotherapist not found</SheetTitle>
              <SheetDescription>The link may be wrong, or the account is no longer a physiotherapist.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={<SearchX />}
                title="We couldn't find this physiotherapist"
                description="The link may be wrong, or the account is no longer a physiotherapist."
              />
            </div>
          </>
        ) : (
          <SheetBody data={data} preview={shownPreview?.userId === shownId ? shownPreview : null} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function SheetBody({ data, preview }: { data: CaseloadResult | undefined; preview: DirectoryRow | null }) {
  const physio = data?.physio
  // Header details: the loaded caseload, else the directory row we already have
  const head = physio ?? preview

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-3 border-b border-black/[0.05] bg-white px-5 pb-5 pt-5 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
        {head ? (
          <>
            <div className="flex items-start gap-3 pr-8">
              <PersonAvatar id={head.userId} name={head.name} imageUrl={head.imageUrl} size={56} />
              <div className="min-w-0 flex-1">
                <SheetTitle className="break-words text-lg font-semibold leading-tight text-rh-ink dark:text-white">
                  {head.name}
                </SheetTitle>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <RehabifyId value={head.rehabifyId} />
                  <ModeChip mode={head.mode} />
                  <AccountBadges
                    approvalStatus={head.approvalStatus}
                    suspended={head.suspended}
                    clinicSuspended={head.clinicSuspended}
                  />
                </div>
              </div>
            </div>
            <SheetDescription className="text-sm text-neutral-600 dark:text-neutral-300">
              {head.mode === 'clinic' && head.clinicName ? `Works at ${head.clinicName}` : `Sees ${MODE_DESCRIPTION[head.mode].toLowerCase()}`}
            </SheetDescription>
            <div className="flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-4">
              {head.email && (
                <a href={`mailto:${head.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-rh-ink underline-offset-4 hover:underline dark:text-white">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  <span className="truncate">{head.email}</span>
                </a>
              )}
              {head.phone && (
                <a href={`tel:${head.phone}`} className="inline-flex items-center gap-1.5 text-rh-ink underline-offset-4 hover:underline dark:text-white">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  {head.phone}
                </a>
              )}
            </div>
            <QuickLinks userId={head.userId} mode={head.mode} clinicId={head.clinicId} />
          </>
        ) : (
          <>
            <SheetTitle className="sr-only">Loading physiotherapist</SheetTitle>
            <SheetDescription className="sr-only">Loading their caseload</SheetDescription>
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40 rounded-md" />
                <Skeleton className="h-4 w-56 rounded-md" />
              </div>
            </div>
          </>
        )}
      </SheetHeader>

      <div className="flex-1 space-y-4 p-4 sm:p-5">
        {data === undefined ? (
          <>
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </>
        ) : (
          <>
            <Summary data={data} />
            <Caseload data={data} />
            <Upcoming sessions={data.upcoming} />
          </>
        )}
      </div>
    </div>
  )
}

function QuickLinks({ userId, mode, clinicId }: { userId: string; mode: DirectoryRow['mode']; clinicId: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" className={cn(primaryButtonClass, 'h-9')}>
        <Link href={userHref(userId)}>
          Full profile
          <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" className={cn(softButtonClass, 'h-9')}>
        <Link href={`${ADMIN_BASE}/approvals`}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" />
          Approvals
        </Link>
      </Button>
      {(mode === 'network' || mode === 'both') && (
        <Button asChild size="sm" variant="outline" className={cn(softButtonClass, 'h-9')}>
          <Link href={`${ADMIN_BASE}/marketplace-listing`}>
            <Store className="mr-1.5 h-3.5 w-3.5" />
            Listing
          </Link>
        </Button>
      )}
      {clinicId && (
        <Button asChild size="sm" variant="outline" className={cn(softButtonClass, 'h-9')}>
          <Link href={`${ADMIN_BASE}/clinics/${clinicId}`}>
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Clinic
          </Link>
        </Button>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={muted}>{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-rh-ink dark:text-white">{children}</dd>
    </div>
  )
}

const AGREEMENT_LABEL = { active: 'Signed', awaiting_countersign: 'Needs countersign', outdated: 'New version', not_signed: 'Not signed' } as const
const AGREEMENT_TONE = { active: 'green', awaiting_countersign: 'teal', outdated: 'amber', not_signed: 'amber' } as const

function Summary({ data }: { data: CaseloadResult }) {
  const { physio } = data
  const networkMode = physio.mode === 'network' || physio.mode === 'both'
  const sessions = [physio.offersOnline && 'Video', physio.offersInPerson && 'In person'].filter(Boolean).join(' and ')
  return (
    <section className={cn(cardClass, 'p-4')} aria-label="Profile">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Location">{physio.location ?? 'Not set'}</Fact>
        <Fact label="Joined">{shortDate(physio.joinedAt)}</Fact>
        <Fact label="Last activity">{physio.lastActiveAt ? timeAgo(physio.lastActiveAt) : 'None yet'}</Fact>
        {networkMode ? (
          <Fact label="Find a Physio">
            {physio.liveOnFindAPhysio ? (
              <StatusBadge tone="green">Live</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Not live</StatusBadge>
            )}
          </Fact>
        ) : (
          <Fact label="Find a Physio">{physio.mode === 'clinic' ? 'Booked through the clinic' : 'Not listed'}</Fact>
        )}
        {physio.yearsOfExperience !== null && (
          <Fact label="Experience">
            {physio.yearsOfExperience} {physio.yearsOfExperience === 1 ? 'year' : 'years'}
          </Fact>
        )}
        {physio.rating !== null && (
          <Fact label="Rating">
            {physio.rating.toFixed(1)} <span className="font-normal text-neutral-500">({physio.reviewCount})</span>
          </Fact>
        )}
        {sessions && <Fact label="Sessions">{sessions}</Fact>}
        {physio.agreements.length > 0 && (
          <Fact label={physio.agreements.length > 1 ? 'Agreements' : 'Agreement'}>
            <Link href="/dashboard/admin/agreements" className="flex flex-wrap gap-1.5">
              {physio.agreements.map((agreement) => (
                <StatusBadge key={agreement.id} tone={AGREEMENT_TONE[agreement.state]}>
                  {physio.agreements.length > 1 ? `${agreement.shortTitle.replace(/ agreement$/, '')}: ` : ''}
                  {AGREEMENT_LABEL[agreement.state]}
                </StatusBadge>
              ))}
            </Link>
          </Fact>
        )}
      </dl>
      {physio.specializations.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialisations">
          {physio.specializations.map((item) => (
            <li key={item}>
              <StatusBadge>{item}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Caseload({ data }: { data: CaseloadResult }) {
  return (
    <section className={cn(cardClass, 'overflow-hidden')} aria-labelledby="caseload-title">
      <div className="space-y-2.5 px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="caseload-title" className={sectionTitle}>
            Current patients
          </h3>
          <span className="text-2xl font-semibold tabular-nums text-rh-ink dark:text-white">{data.counts.total}</span>
        </div>
        {data.counts.total > 0 && (
          <>
            <SourceBar split={data.counts} className="h-2" />
            <SourceLegend split={data.counts} />
          </>
        )}
      </div>

      {data.patients.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Not seeing anyone right now"
          description={`No active care, nothing booked and no sessions in the last ${data.windowDays} days.`}
        />
      ) : (
        <ul className="space-y-0.5 border-t border-black/[0.05] p-1.5 dark:border-white/[0.06]">
          {data.patients.map((patient) => (
            <li key={patient.patientId}>
              <PatientRow patient={patient} />
            </li>
          ))}
        </ul>
      )}

      {(data.otherOnRecord > 0 || data.patientsCapped || data.sessionsCapped) && (
        <div className="space-y-1 border-t border-black/[0.05] px-4 py-3 dark:border-white/[0.06]">
          {data.otherOnRecord > 0 && (
            <p className={muted}>
              {data.otherOnRecord} more on record, not seen in the last {data.windowDays} days.
            </p>
          )}
          {data.patientsCapped && <p className={muted}>Showing the first {data.patients.length} patients.</p>}
          {data.sessionsCapped && <p className={muted}>Session counts include the latest 2,000 sessions only.</p>}
        </div>
      )}
    </section>
  )
}

function PatientRow({ patient }: { patient: CaseloadPatient }) {
  const status = CASELOAD_STATUS[patient.status]
  const sessions = [
    patient.lastSessionAt ? `Last ${format(patient.lastSessionAt, 'd MMM')}` : null,
    patient.nextSessionAt ? `Next ${sessionWhen(patient.nextSessionAt)}` : null,
    `${patient.sessionsCompleted} done`,
  ].filter(Boolean)
  const care = carePlanText(patient)

  return (
    <Link href={userHref(patient.patientId)} className={cn(rowLink, 'flex items-start gap-3')}>
      <PersonAvatar id={patient.patientId} name={patient.name} imageUrl={patient.imageUrl} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-semibold text-rh-ink dark:text-white">{patient.name}</span>
          <RehabifyId value={patient.rehabifyId} copyable={false} />
        </span>
        <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-300">{sourceText(patient.source, patient.channel)}</span>
        <span className={cn('mt-0.5 block', muted)}>{sessions.join(' · ')}</span>
        {care && <span className={cn('mt-0.5 block', muted)}>{care}</span>}
      </span>
      <StatusBadge tone={status.tone} className="mt-0.5">
        {status.label}
      </StatusBadge>
    </Link>
  )
}

/** Episode and plan status only: never the condition or the plan's contents. */
function carePlanText(patient: CaseloadPatient) {
  const parts: string[] = []
  if (patient.episode) {
    const planned = patient.plan?.plannedSessions ?? patient.episode.plannedSessions
    const since = `Care since ${format(patient.episode.startedAt, 'd MMM yyyy')}`
    parts.push(planned ? `${since} · ${planned} sessions planned` : since)
  }
  if (patient.plan) {
    const plan = [`Care plan v${patient.plan.version}`]
    if (patient.plan.sessionFrequency) plan.push(patient.plan.sessionFrequency)
    if (patient.plan.reviewDate) plan.push(`review ${format(patient.plan.reviewDate, 'd MMM')}`)
    parts.push(plan.join(', '))
  } else if (patient.episode) {
    parts.push('No care plan yet')
  }
  return parts.join(' · ')
}

function Upcoming({ sessions }: { sessions: UpcomingSession[] }) {
  const days = useMemo(() => {
    const groups: { key: string; label: string; items: UpcomingSession[] }[] = []
    for (const session of sessions) {
      const key = format(session.startTime, 'yyyy-MM-dd')
      const last = groups[groups.length - 1]
      if (last?.key === key) last.items.push(session)
      else groups.push({ key, label: dayLabel(session.startTime), items: [session] })
    }
    return groups
  }, [sessions])

  return (
    <section className={cn(cardClass, 'overflow-hidden')} aria-labelledby="upcoming-title">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
        <h3 id="upcoming-title" className={sectionTitle}>
          Next 14 days
        </h3>
        <span className={muted}>
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </span>
      </div>
      {days.length === 0 ? (
        <p className="px-4 pb-5 pt-1 text-sm text-neutral-500 dark:text-neutral-400">Nothing booked in the next 14 days.</p>
      ) : (
        <div className="space-y-3 px-1.5 pb-2">
          {days.map((day) => (
            <div key={day.key}>
              <p className="px-3 pb-1 pt-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">{day.label}</p>
              <ul className="space-y-0.5">
                {day.items.map((session) => (
                  <li key={session.appointmentId}>
                    <Link href={userHref(session.patientId)} className={cn(rowLink, 'flex items-start gap-3')}>
                      <span className="w-[86px] shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-rh-ink dark:text-white">
                        {format(session.startTime, 'HH:mm')}
                        <span className="font-normal text-neutral-400">–{format(session.endTime, 'HH:mm')}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 truncate text-sm font-medium text-rh-ink dark:text-white">{session.patientName}</span>
                          <RehabifyId value={session.patientRehabifyId} copyable={false} />
                        </span>
                        <span className={cn('mt-0.5 flex items-center gap-1.5', muted)}>
                          {session.online ? <Video className="h-3 w-3 shrink-0" /> : <House className="h-3 w-3 shrink-0" />}
                          <span className="truncate">
                            {session.online ? 'Video' : 'In person'} · {session.serviceType}
                          </span>
                        </span>
                      </span>
                      {session.status === 'confirmed' ? (
                        <StatusBadge tone="green">Confirmed</StatusBadge>
                      ) : (
                        <StatusBadge tone="amber">To confirm</StatusBadge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
