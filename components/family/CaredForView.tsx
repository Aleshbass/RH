'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns'
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Dumbbell,
  HeartPulse,
  MessageSquare,
  Phone,
  ShieldAlert,
  Stethoscope,
  Users,
  Video,
  WhatsApp,
} from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  IconChip,
  InfoTip,
  LoadingBlocks,
  Panel,
  PatientDrawer,
  StatusBadge,
  accentButtonClass,
  formatNaira,
  initials,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/patient/ui'
import { cn } from '@/lib/utils'
import { ACCESS_LABEL, careRefs, type Visit } from './refs'
import { CheckInForDrawer, OwnLoginDrawer, RequestVisitDrawer, findPhysioWithJoy } from './FamilyDrawers'
import { CareCircleManager } from './CareCircleManager'

function visitDay(ms: number) {
  const day = new Date(ms)
  if (isToday(day)) return 'Today'
  if (isTomorrow(day)) return 'Tomorrow'
  return format(day, 'EEE d MMM')
}

function painTone(score: number) {
  if (score >= 7) return 'bg-pt-rose-bg text-pt-rose-fg'
  if (score >= 4) return 'bg-pt-neutral-bg text-pt-ink'
  return 'bg-pt-green-bg text-pt-green-fg'
}

function VisitRow({ visit }: { visit: Visit }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
      <IconChip icon={visit.online ? Video : CalendarPlus} tone="neutral" size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-pt-ink">
          {visitDay(visit.startTime)}, {format(visit.startTime, 'h:mm a')}
        </p>
        <p className="truncate text-xs text-pt-muted">
          {visit.service}
          {visit.online ? ' · Video' : ''} · {visit.clinician}
        </p>
      </div>
      <StatusBadge tone={visit.status === 'confirmed' ? 'green' : visit.status === 'completed' ? 'neutral' : 'blue'}>{visit.statusLabel}</StatusBadge>
    </li>
  )
}

/**
 * One person a caregiver looks after: what's next, who's treating them, how they're doing, their
 * plan and what's owed. Actions depend on the access they were given.
 */
export function CaredForView({ patientId }: { patientId: Id<'users'> }) {
  const data = useQuery(careRefs.overview, { patientId })
  const [drawer, setDrawer] = useState<'checkin' | 'visit' | 'circle' | 'login' | null>(null)

  if (data === undefined) {
    return (
      <div className="space-y-5">
        <LoadingBlocks rows={1} className="[&>*]:h-40 [&>*]:rounded-3xl" />
        <div className="grid gap-5 md:grid-cols-2">
          <LoadingBlocks rows={1} className="[&>*]:h-48 [&>*]:rounded-3xl" />
          <LoadingBlocks rows={1} className="[&>*]:h-48 [&>*]:rounded-3xl" />
        </div>
      </div>
    )
  }
  if (data === null) {
    return (
      <Panel>
        <EmptyState icon={Users} title="You can't see this person's care any more" description="They (or their clinic) may have changed who's in their care circle." />
      </Panel>
    )
  }

  const { person, access, clinic, clinicians } = data
  const name = `${person.firstName} ${person.lastName}`.trim()
  const first = person.firstName || 'them'
  const next = data.upcoming[0] ?? null
  const hasCareTeam = clinicians.length > 0 || Boolean(clinic)
  const goesTo = clinic?.name ?? clinicians[0]?.name ?? null
  const latest = data.checkIns[0] ?? null
  const painPoints = data.checkIns.slice(0, 10).reverse()
  const goalsMet = data.plan ? data.plan.goals.filter((g) => g.achieved).length : 0
  const owed = data.invoices.reduce((sum, i) => sum + i.amountKobo, 0)
  const clinicPhone = clinic?.phone?.replace(/[^\d+]/g, '') ?? null

  return (
    <div className="space-y-5">
      {/* Who, and the two things caregivers do most */}
      <section className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-pt-green-bg text-xl font-semibold text-pt-green-fg">{initials(name)}</span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Caring for</p>
              <h1 className="truncate text-2xl font-semibold tracking-tight text-pt-ink sm:text-[28px]">{name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge>Your {access.relationship.toLowerCase()}</StatusBadge>
                {person.age !== null && <StatusBadge>{person.age} years</StatusBadge>}
                {person.city && <StatusBadge>{person.city}</StatusBadge>}
                {access.managed ? <StatusBadge tone="violet">You manage this profile</StatusBadge> : <StatusBadge tone="green">{ACCESS_LABEL[access.level]}</StatusBadge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.checkedInToday ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-pt-green-bg px-4 text-sm font-semibold text-pt-green-fg">
                <Check className="h-4 w-4" />
                Checked in today
              </span>
            ) : (
              <Button className={cn(primaryButtonClass, 'h-11 px-5')} onClick={() => setDrawer('checkin')}>
                <HeartPulse className="mr-2 h-4 w-4" />
                Check in for {first}
              </Button>
            )}
            {access.canBook &&
              (hasCareTeam ? (
                <Button className={cn(secondaryButtonClass, 'h-11 px-5')} onClick={() => setDrawer('visit')}>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Ask for a visit
                </Button>
              ) : (
                <Button asChild className={cn(accentButtonClass, 'h-11 px-5')}>
                  <a href={findPhysioWithJoy(first, access.relationship, person.city)} target="_blank" rel="noopener noreferrer">
                    <WhatsApp className="mr-2 h-4 w-4" />
                    Find a physio for {first}
                  </a>
                </Button>
              ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Next visit */}
        <Panel title="Next visit" info={`Visits booked for ${first}. You get a notification when one is booked, moved or confirmed.`} bodyClassName="px-2 pb-3 sm:px-3">
          {next ? (
            <ul>
              {data.upcoming.map((visit) => (
                <VisitRow key={visit._id} visit={visit} />
              ))}
            </ul>
          ) : (
            <div className="px-3 pb-2 pt-1">
              <p className="text-sm text-pt-muted">Nothing booked yet.</p>
              {access.canBook && hasCareTeam && (
                <Button className={cn(secondaryButtonClass, 'mt-3 h-9')} onClick={() => setDrawer('visit')}>
                  Ask for a visit
                </Button>
              )}
            </div>
          )}
        </Panel>

        {/* Care team */}
        <Panel title="Care team" bodyClassName="px-2 pb-3 sm:px-3">
          {!hasCareTeam ? (
            <div className="px-3 pb-2 pt-1 text-sm text-pt-muted">
              No physio yet. {access.canBook ? 'Joy on WhatsApp finds one near them, for a home visit, a clinic or online.' : 'Ask whoever manages their care to book one.'}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {clinicians.map((c) => (
                <li key={c.userId} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                  <IconChip icon={Stethoscope} tone="green" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-pt-ink">{c.name}</p>
                    <p className="truncate text-xs text-pt-muted">Physiotherapist{c.clinicName ? ` · ${c.clinicName}` : ''}</p>
                  </div>
                  {access.canMessage && (
                    <Button asChild size="sm" className={cn(secondaryButtonClass, 'h-9')}>
                      <Link href={`/dashboard/family/messages?with=${c.userId}&person=${person._id}`}>
                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                        Message
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
              {clinic && (
                <li className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                  <IconChip icon={Users} tone="neutral" size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-pt-ink">{clinic.name}</p>
                    <p className="truncate text-xs text-pt-muted">{clinic.address ?? 'Their clinic'}</p>
                  </div>
                  {clinicPhone && (
                    <Button asChild size="sm" className={cn(secondaryButtonClass, 'h-9')}>
                      <a href={`tel:${clinicPhone}`}>
                        <Phone className="mr-1.5 h-3.5 w-3.5" />
                        Call
                      </a>
                    </Button>
                  )}
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>

      {/* How they're doing */}
      <Panel title="How they're doing" info="Check-ins (from them or from you) and how much of their home exercise programme they did in the last 7 days.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            {latest ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums', painTone(latest.painScore))}>Pain {latest.painScore}/10</span>
                  {latest.mood && <StatusBadge>Mood: {latest.mood}</StatusBadge>}
                </div>
                <p className="text-xs text-pt-muted">Last check-in {formatDistanceToNow(latest.createdAt, { addSuffix: true })}</p>
                {painPoints.length > 1 && (
                  <div className="flex h-20 items-end gap-1.5" role="img" aria-label="Pain at recent check-ins">
                    {painPoints.map((c) => (
                      <div key={c._id} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className={cn('w-full max-w-6 rounded-t-md', c.painScore >= 7 ? 'bg-pt-rose-fg/70' : c.painScore >= 4 ? 'bg-pt-ink/25' : 'bg-pt-accent/70')}
                          style={{ height: `${Math.max(8, c.painScore * 10)}%` }}
                        />
                        <span className="text-[10px] text-pt-faint">{format(c.createdAt, 'd/M')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-start gap-3">
                <IconChip icon={HeartPulse} tone="rose" size="sm" />
                <p className="text-sm text-pt-muted">No check-ins yet. A quick check-in tells their physio how {first} is doing between visits.</p>
              </div>
            )}
          </div>
          <div className="space-y-2 rounded-2xl bg-pt-sunken p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-pt-ink">
              <Dumbbell className="h-4 w-4 text-pt-muted" />
              Home exercises, last 7 days
            </p>
            {data.programme && data.programme.rate !== null ? (
              <>
                <p className="text-3xl font-semibold tabular-nums tracking-tight text-pt-ink">{data.programme.rate}%</p>
                <div className="h-2 overflow-hidden rounded-full bg-pt-surface">
                  <div className={cn('h-full rounded-full', data.programme.rate < 40 ? 'bg-pt-rose-fg' : 'bg-pt-accent')} style={{ width: `${data.programme.rate}%` }} />
                </div>
                <p className="text-xs text-pt-muted">
                  {data.programme.done} of {data.programme.expected} exercise sessions
                  {data.programme.lastLoggedAt ? ` · last ${formatDistanceToNow(data.programme.lastLoggedAt, { addSuffix: true })}` : ''}
                </p>
              </>
            ) : (
              <p className="text-sm text-pt-muted">No home programme yet. Their physio sends one after a visit.</p>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Care plan, summarised for the family */}
        <Panel title="Care plan" info="What their physio is working towards. The private clinical notes stay between them and their physio.">
          {data.plan ? (
            <div className="space-y-4">
              <div>
                <p className="text-[15px] font-semibold text-pt-ink">{data.plan.title}</p>
                <p className="text-xs text-pt-muted">
                  {[data.plan.sessionFrequency, data.plan.reviewDate ? `review ${format(data.plan.reviewDate, 'd MMM')}` : null].filter(Boolean).join(' · ') || `Updated ${formatDistanceToNow(data.plan.updatedAt, { addSuffix: true })}`}
                </p>
              </div>
              {data.plan.goals.length > 0 && (
                <ul className="space-y-2">
                  {data.plan.goals.map((goal, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      {goal.achieved ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pt-green-fg" />
                      ) : (
                        <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-pt-line-strong" aria-hidden />
                      )}
                      <span className={cn(goal.achieved ? 'text-pt-faint line-through' : 'text-pt-ink')}>{goal.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.plan.goals.length > 0 && (
                <p className="text-xs text-pt-muted">
                  {goalsMet} of {data.plan.goals.length} goals met
                </p>
              )}
              {data.plan.precautions && (
                <div className="flex gap-2.5 rounded-2xl bg-pt-rose-bg p-3 text-sm text-pt-rose-fg">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{data.plan.precautions}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <IconChip icon={ClipboardList} tone="neutral" size="sm" />
              <p className="text-sm text-pt-muted">No care plan yet. Their physio writes one after the first visit.</p>
            </div>
          )}
        </Panel>

        {/* Money: only for people allowed to pay */}
        {access.canPay ? (
          <Panel title="Payments" description={owed > 0 ? `${formatNaira(owed / 100)} to pay` : 'Nothing to pay'} bodyClassName="px-2 pb-3 sm:px-3">
            {data.invoices.length === 0 ? (
              <div className="flex items-center gap-3 px-3 pb-2 pt-1">
                <IconChip icon={CheckCircle2} tone="green" size="sm" />
                <p className="text-sm text-pt-muted">All paid. New payment requests show here.</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {data.invoices.map((invoice) => (
                  <li key={invoice._id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                    <IconChip icon={CreditCard} tone={invoice.overdue ? 'rose' : 'neutral'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold tabular-nums text-pt-ink">{formatNaira(invoice.amountKobo / 100)}</p>
                      <p className="truncate text-xs text-pt-muted">
                        {invoice.service} · {invoice.payee}
                        {invoice.overdue ? ' · overdue' : ` · due ${format(invoice.dueDate, 'd MMM')}`}
                      </p>
                    </div>
                    {invoice.payLink ? (
                      <Button asChild size="sm" className={cn(accentButtonClass, 'h-9')}>
                        <a href={invoice.payLink} target="_blank" rel="noopener noreferrer">
                          Pay
                        </a>
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-pt-muted">
                        Link on its way
                        <InfoTip>{invoice.payee} sends a secure pay link. Ask them if it hasn&apos;t arrived.</InfoTip>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : (
          <Panel title="Recent visits" bodyClassName="px-2 pb-3 sm:px-3">
            {data.recent.length === 0 ? (
              <p className="px-3 pb-2 pt-1 text-sm text-pt-muted">No visits yet.</p>
            ) : (
              <ul>
                {data.recent.map((visit) => (
                  <VisitRow key={visit._id} visit={visit} />
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {/* What this view is, and the circle itself for a caregiver who manages the profile */}
      <div className="flex flex-col gap-3 rounded-2xl bg-pt-sunken px-4 py-3 text-sm text-pt-muted sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1">
          {access.managed
            ? `You manage ${first}'s profile. Invite brothers, sisters or a carer to help.`
            : `You see ${first}'s care, never their private clinical notes. ${first} or their clinic can change your access.`}
        </p>
        {access.managed && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!person.hasOwnLogin && (
              <Button className={cn(secondaryButtonClass, 'h-9')} onClick={() => setDrawer('login')}>
                Give {first} their own login
              </Button>
            )}
            <Button className={cn(secondaryButtonClass, 'h-9')} onClick={() => setDrawer('circle')}>
              <Users className="mr-1.5 h-4 w-4" />
              {first}&apos;s care circle
            </Button>
          </div>
        )}
      </div>

      <OwnLoginDrawer open={drawer === 'login'} onOpenChange={(open) => setDrawer(open ? 'login' : null)} patientId={person._id} firstName={first} />
      <CheckInForDrawer open={drawer === 'checkin'} onOpenChange={(open) => setDrawer(open ? 'checkin' : null)} patientId={person._id} firstName={first} />
      <RequestVisitDrawer
        open={drawer === 'visit'}
        onOpenChange={(open) => setDrawer(open ? 'visit' : null)}
        patientId={person._id}
        firstName={first}
        relationship={access.relationship}
        city={person.city}
        goesTo={goesTo}
      />
      <PatientDrawer
        open={drawer === 'circle'}
        onOpenChange={(open) => setDrawer(open ? 'circle' : null)}
        title={`${first}'s care circle`}
        description="Everyone helping with their care"
        className="sm:max-w-xl"
      >
        <CareCircleManager patientId={person._id} audience="caregiver" />
      </PatientDrawer>
    </div>
  )
}
