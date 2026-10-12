'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  CreditCard,
  Inbox,
  PhoneCall,
  Plus,
  Video,
} from 'lucide-react'
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
import { useClinicAccess } from '@/components/clinic/ClinicPreviewContext'

const appointmentStatus: Record<string, { label: string; tone: 'teal' | 'green' | 'amber' | 'red' | 'neutral' }> = {
  scheduled: { label: 'Booked', tone: 'teal' },
  confirmed: { label: 'Confirmed', tone: 'teal' },
  completed: { label: 'Attended', tone: 'green' },
  no_show: { label: 'No-show', tone: 'amber' },
  cancelled_by_patient: { label: 'Cancelled', tone: 'neutral' },
  cancelled_by_therapist: { label: 'Cancelled', tone: 'neutral' },
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function ClinicDashboardClient() {
  const dashboard = useQuery(api.clinicTools.getClinicConsolidatedDashboard)
  const followUps = useQuery(api.clinicTools.getClinicFollowUpQueue, {})
  // Team members only see shortcuts to the pages their role includes
  const { isOwner, canUse } = useClinicAccess()

  if (dashboard === undefined) {
    return (
      <PageShell title={greeting()}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </PageShell>
    )
  }

  const checkInsDue = followUps?.length ?? 0
  const attentionItems = [
    canUse('referrals') && dashboard.newReferralsCount > 0 && {
      href: '/dashboard/clinic/referrals',
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
      title={`${greeting()}`}
      description={`${dashboard.isPreview ? 'Sample clinic' : dashboard.clinicName} · ${format(new Date(), 'EEEE d MMMM')}`}
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
      {!dashboard.isPreview && isOwner && <SetupChecklist />}

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
            href="/dashboard/clinic/referrals"
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
