'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Circle,
  CreditCard,
  Inbox,
  Mail,
  MessageSquare,
  Package,
  PhoneCall,
  Plus,
  UserPlus,
  Users,
  Video,
  Wrench,
  type IconComponent,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  EmptyState,
  IconChip,
  PageShell,
  Panel,
  StatTile,
  StatusBadge,
  formatNaira,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/clinic/ui'
import { cn } from '@/lib/utils'
import { useClinicAccess, type ClinicStaffKind } from '@/components/clinic/ClinicAccessContext'
import { PlanStatusCard } from '@/components/clinic/PlanStatusCard'
import { makeFunctionReference } from 'convex/server'
import { APPOINTMENT_STATUS_LABELS, appointmentStatusTone } from '@/convex/helpers/appointmentStatus'

const inventoryAlertsRef = makeFunctionReference<'query', Record<string, never>, { lowStock: number; maintenanceDue: number } | null>(
  'clinicInventory:getInventoryAlerts'
)
const teamUnreadRef = makeFunctionReference<'query', Record<string, never>, number>('clinicTeamChat:getTeamUnreadCount')

type NavCounts = { newReferrals: number; bookingRequests?: number; needsClinician?: number; invitesPending?: number }

// Shared labels, so the clinic, physio and patient views say the same thing
const appointmentStatus: Record<string, { label: string; tone: 'teal' | 'green' | 'amber' | 'red' | 'neutral' }> =
  Object.fromEntries(
    Object.entries(APPOINTMENT_STATUS_LABELS).map(([status, label]) => [
      status,
      { label, tone: appointmentStatusTone(status) },
    ])
  )

const CLINIC = '/dashboard/clinic'
/** Referred patients and the referral inbox live under Patients. */
const REFERRALS_HREF = `${CLINIC}/patients?filter=referred`
const patientRecordHref = (patientId: string) => `${CLINIC}/patients/${encodeURIComponent(patientId)}`

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

/** Who you are at this clinic: "Owner · Mary Physiotherapy", "Front desk · Mary Physiotherapy". */
function affiliation(kind: ClinicStaffKind | null, roleName: string | null, clinicName: string) {
  if (!kind) return clinicName
  if (kind === 'owner') return `Owner · ${clinicName}`
  if (kind === 'clinician') return `${roleName ?? 'Clinician'} at ${clinicName}`
  return `${roleName ?? 'Front desk'} · ${clinicName}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function HomeSkeleton({ title }: { title: string }) {
  return (
    <PageShell title={title}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-3xl bg-pt-sunken" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-3xl bg-pt-sunken lg:col-span-2" />
        <Skeleton className="h-80 rounded-3xl bg-pt-sunken" />
      </div>
    </PageShell>
  )
}

type AttentionItem = { key: string; href: string; icon: IconComponent; label: string; urgent?: boolean }

/**
 * The clinic's Home, for the owner and front desk (clinicians work from their own workspace in the
 * physio portal). What waits on the clinic comes first, then today, the plan and recent activity.
 */
export default function ClinicDashboardClient() {
  const dashboard = useQuery(api.clinicTools.getClinicConsolidatedDashboard)
  const followUps = useQuery(api.clinicTools.getClinicFollowUpQueue, {})
  const inventory = useQuery(inventoryAlertsRef, {})
  const { isOwner, canUse, firstName, staffKind, roleName, isReadOnly } = useClinicAccess()
  const counts = useQuery(api.clinicTools.getClinicNavCounts, {}) as NavCounts | undefined
  const unreadMessages = useQuery(api.chat.getUnreadCount, isReadOnly ? 'skip' : {}) as number | undefined
  const teamUnread = useQuery(teamUnreadRef, isReadOnly ? 'skip' : {})
  const title = personalGreeting(firstName)

  // Null only for someone outside a clinic, whom the portal is already sending elsewhere
  if (!dashboard) return <HomeSkeleton title={title} />

  const requests = counts?.bookingRequests ?? 0
  const needsClinician = counts?.needsClinician ?? 0
  const invitesPending = counts?.invitesPending ?? 0
  const checkInsDue = followUps?.length ?? 0
  const referrals = dashboard.newReferralsCount
  const waitingOnYou = (canUse('appointments') ? requests : 0) + (canUse('patients') ? needsClinician : 0) + (canUse('referrals') ? referrals : 0)

  // Most urgent first: patients waiting for an answer, then care gaps, then money and stock
  const attentionItems = [
    canUse('appointments') && requests > 0 && {
      key: 'requests',
      href: `${CLINIC}/appointments?requests=1`,
      icon: CalendarPlus,
      label: `${plural(requests, 'patient')} asked for an appointment`,
      urgent: true,
    },
    canUse('patients') && needsClinician > 0 && {
      key: 'clinician',
      href: `${CLINIC}/patients?filter=needs-clinician`,
      icon: UserPlus,
      label: `${plural(needsClinician, 'patient')} ${needsClinician === 1 ? 'needs' : 'need'} a clinician`,
      urgent: true,
    },
    canUse('referrals') && referrals > 0 && {
      key: 'referrals',
      href: REFERRALS_HREF,
      icon: Inbox,
      label: `${plural(referrals, 'referral')} from Rehabify waiting for you`,
      urgent: true,
    },
    canUse('patients') && (unreadMessages ?? 0) > 0 && {
      key: 'messages',
      href: `${CLINIC}/messages`,
      icon: MessageSquare,
      label: `${plural(unreadMessages ?? 0, 'unread message')} from patients`,
    },
    (teamUnread ?? 0) > 0 && {
      key: 'team',
      href: `${CLINIC}/messages?team=team`,
      icon: Users,
      label: `${plural(teamUnread ?? 0, 'team conversation')} with new messages`,
    },
    canUse('billing') && dashboard.unpaidCount > 0 && {
      key: 'unpaid',
      href: `${CLINIC}/billing`,
      icon: CreditCard,
      label: `${plural(dashboard.unpaidCount, 'unpaid invoice')} · ${formatNaira(dashboard.unpaidNaira)}`,
    },
    canUse('patients') && checkInsDue > 0 && {
      key: 'checkins',
      href: `${CLINIC}/patients`,
      icon: PhoneCall,
      label: `${plural(checkInsDue, 'patient')} due for a check-in`,
    },
    canUse('patients') && invitesPending > 0 && {
      key: 'invites',
      href: `${CLINIC}/patients?filter=invited`,
      icon: Mail,
      label: `${plural(invitesPending, 'patient')} ${invitesPending === 1 ? "hasn't" : "haven't"} opened their invite`,
    },
    (inventory?.lowStock ?? 0) > 0 && {
      key: 'stock',
      href: `${CLINIC}/inventory`,
      icon: Package,
      label: `${inventory!.lowStock} suppl${inventory!.lowStock === 1 ? 'y' : 'ies'} running low`,
    },
    (inventory?.maintenanceDue ?? 0) > 0 && {
      key: 'maintenance',
      href: `${CLINIC}/inventory?tab=equipment`,
      icon: Wrench,
      label: `${plural(inventory!.maintenanceDue, 'equipment service')} due`,
    },
  ].filter(Boolean) as AttentionItem[]

  return (
    <PageShell
      title={title}
      description={`${affiliation(staffKind, roleName, dashboard.clinicName)} · ${format(new Date(), 'EEEE d MMMM')}`}
      actions={
        <>
          {canUse('patients') && (
            <Button asChild className={secondaryButtonClass}>
              <Link href={`${CLINIC}/patients?add=1`}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add patient
              </Link>
            </Button>
          )}
          {/* The top bar carries Book on larger screens */}
          {canUse('appointments') && (
            <Button asChild className={cn(primaryButtonClass, 'sm:hidden')}>
              <Link href={`${CLINIC}/appointments?book=1`}>
                <CalendarPlus className="mr-1.5 h-4 w-4" />
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
            href={`${CLINIC}/appointments`}
            icon={Calendar}
            tone="blue"
          />
        )}
        {canUse('patients') && (
          <StatTile
            label="Patients in care"
            value={dashboard.patientsInCare}
            hint={`${dashboard.activeProgrammesCount} on a home programme`}
            href={`${CLINIC}/patients`}
            icon={Users}
            tone="green"
            info="Patients with active care at your clinic. Discharged patients stay in Patients under Discharged."
          />
        )}
        <StatTile
          label="Waiting on you"
          value={waitingOnYou}
          hint={waitingOnYou > 0 ? 'Requests, referrals, patients without a clinician' : 'Nothing waiting'}
          href={attentionItems.find((item) => item.urgent)?.href}
          icon={Inbox}
          tone={waitingOnYou > 0 ? 'attention' : 'default'}
          info="Appointment requests from patients, referrals from Rehabify, and patients who need a clinician assigned."
        />
        {canUse('billing') && (
          <StatTile
            label="Unpaid"
            value={formatNaira(dashboard.unpaidNaira)}
            hint={plural(dashboard.unpaidCount, 'invoice')}
            href={`${CLINIC}/billing`}
            icon={CreditCard}
            tone="violet"
            info="Payment requests your patients haven't paid yet. Paid money goes straight to your bank account."
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div data-tour="clinic-attention">
            <Panel
              title="Needs attention"
              info="Everything waiting on the clinic, most urgent first. It clears itself as you deal with each one."
            >
              {attentionItems.length === 0 ? (
                <div className="flex items-center gap-3 px-5 pb-5 sm:px-6">
                  <IconChip icon={CheckCircle2} tone="green" />
                  <div>
                    <p className="text-sm font-semibold text-pt-ink">You&apos;re all caught up</p>
                    <p className="text-sm text-pt-muted">New requests, messages and payments will show here.</p>
                  </div>
                </div>
              ) : (
                <ul className="px-2 pb-2 sm:px-3">
                  {attentionItems.map((item) => (
                    <li key={item.key}>
                      <Link href={item.href} className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-pt-ink transition-colors hover:bg-pt-hover">
                        <IconChip icon={item.icon} tone={item.urgent ? 'ink' : 'neutral'} className="h-9 w-9" />
                        <span className={cn('min-w-0 flex-1', item.urgent && 'font-semibold')}>{item.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-pt-faint transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div data-tour="clinic-today">
            <Panel
              title="Today's schedule"
              actions={
                <Link href={`${CLINIC}/appointments`} className="flex items-center gap-0.5 text-sm font-medium text-pt-muted hover:text-pt-ink">
                  All appointments
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              {dashboard.today.length === 0 ? (
                <EmptyState
                  icon={<Calendar />}
                  title="Nothing booked today"
                  description="Visits booked for today will show here, with the clinician seeing each patient."
                  action={
                    canUse('appointments') ? (
                      <Button asChild className={secondaryButtonClass}>
                        <Link href={`${CLINIC}/appointments?book=1`}>Book appointment</Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="px-2 pb-2 sm:px-3">
                  {dashboard.today.map((apt: any) => {
                    const status = appointmentStatus[apt.status] ?? { label: apt.status, tone: 'neutral' as const }
                    const isPast = apt.endTime < Date.now()
                    const row = (
                      <>
                        <div className={cn('w-14 shrink-0 text-sm font-semibold tabular-nums', isPast ? 'text-pt-faint' : 'text-pt-ink')}>
                          {format(new Date(apt.startTime), 'HH:mm')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-pt-ink">{apt.patientName}</p>
                          <p className="flex items-center gap-1 truncate text-xs text-pt-muted">
                            {apt.appointmentType === 'telehealth' && <Video className="h-3 w-3 shrink-0" />}
                            {apt.appointmentType === 'telehealth' ? 'Video' : 'In clinic'} · {apt.clinicianName}
                          </p>
                        </div>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </>
                    )
                    return (
                      <li key={apt._id}>
                        {canUse('patients') && apt.patientId ? (
                          <Link href={patientRecordHref(apt.patientId)} className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-pt-hover">
                            {row}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-4 px-3 py-2.5">{row}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="space-y-6">
          {canUse('billing') && (
            <div data-tour="clinic-plan">
              <PlanStatusCard />
            </div>
          )}

          <Panel title="Recent activity">
            {dashboard.recentActivity.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-pt-muted sm:px-6">Visits, notes and payments will show here.</p>
            ) : (
              <ul className="space-y-0.5 px-5 pb-4 sm:px-6">
                {dashboard.recentActivity.map((item: any) => (
                  <li key={item.id} className="relative border-l border-pt-line py-2 pl-4">
                    <span className="absolute -left-[4.5px] top-3.5 h-2 w-2 rounded-full bg-pt-line-strong" aria-hidden />
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm text-pt-ink">{item.title}</p>
                      <span className="shrink-0 text-xs text-pt-faint">{formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</span>
                    </div>
                    <p className="truncate text-xs text-pt-muted">{item.description}</p>
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

/** Shown until the clinic has done the four things that make the dashboard useful. */
function SetupChecklist() {
  // One query for every step, so each tick appears as soon as the change is saved
  const progress = useQuery(api.clinicTools.getClinicSetupProgress, {})

  if (!progress) return null

  const steps = [
    { done: progress.prices, label: 'Add your services and prices', href: `${CLINIC}/settings#prices` },
    { done: progress.payout, label: 'Connect a bank account for payments', href: `${CLINIC}/settings#payouts` },
    { done: progress.team, label: 'Invite a clinician to treat your patients', href: `${CLINIC}/staff` },
    { done: progress.patient, label: 'Add your first patient', href: `${CLINIC}/patients?add=1` },
  ]
  const remaining = steps.filter((step) => !step.done).length
  if (remaining === 0) return null
  const done = steps.length - remaining

  return (
    <div data-tour="clinic-setup">
      <Panel title="Get your clinic ready" description={`${done} of ${steps.length} done`}>
        <div className="mx-5 mb-2 h-1.5 overflow-hidden rounded-full bg-pt-sunken sm:mx-6">
          <div className="h-full rounded-full bg-pt-accent transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <ul className="px-2 pb-2 sm:px-3">
          {steps.map((step) => (
            <li key={step.label}>
              <Link href={step.href} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors hover:bg-pt-hover">
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-pt-green-fg" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-pt-faint" />
                )}
                <span className={cn('min-w-0 flex-1', step.done ? 'text-pt-faint line-through' : 'font-medium text-pt-ink')}>{step.label}</span>
                {!step.done && <ChevronRight className="h-4 w-4 shrink-0 text-pt-faint" />}
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
