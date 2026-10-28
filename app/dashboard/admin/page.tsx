'use client'

import { useMemo, type ComponentType } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  Flag,
  Handshake,
  Inbox,
  Landmark,
  Minus,
  Stethoscope,
  UserCheck,
  UserRound,
  Users,
} from '@/components/icons'
import { makeFunctionReference } from 'convex/server'
import type { getAdminDashboardStats, getSystemHealth, getUserActivityLogs, getUserRoleCounts } from '@/convex/admin'
import type { getMyUser } from '@/convex/users'
import type { QueryResult } from '@/lib/convexUntyped'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminPage,
  EmptyState,
  IconChip,
  PageHeader,
  Panel,
  QuickLink,
  StatTile,
  Stagger,
  StaggerItem,
  StatusBadge,
  listRowClass,
  softButtonClass,
} from '@/components/admin/ui'
import { visibleAdminNav, type AdminBadgeKey } from '@/components/admin/shell/adminNav'
import { activityMeta, formatCount, roleLabel } from '@/components/admin/activityMeta'
import AdminLiveMap from '@/components/dashboard/admin/AdminLiveMap'
import { cn } from '@/lib/utils'

// By name: the generated api object is at TypeScript's depth limit ("excessively deep") here
const homeQueries = {
  me: makeFunctionReference<'query', Record<string, never>, QueryResult<typeof getMyUser>>('users:getMyUser'),
  roles: makeFunctionReference<'query', Record<string, never>, QueryResult<typeof getUserRoleCounts>>('admin:getUserRoleCounts'),
  stats: makeFunctionReference<'query', { todayStart: number }, QueryResult<typeof getAdminDashboardStats>>('admin:getAdminDashboardStats'),
  badges: makeFunctionReference<'query', Record<string, never>, unknown>('adminConsole:getNavBadges'),
  health: makeFunctionReference<'query', Record<string, never>, QueryResult<typeof getSystemHealth>>('admin:getSystemHealth'),
  activity: makeFunctionReference<'query', { limit?: number }, QueryResult<typeof getUserActivityLogs>>('admin:getUserActivityLogs'),
}

type Badges = { approvals: number; openReports: number; bankTransfers: number; partnerApplications: number; accessApplications: number; agreements: number; refunds: number; inquiries?: number; cap: number }

function greeting(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function badgeCount(n: number | undefined, cap: number | undefined) {
  if (n === undefined) return undefined
  return cap !== undefined && n >= cap ? `${cap}+` : n.toLocaleString()
}

const loadingValue = <Skeleton className="mt-1 h-7 w-16 rounded-lg" />

export default function AdminHomePage() {
  const me = useQuery(homeQueries.me)
  // Local midnight, so "today" matches the admin's clock. Stable for the life of the page.
  const todayStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }, [])

  const roles = useQuery(homeQueries.roles)
  const stats = useQuery(homeQueries.stats, { todayStart })
  const badges = useQuery(homeQueries.badges) as Badges | undefined
  const health = useQuery(homeQueries.health)
  const activity = useQuery(homeQueries.activity, { limit: 6 })

  const now = new Date()
  const firstName = me?.firstName?.trim()

  return (
    <AdminPage>
      <PageHeader
        eyebrow={format(now, 'EEEE d MMMM')}
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ''}`}
        description="What needs you today, and how the platform is doing."
        actions={
          <Link href="/dashboard/admin/analytics" className={cn(softButtonClass, 'inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium')}>
            Analytics <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="Total users"
            value={roles ? formatCount(roles.total) : loadingValue}
            hint={stats ? `${stats.today.signups.today} joined today` : undefined}
            href="/dashboard/admin/users"
            icon={Users}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Physiotherapists"
            value={roles ? formatCount(roles.byRole.physiotherapist) : loadingValue}
            hint={stats ? `${formatCount(stats.registryListed)} on the public registry` : undefined}
            href="/dashboard/admin/users?role=physiotherapist"
            icon={Stethoscope}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Patients"
            value={roles ? formatCount(roles.byRole.patient) : loadingValue}
            href="/dashboard/admin/users?role=patient"
            icon={UserRound}
            tone="mint"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Clinics"
            value={stats ? formatCount(stats.clinics) : loadingValue}
            hint={roles ? `${formatCount(roles.byRole.clinic_owner)} clinic owners` : undefined}
            href="/dashboard/admin/clinics"
            icon={Building2}
            tone="mint"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Pending approvals"
            value={badges ? badgeCount(badges.approvals, badges.cap) : loadingValue}
            hint="Physio & clinic accounts"
            href="/dashboard/admin/approvals"
            icon={UserCheck}
            tone={badges?.approvals ? 'attention' : 'teal'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Open reports"
            value={badges ? badgeCount(badges.openReports, badges.cap) : loadingValue}
            hint="Marketplace complaints"
            href="/dashboard/admin/marketplace-reports"
            icon={Flag}
            tone={badges?.openReports ? 'attention' : 'rose'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Bank transfers"
            value={badges ? badgeCount(badges.bankTransfers, badges.cap) : loadingValue}
            hint="Awaiting confirmation"
            href="/dashboard/admin/bank-transfers"
            icon={Landmark}
            tone={badges?.bankTransfers ? 'attention' : 'peach'}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Partner applications"
            value={badges ? badgeCount(badges.partnerApplications, badges.cap) : loadingValue}
            hint="Waiting for review"
            href="/dashboard/admin/partnerships"
            icon={Handshake}
            tone={badges?.partnerApplications ? 'attention' : 'teal'}
          />
        </StaggerItem>
      </Stagger>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <NeedsAttention badges={badges} unassignedReferrals={stats?.unassignedReferrals} className="lg:col-span-2" />
        <TodayPanel today={stats?.today} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PlatformStatus health={health} />
        <RecentActivity items={activity?.items} className="lg:col-span-2" />
      </div>

      <AdminLiveMap />

      <QuickLinks badges={badges} />
    </AdminPage>
  )
}

// ---------------------------------------------------------------------------

function NeedsAttention({
  badges,
  unassignedReferrals,
  className,
}: {
  badges: Badges | undefined
  unassignedReferrals: { count: number; capped: boolean } | undefined
  className?: string
}) {
  const loading = !badges || !unassignedReferrals
  const items: { key: string; title: string; description: string; count: string; n: number; href: string; icon: ComponentType<{ className?: string }> }[] =
    loading
      ? []
      : [
          {
            key: 'approvals',
            title: 'Account approvals',
            description: 'Physiotherapists and clinics waiting to be verified',
            n: badges.approvals,
            count: badgeCount(badges.approvals, badges.cap) ?? '0',
            href: '/dashboard/admin/approvals',
            icon: UserCheck,
          },
          {
            key: 'partners',
            title: 'Partner applications',
            description: 'New partners waiting for go-live review',
            n: badges.partnerApplications,
            count: badgeCount(badges.partnerApplications, badges.cap) ?? '0',
            href: '/dashboard/admin/partnerships',
            icon: Handshake,
          },
          {
            key: 'reports',
            title: 'Marketplace reports',
            description: 'Complaints that are pending or under review',
            n: badges.openReports,
            count: badgeCount(badges.openReports, badges.cap) ?? '0',
            href: '/dashboard/admin/marketplace-reports',
            icon: Flag,
          },
          {
            key: 'transfers',
            title: 'Bank transfers',
            description: 'Manual payments to confirm before a booking is scheduled',
            n: badges.bankTransfers,
            count: badgeCount(badges.bankTransfers, badges.cap) ?? '0',
            href: '/dashboard/admin/bank-transfers',
            icon: Landmark,
          },
          {
            key: 'referrals',
            title: 'Unassigned referrals',
            description: 'New inbound referrals with no clinic or physio yet',
            n: unassignedReferrals.count,
            count: formatCount(unassignedReferrals),
            href: '/dashboard/admin/referrals',
            icon: Inbox,
          },
        ]
  const open = items.filter((i) => i.n > 0)

  return (
    <Panel
      title="Needs attention"
      description={loading ? 'Checking queues…' : open.length ? `${open.length} queue${open.length === 1 ? '' : 's'} waiting on you` : 'Every queue is clear'}
      className={className}
      bodyClassName="pb-2 pt-1"
    >
      {loading ? (
        <div className="space-y-2 px-5 py-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <EmptyState icon={<CheckCircle2 />} title="All caught up" description="No approvals, reports, transfers or referrals are waiting." />
      ) : (
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {open.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className={cn(listRowClass, 'group')}>
                <IconChip icon={item.icon} tone="peach" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-rh-ink dark:text-white">{item.title}</span>
                  <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{item.description}</span>
                </span>
                <span className="rounded-full bg-rh-amber px-2.5 py-0.5 text-xs font-semibold tabular-nums text-rh-ink">{item.count}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-rh-ink dark:text-neutral-600 dark:group-hover:text-rh-lime" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

type DayCompare = { today: number; yesterday: number; capped: boolean }

function Trend({ today, yesterday }: { today: number; yesterday: number }) {
  if (today === yesterday) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-neutral-400">
        <Minus className="h-3 w-3" /> Same
      </span>
    )
  }
  if (yesterday === 0) {
    return <StatusBadge tone="green">New today</StatusBadge>
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  const up = pct > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        up ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'
      )}
    >
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(pct)}%
    </span>
  )
}

function TodayPanel({
  today,
}: {
  today: { sessions: DayCompare; completedSessions: DayCompare; signups: DayCompare; bookings: DayCompare } | undefined
}) {
  const rows: { label: string; value?: DayCompare }[] = [
    { label: 'Sessions scheduled', value: today?.sessions },
    { label: 'Sessions completed', value: today?.completedSessions },
    { label: 'New sign-ups', value: today?.signups },
    { label: 'Marketplace bookings made', value: today?.bookings },
  ]
  return (
    <Panel title="Today" description="Compared with yesterday" bodyClassName="px-5 pb-4 pt-2">
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm text-neutral-600 dark:text-neutral-300">{row.label}</span>
            {row.value ? (
              <>
                <span className="text-lg font-semibold tabular-nums text-rh-ink dark:text-white">
                  {row.value.today.toLocaleString()}
                  {row.value.capped ? '+' : ''}
                </span>
                <span className="w-20 text-right">
                  <Trend today={row.value.today} yesterday={row.value.yesterday} />
                </span>
              </>
            ) : (
              <Skeleton className="h-6 w-24 rounded-lg" />
            )}
          </li>
        ))}
      </ul>
      {today && (
        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
          Yesterday: {today.sessions.yesterday} sessions, {today.signups.yesterday} sign-ups, {today.bookings.yesterday} bookings.
        </p>
      )}
    </Panel>
  )
}

type HealthCheck = {
  key: string
  label: string
  status: 'ok' | 'warning' | 'error' | 'idle'
  value: string
  detail: string
  at?: number
  href?: string
}

const STATUS_STYLE: Record<HealthCheck['status'], { dot: string; label: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
  ok: { dot: 'bg-emerald-500', label: 'OK', tone: 'green' },
  warning: { dot: 'bg-amber-500', label: 'Needs a look', tone: 'amber' },
  error: { dot: 'bg-rose-500', label: 'Problem', tone: 'red' },
  idle: { dot: 'bg-neutral-300 dark:bg-neutral-600', label: 'No data', tone: 'neutral' },
}

function PlatformStatus({ health }: { health: { status: HealthCheck['status']; checks: HealthCheck[] } | undefined }) {
  return (
    <Panel
      title="Platform status"
      description="Background deliveries and errors the app records"
      actions={health ? <StatusBadge tone={STATUS_STYLE[health.status].tone}>{health.status === 'ok' ? 'All good' : STATUS_STYLE[health.status].label}</StatusBadge> : undefined}
      bodyClassName="pb-2 pt-1"
    >
      {!health ? (
        <div className="space-y-2 px-5 py-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {health.checks.map((check) => {
            const style = STATUS_STYLE[check.status]
            const body = (
              <>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 self-start rounded-full', style.dot)} aria-label={style.label} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-rh-ink dark:text-white">{check.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{check.value}</span>
                  </span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {check.detail}
                    {check.at ? ` · ${formatDistanceToNow(check.at, { addSuffix: true })}` : ''}
                  </span>
                </span>
              </>
            )
            return (
              <li key={check.key}>
                {check.href ? (
                  <Link href={check.href} className={cn(listRowClass, 'items-start py-2.5')}>
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-2.5">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

type ActivityItem = {
  _id: string
  category: string
  activity: string
  summary: string
  userName: string
  userRole: string
  timestamp: number
}

function RecentActivity({ items, className }: { items: ActivityItem[] | undefined; className?: string }) {
  return (
    <Panel
      title="Recent activity"
      description="Latest events across the platform"
      className={className}
      actions={
        <Link href="/dashboard/admin/activity" className="text-xs font-medium text-rh-ink hover:underline dark:text-rh-lime">
          View all
        </Link>
      }
      bodyClassName="pb-2 pt-1"
    >
      {!items ? (
        <div className="space-y-2 px-5 py-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Clock />} title="No activity yet" description="Events appear here as people use the platform." />
      ) : (
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {items.map((item) => {
            const meta = activityMeta(item.category)
            return (
              <li key={item._id} className="flex items-center gap-3 px-5 py-3">
                <IconChip icon={meta.icon} tone={meta.tone} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-rh-ink dark:text-white">{item.activity}</span>
                  <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {item.userName}
                    {item.userRole !== 'system' ? ` · ${roleLabel(item.userRole)}` : ''}
                    {item.summary ? ` · ${item.summary}` : ''}
                  </span>
                </span>
                <time className="shrink-0 text-xs text-neutral-400" dateTime={new Date(item.timestamp).toISOString()}>
                  {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function QuickLinks({ badges }: { badges: Badges | undefined }) {
  const sections = visibleAdminNav().filter((s) => s.id !== 'overview')
  const countFor = (key?: AdminBadgeKey) => (key && badges ? badges[key] ?? 0 : 0)
  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold tracking-tight text-rh-ink dark:text-white">Jump to</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <QuickLink
            key={section.id}
            href={section.items[0].href}
            icon={section.icon}
            title={section.label}
            description={section.items.map((i) => i.title).join(' · ')}
            count={section.items.reduce((sum, i) => sum + countFor(i.badgeKey), 0)}
          />
        ))}
      </div>
    </section>
  )
}
