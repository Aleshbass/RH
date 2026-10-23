'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { differenceInCalendarDays, format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns'
import {
  ArrowLeftRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  CreditCard,
  Inbox,
  PhoneCall,
  Plus,
  Users,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EmptyState,
  PageShell,
  Panel,
  StatTile,
  StatusBadge,
  formatNaira,
  primaryButtonClass,
} from '@/components/clinic/ui'
import { cn } from '@/lib/utils'
import { useClinicAccess, type ClinicStaffKind } from '@/components/clinic/ClinicAccessContext'
import { PHYSIO_PORTAL_HOME } from '@/components/clinic/clinician-routing'
import { APPOINTMENT_STATUS_LABELS, appointmentStatusTone } from '@/convex/helpers/appointmentStatus'

// Shared labels, so the clinic, physio and patient views say the same thing
const appointmentStatus: Record<string, { label: string; tone: 'teal' | 'green' | 'amber' | 'red' | 'neutral' }> =
  Object.fromEntries(
    Object.entries(APPOINTMENT_STATUS_LABELS).map(([status, label]) => [
      status,
      { label, tone: appointmentStatusTone(status) },
    ])
  )

/** Referred patients and the referral inbox live under Patients. */
const REFERRALS_HREF = '/dashboard/clinic/patients?filter=referred'
const patientRecordHref = (patientId: string) => `/dashboard/clinic/patients?patient=${encodeURIComponent(patientId)}`

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** "Good afternoon, Olamide" */
function personalGreeting(firstName: string | null) {
  return firstName ? `${greeting()}, ${firstName}` : greeting()
}

/** Who you are at this clinic: "Owner · Mary Physiotherapy", "Clinician at Mary Physiotherapy". */
function affiliation(kind: ClinicStaffKind | null, roleName: string | null, clinicName: string) {
  if (!kind) return clinicName
  if (kind === 'owner') return `Owner · ${clinicName}`
  if (kind === 'clinician') return `${roleName ?? 'Clinician'} at ${clinicName}`
  return `${roleName ?? 'Front desk'} · ${clinicName}`
}

const today = () => format(new Date(), 'EEEE d MMMM')

export default function ClinicDashboardClient() {
  // Clinicians get their own day; the owner and front desk run the clinic from the overview
  const { isClinician } = useClinicAccess()
  return isClinician ? <ClinicianHome /> : <ClinicOverview />
}

function HomeSkeleton({ title, tiles = 4 }: { title: string; tiles?: number }) {
  return (
    <PageShell title={title}>
      <div className={cn('grid grid-cols-2 gap-3', tiles === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </PageShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Owner and front desk: the whole clinic
// ─────────────────────────────────────────────────────────────────────────────

function ClinicOverview() {
  const dashboard = useQuery(api.clinicTools.getClinicConsolidatedDashboard)
  const followUps = useQuery(api.clinicTools.getClinicFollowUpQueue, {})
  // Team members only see shortcuts to the pages their role includes
  const { isOwner, canUse, firstName, staffKind, roleName } = useClinicAccess()
  const title = personalGreeting(firstName)

  // Null only for someone outside a clinic, whom the portal is already sending elsewhere
  if (!dashboard) return <HomeSkeleton title={title} />

  const checkInsDue = followUps?.length ?? 0
  const attentionItems = [
    canUse('referrals') && dashboard.newReferralsCount > 0 && {
      href: REFERRALS_HREF,
      icon: Inbox,
      label: `${dashboard.newReferralsCount} referral${dashboard.newReferralsCount === 1 ? '' : 's'} waiting for your response`,
    },
    canUse('billing') && dashboard.unpaidCount > 0 && {
      href: '/dashboard/clinic/billing',
      icon: CreditCard,
      label: `${dashboard.unpaidCount} unpaid invoice${dashboard.unpaidCount === 1 ? '' : 's'} · ${formatNaira(dashboard.unpaidNaira)}`,
    },
    canUse('patients') && checkInsDue > 0 && {
      href: '/dashboard/clinic/patients',
      icon: PhoneCall,
      label: `${checkInsDue} patient${checkInsDue === 1 ? '' : 's'} due for a check-in`,
    },
  ].filter(Boolean) as { href: string; icon: typeof Inbox; label: string }[]

  return (
    <PageShell
      title={title}
      description={`${affiliation(staffKind, roleName, dashboard.clinicName)} · ${today()}`}
      actions={
        <>
          {canUse('patients') && (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/clinic/patients">
                <Plus className="mr-1.5 h-4 w-4" />
                Add patient
              </Link>
            </Button>
          )}
          {canUse('appointments') && (
            <Button asChild size="sm" className={primaryButtonClass}>
              <Link href="/dashboard/clinic/appointments">
                <Calendar className="mr-1.5 h-4 w-4" />
                Book appointment
              </Link>
            </Button>
          )}
        </>
      }
    >
      {isOwner && <SetupChecklist />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {canUse('appointments') && (
          <StatTile
            label="Today"
            value={dashboard.todayCount}
            hint={`${dashboard.upcomingWeekCount} more this week`}
            href="/dashboard/clinic/appointments"
          />
        )}
        {canUse('patients') && (
          <StatTile
            label="Patients in care"
            value={dashboard.patientsInCare}
            hint={`${dashboard.activeProgrammesCount} on a home programme`}
            href="/dashboard/clinic/patients"
          />
        )}
        {canUse('referrals') && (
          <StatTile
            label="New referrals"
            value={dashboard.newReferralsCount}
            hint={dashboard.newReferralsCount > 0 ? 'Waiting for you' : 'None waiting'}
            href={REFERRALS_HREF}
            tone={dashboard.newReferralsCount > 0 ? 'attention' : 'default'}
          />
        )}
        {canUse('billing') && (
          <StatTile
            label="Unpaid"
            value={formatNaira(dashboard.unpaidNaira)}
            hint={`${dashboard.unpaidCount} invoice${dashboard.unpaidCount === 1 ? '' : 's'}`}
            href="/dashboard/clinic/billing"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Today's schedule"
          className="lg:col-span-2"
          actions={
            <Link
              href="/dashboard/clinic/appointments"
              className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            >
              All appointments
            </Link>
          }
        >
          {dashboard.today.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-8 w-8" />}
              title="Nothing booked today"
              description="Booked visits for today will show here."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/clinic/appointments">Book appointment</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {dashboard.today.map((apt: any) => {
                const status = appointmentStatus[apt.status] ?? { label: apt.status, tone: 'neutral' as const }
                const isPast = apt.endTime < Date.now()
                return (
                  <li key={apt._id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                    <div className={cn('w-14 shrink-0 text-sm tabular-nums', isPast ? 'text-neutral-400' : 'text-neutral-900 dark:text-white')}>
                      {format(new Date(apt.startTime), 'HH:mm')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{apt.patientName}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                        {apt.appointmentType === 'telehealth' && <Video className="h-3 w-3 shrink-0" />}
                        {apt.appointmentType === 'telehealth' ? 'Video' : 'In clinic'} · {apt.clinicianName}
                      </p>
                    </div>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Needs attention">
            {attentionItems.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-neutral-500 sm:px-5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {attentionItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/50 sm:px-5"
                    >
                      <item.icon className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity">
            {dashboard.recentActivity.length === 0 ? (
              <p className="px-4 py-4 text-sm text-neutral-500 sm:px-5">Visits, notes and payments will show here.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {dashboard.recentActivity.map((item: any) => (
                  <li key={item.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm text-neutral-900 dark:text-white">{item.title}</p>
                      <span className="shrink-0 text-xs text-neutral-400">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="truncate text-xs text-neutral-500">{item.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}

/**
 * Shown until the clinic has done the four things that make the dashboard useful.
 */
function SetupChecklist() {
  // One query for every step, so each tick appears as soon as the change is saved
  const progress = useQuery(api.clinicTools.getClinicSetupProgress, {})

  if (!progress) return null

  const steps = [
    { done: progress.prices, label: 'Add your services and prices', href: '/dashboard/clinic/settings#prices' },
    { done: progress.payout, label: 'Connect a bank account for payments', href: '/dashboard/clinic/settings#payouts' },
    { done: progress.patient, label: 'Add your first patient', href: '/dashboard/clinic/patients' },
    { done: progress.team, label: 'Invite a clinician (optional)', href: '/dashboard/clinic/staff' },
  ]
  const remaining = steps.filter((step) => !step.done).length
  if (remaining === 0) return null

  return (
    <Panel
      title="Get your clinic ready"
      description={`${steps.length - remaining} of ${steps.length} done`}
    >
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
            >
              {step.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-neutral-300 dark:text-neutral-600" />
              )}
              <span className={cn('min-w-0 flex-1', step.done ? 'text-neutral-400 line-through' : 'text-neutral-900 dark:text-white')}>
                {step.label}
              </span>
              {!step.done && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinicians: their own day at the clinic
// ─────────────────────────────────────────────────────────────────────────────

/** Shape returned by api.clinicTools.getMyClinicianHome (written out: the api type can resolve to any). */
type ClinicianHomeData = {
  clinicName: string
  seesSchedule: boolean
  seesPatients: boolean
  today: {
    _id: string
    patientId: string
    startTime: number
    endTime: number
    appointmentType: string
    status: string
    patientName: string
  }[]
  upcomingWeekCount: number
  patientsCount: number
  patients: {
    patientId: string
    name: string
    imageUrl: string | null
    lastVisitAt: number | null
    nextVisitAt: number | null
  }[]
  checkInsCount: number
  checkIns: {
    patientId: string
    patientName: string
    phone: string | null
    daysSinceLastVisit: number | null
    checkInDueAt: number | null
  }[]
}

function describeVisits(patient: ClinicianHomeData['patients'][number]) {
  if (patient.nextVisitAt) {
    const at = new Date(patient.nextVisitAt)
    const day = isToday(at) ? 'Today' : isTomorrow(at) ? 'Tomorrow' : format(at, 'EEE d MMM')
    return `Next visit ${day}, ${format(at, 'HH:mm')}`
  }
  if (patient.lastVisitAt) {
    return `Nothing booked · last seen ${formatDistanceToNow(new Date(patient.lastVisitAt), { addSuffix: true })}`
  }
  return 'No visit yet'
}

function describeCheckIn(item: ClinicianHomeData['checkIns'][number]) {
  if (typeof item.checkInDueAt === 'number') {
    const days = differenceInCalendarDays(new Date(), new Date(item.checkInDueAt))
    if (days <= 0) return 'Check-in due today'
    if (days === 1) return 'Check-in due yesterday'
    return `Check-in due ${days} days ago`
  }
  if (item.daysSinceLastVisit === null) return 'No visit yet'
  return `Not seen for ${item.daysSinceLastVisit} days, nothing booked`
}

function ClinicianHome() {
  const home = useQuery(api.clinicTools.getMyClinicianHome, {}) as ClinicianHomeData | null | undefined
  const { canUse, firstName, roleName, clinicName, hasOwnPhysioPortal, isSuspended } = useClinicAccess()
  const title = personalGreeting(firstName)
  const description = `${affiliation('clinician', roleName, clinicName ?? home?.clinicName ?? 'your clinic')} · ${today()}`

  const actions = (
    <>
      {hasOwnPhysioPortal && (
        <Button asChild variant="outline" size="sm">
          <Link href={PHYSIO_PORTAL_HOME}>
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            My Rehabify dashboard
          </Link>
        </Button>
      )}
      {canUse('appointments') && (
        <Button asChild size="sm" className={primaryButtonClass}>
          <Link href="/dashboard/clinic/appointments">
            <Calendar className="mr-1.5 h-4 w-4" />
            Book appointment
          </Link>
        </Button>
      )}
    </>
  )

  if (home === undefined) return <HomeSkeleton title={title} tiles={3} />

  if (home === null) {
    return (
      <PageShell title={title} description={description} actions={actions}>
        <Panel>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={isSuspended ? 'Your access is paused' : 'Nothing to show yet'}
            description={
              isSuspended
                ? 'The clinic owner has paused your access to this clinic. Contact them to restore it.'
                : 'Your schedule and patients at this clinic will show here.'
            }
          />
        </Panel>
      </PageShell>
    )
  }

  return (
    <PageShell title={title} description={description} actions={actions}>
      <div className={cn('grid grid-cols-2 gap-3', home.seesSchedule && home.seesPatients && 'lg:grid-cols-3')}>
        {home.seesSchedule && (
          <StatTile
            label="My visits today"
            value={home.today.length}
            hint={`${home.upcomingWeekCount} more this week`}
            href="/dashboard/clinic/appointments"
          />
        )}
        {home.seesPatients && (
          <StatTile label="My patients" value={home.patientsCount} hint="In your care" href="/dashboard/clinic/patients" />
        )}
        {home.seesPatients && (
          <StatTile
            label="Check-ins due"
            value={home.checkInsCount}
            hint={home.checkInsCount > 0 ? 'Patients to contact' : 'None due'}
            href="/dashboard/clinic/patients"
            tone={home.checkInsCount > 0 ? 'attention' : 'default'}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {home.seesSchedule && (
          <Panel
            title="My schedule today"
            className={home.seesPatients ? 'lg:col-span-2' : 'lg:col-span-3'}
            actions={
              <Link
                href="/dashboard/clinic/appointments"
                className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              >
                All appointments
              </Link>
            }
          >
            {home.today.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-8 w-8" />}
                title="Nothing booked for you today"
                description={
                  home.upcomingWeekCount > 0
                    ? `You have ${home.upcomingWeekCount} visit${home.upcomingWeekCount === 1 ? '' : 's'} later this week.`
                    : 'Visits booked with you will show here.'
                }
              />
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {home.today.map((apt) => {
                  const status = appointmentStatus[apt.status] ?? { label: apt.status, tone: 'neutral' as const }
                  const isPast = apt.endTime < Date.now()
                  return (
                    <li key={apt._id}>
                      <Link
                        href={home.seesPatients ? patientRecordHref(apt.patientId) : '/dashboard/clinic/appointments'}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
                      >
                        <div
                          className={cn(
                            'w-14 shrink-0 text-sm tabular-nums',
                            isPast ? 'text-neutral-400' : 'text-neutral-900 dark:text-white'
                          )}
                        >
                          {format(new Date(apt.startTime), 'HH:mm')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{apt.patientName}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {apt.appointmentType === 'telehealth' && <Video className="h-3 w-3 shrink-0" />}
                            {apt.appointmentType === 'telehealth' ? 'Video' : 'In clinic'} ·{' '}
                            {format(new Date(apt.startTime), 'HH:mm')}–{format(new Date(apt.endTime), 'HH:mm')}
                          </p>
                        </div>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        )}

        {home.seesPatients && (
          <div className={cn('space-y-6', !home.seesSchedule && 'lg:col-span-3')}>
            <Panel
              title="Check-ins due"
              description={home.checkInsCount > home.checkIns.length ? `Showing ${home.checkIns.length} of ${home.checkInsCount}` : undefined}
            >
              {home.checkIns.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400 sm:px-5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No check-ins due.
                </div>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {home.checkIns.map((item) => (
                    <li key={item.patientId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <Link href={patientRecordHref(item.patientId)} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900 hover:underline dark:text-white">
                          {item.patientName}
                        </p>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{describeCheckIn(item)}</p>
                      </Link>
                      {item.phone && (
                        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 px-2.5 text-xs">
                          <a href={`tel:${item.phone.replace(/\s/g, '')}`} aria-label={`Call ${item.patientName}`}>
                            <PhoneCall className="mr-1 h-3.5 w-3.5" />
                            Call
                          </a>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel
              title="My patients"
              actions={
                <Link
                  href="/dashboard/clinic/patients"
                  className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                >
                  All patients
                </Link>
              }
            >
              {home.patients.length === 0 ? (
                <p className="px-4 py-4 text-sm text-neutral-500 dark:text-neutral-400 sm:px-5">
                  Patients assigned to you will show here.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {home.patients.map((patient) => (
                    <li key={patient.patientId}>
                      <Link
                        href={patientRecordHref(patient.patientId)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{patient.name}</p>
                          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{describeVisits(patient)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </div>
    </PageShell>
  )
}
