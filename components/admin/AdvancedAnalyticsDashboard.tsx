'use client'

import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import { Download } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useClinicTheme } from '@/components/clinic/ClinicTheme'
import {
  AdminPage,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  Stagger,
  StaggerItem,
  downloadCsv,
  formatNaira,
  softButtonClass,
  tableWrapClass,
} from '@/components/admin/ui'
import { formatCount, roleLabel, type RoleCountsResult } from '@/components/admin/activityMeta'
import { cn } from '@/lib/utils'

// Shapes returned by the analytics queries in convex/admin.ts (amounts in kobo)
type MonthBase = { month: string; monthStart: number }
type GrowthResult = {
  months: number
  capped: boolean
  cap: number
  signupsByMonth: (MonthBase & { patient: number; physiotherapist: number; clinic: number; other: number; total: number })[]
  signupsByWeek: { weekStart: number; signups: number }[]
}
type AppointmentsResult = {
  months: number
  capped: boolean
  cap: number
  appointmentsByMonth: (MonthBase & { total: number; completed: number; cancelled: number; noShow: number; upcoming: number })[]
}
type RevenueResult = {
  months: number
  cap: number
  invoicesCapped: boolean
  bookingsCapped: boolean
  revenueByMonth: (MonthBase & { grossKobo: number; platformFeeKobo: number; paidInvoices: number })[]
  bookingsByMonth: (MonthBase & { created: number; paid: number; cancelled: number })[]
  /** Paid online in the window, per revenue line (each kept apart) */
  streams?: Record<'rehabify_care' | 'clinic_own' | 'clinic_referral' | 'independent' | 'clinic_subscription', number>
  /** Payments recorded by hand (cash, POS, transfer): not money through Rehabify */
  offlineKobo?: number
  topClinics?: { clinicId: string; name: string; clinicNumber: string | null; kobo: number }[]
}

const STREAM_LABELS: { key: keyof NonNullable<RevenueResult['streams']>; label: string; hint: string }[] = [
  { key: 'rehabify_care', label: 'Rehabify Care', hint: 'Patients who pay Rehabify' },
  { key: 'clinic_subscription', label: 'Clinic subscriptions', hint: 'Clinics paying for their plan' },
  { key: 'clinic_own', label: 'Clinics: own patients', hint: 'Paid straight to the clinics' },
  { key: 'clinic_referral', label: 'Clinics: referrals', hint: 'Rehabify patients sent to clinics' },
  { key: 'independent', label: 'Independent physios', hint: 'Their own patients, paid to them' },
]

/** Money by revenue line, so clinic, independent and Rehabify Care money are never mixed. */
function RevenueStreams({ revenue }: { revenue: RevenueResult | undefined }) {
  if (!revenue?.streams) return null
  const streams = revenue.streams
  return (
    <Panel title="Money by revenue line" description={`Paid online over the last ${revenue.months} months`} bodyClassName="space-y-4 px-5 pb-5 pt-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STREAM_LABELS.map((s) => (
          <div key={s.key} className="rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.03]">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{s.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-rh-ink dark:text-white">{nairaFromKobo(streams[s.key])}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">{s.hint}</p>
          </div>
        ))}
      </div>
      {(revenue.offlineKobo ?? 0) > 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Plus {nairaFromKobo(revenue.offlineKobo ?? 0)} recorded as paid outside Rehabify (cash, POS or transfer), not counted above.
        </p>
      )}
      {(revenue.topClinics?.length ?? 0) > 0 && (
        <div>
          <p className="pb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">By clinic</p>
          <ul className="divide-y divide-black/[0.05] text-sm dark:divide-white/[0.06]">
            {revenue.topClinics!.map((c) => (
              <li key={c.clinicId} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate text-rh-ink dark:text-white">
                  {c.name}
                  {c.clinicNumber && <span className="ml-2 font-mono text-xs text-neutral-500">{c.clinicNumber}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-rh-ink dark:text-white">{nairaFromKobo(c.kobo)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

/**
 * Platform analytics from real records only: sign-ups (users), appointments, paid invoices
 * and marketplace bookings, bucketed by month (UTC). Convex queries are live, so there is
 * no refresh button. Every series is bounded server-side; capped series say so.
 */

type Period = '3' | '6' | '12'

/** Chart ink per theme. Categorical slots validated for CVD separation in both modes. */
const INK = {
  light: {
    data: '#00cd0f',
    series: ['#00907f', '#b97a1f', '#6d5bd0', '#d9577c'],
    grid: '#ebe8e1',
    axis: '#737373',
    surface: '#ffffff',
    border: '#e5e5e5',
    text: '#171717',
    muted: '#737373',
  },
  dark: {
    data: '#00cd0f',
    series: ['#1fa898', '#b8832a', '#8b7be0', '#d9628a'],
    grid: '#1f2b2a',
    axis: '#a3a3a3',
    surface: '#1b2827',
    border: '#2a3837',
    text: '#fafafa',
    muted: '#a3a3a3',
  },
}

function monthLabel(key: string, long = false) {
  const [y, m] = key.split('-').map(Number)
  return format(new Date(y, (m || 1) - 1, 1), long ? 'MMMM yyyy' : 'MMM yy')
}

const nairaFromKobo = (kobo: number) => formatNaira(kobo / 100)

export function AdvancedAnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('6')
  const months = Number(period)
  const { theme } = useClinicTheme()
  const ink = INK[theme]

  const growth = useQuery(api.admin.getPlatformAnalytics, { months }) as GrowthResult | undefined
  const appointments = useQuery(api.admin.getAppointmentAnalytics, { months }) as AppointmentsResult | undefined
  const revenue = useQuery(api.admin.getRevenueAnalytics, { months }) as RevenueResult | undefined
  const roles = useQuery(api.admin.getUserRoleCounts) as RoleCountsResult | undefined

  const monthly = useMemo(() => {
    if (!growth || !appointments || !revenue) return null
    return growth.signupsByMonth.map((g, i) => {
      const a = appointments.appointmentsByMonth[i]
      const r = revenue.revenueByMonth[i]
      const b = revenue.bookingsByMonth[i]
      return {
        month: g.month,
        label: monthLabel(g.month),
        signupsPatient: g.patient,
        signupsPhysio: g.physiotherapist,
        signupsClinic: g.clinic,
        signupsOther: g.other,
        signups: g.total,
        appointments: a?.total ?? 0,
        completed: a?.completed ?? 0,
        upcoming: a?.upcoming ?? 0,
        cancelled: a?.cancelled ?? 0,
        noShow: a?.noShow ?? 0,
        grossKobo: r?.grossKobo ?? 0,
        platformFeeKobo: r?.platformFeeKobo ?? 0,
        paidInvoices: r?.paidInvoices ?? 0,
        bookings: b?.created ?? 0,
        bookingsPaid: b?.paid ?? 0,
        bookingsCancelled: b?.cancelled ?? 0,
      }
    })
  }, [growth, appointments, revenue])

  const totals = useMemo(() => {
    if (!monthly) return null
    const sum = (key: keyof (typeof monthly)[number]) => monthly.reduce((s, m) => s + (Number(m[key]) || 0), 0)
    const finished = sum('completed') + sum('cancelled') + sum('noShow')
    return {
      signups: sum('signups'),
      appointments: sum('appointments'),
      completionRate: finished > 0 ? Math.round((sum('completed') / finished) * 100) : null,
      grossKobo: sum('grossKobo'),
      platformFeeKobo: sum('platformFeeKobo'),
      bookings: sum('bookings'),
    }
  }, [monthly])

  const weekly = useMemo(
    () => growth?.signupsByWeek.map((w) => ({ ...w, label: format(new Date(w.weekStart), 'd MMM') })) ?? null,
    [growth]
  )

  const cappedNotes = [
    growth?.capped && 'sign-ups',
    appointments?.capped && 'appointments',
    revenue?.invoicesCapped && 'invoices',
    revenue?.bookingsCapped && 'bookings',
  ].filter(Boolean) as string[]

  const exportCsv = () => {
    if (!monthly) return
    downloadCsv(
      `rehabify-analytics-${months}m-${format(new Date(), 'yyyy-MM-dd')}`,
      monthly.map((m) => ({
        month: m.month,
        signups_total: m.signups,
        signups_patients: m.signupsPatient,
        signups_physiotherapists: m.signupsPhysio,
        signups_clinics: m.signupsClinic,
        signups_other: m.signupsOther,
        appointments_total: m.appointments,
        appointments_completed: m.completed,
        appointments_upcoming: m.upcoming,
        appointments_cancelled: m.cancelled,
        appointments_no_show: m.noShow,
        paid_invoices: m.paidInvoices,
        paid_volume_ngn: (m.grossKobo / 100).toFixed(2),
        platform_fees_ngn: (m.platformFeeKobo / 100).toFixed(2),
        marketplace_bookings: m.bookings,
        marketplace_bookings_paid: m.bookingsPaid,
        marketplace_bookings_cancelled: m.bookingsCancelled,
      }))
    )
  }

  const tooltipStyle = { background: ink.surface, border: `1px solid ${ink.border}`, borderRadius: 10, color: ink.text }
  const axisProps = { stroke: ink.axis, fontSize: 12, tickLine: false, axisLine: false } as const

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Overview"
        title="Analytics"
        description="Growth, care activity and payments, from the platform's own records."
        actions={
          <>
            <FilterChips<Period>
              value={period}
              onChange={setPeriod}
              options={[
                { value: '3', label: '3 months' },
                { value: '6', label: '6 months' },
                { value: '12', label: '12 months' },
              ]}
            />
            <Button size="sm" className={cn(softButtonClass, 'h-9')} onClick={exportCsv} disabled={!monthly}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          </>
        }
      />

      {cappedNotes.length > 0 && (
        <p className="rounded-xl bg-rh-peach px-4 py-2.5 text-xs text-[#8a5208] dark:bg-amber-400/10 dark:text-amber-200">
          Large period: the oldest months may be incomplete for {cappedNotes.join(', ')} (each series reads at most{' '}
          {growth?.cap?.toLocaleString() ?? '2,500'} recent records). Pick a shorter period for exact numbers.
        </p>
      )}

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StaggerItem>
          <StatTile label="New sign-ups" value={totals ? totals.signups.toLocaleString() : <TileSkeleton />} hint={`Last ${months} months`} />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Appointments"
            value={totals ? totals.appointments.toLocaleString() : <TileSkeleton />}
            hint={totals?.completionRate !== null && totals ? `${totals.completionRate}% of finished sessions completed` : 'By scheduled date'}
            tone="mint"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Paid volume" value={totals ? nairaFromKobo(totals.grossKobo) : <TileSkeleton />} hint="Paid invoices" tone="peach" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Platform fees" value={totals ? nairaFromKobo(totals.platformFeeKobo) : <TileSkeleton />} hint="On paid invoices" tone="peach" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Marketplace bookings" value={totals ? totals.bookings.toLocaleString() : <TileSkeleton />} hint="Bookings made" />
        </StaggerItem>
      </Stagger>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartPanel title="Sign-ups per week" description="New accounts, last 12 weeks" loading={!weekly}>
          <BarChart data={weekly ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...axisProps} allowDecimals={false} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: ink.grid, opacity: 0.6 }} formatter={(v: number) => [v, 'Sign-ups']} labelFormatter={(l) => `Week of ${l}`} />
            <Bar dataKey="signups" fill={ink.data} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ChartPanel>

        <ChartPanel
          title="Sign-ups by account type"
          description="New accounts per month"
          loading={!monthly}
          legend={[
            { label: 'Patients', color: ink.series[0] },
            { label: 'Physiotherapists', color: ink.series[1] },
            { label: 'Clinics', color: ink.series[2] },
            { label: 'Other', color: ink.series[3] },
          ]}
        >
          <BarChart data={monthly ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} width={44} />
            <Tooltip content={<StackTooltip ink={ink} />} cursor={{ fill: ink.grid, opacity: 0.6 }} />
            <Bar dataKey="signupsPatient" name="Patients" stackId="s" fill={ink.series[0]} stroke={ink.surface} strokeWidth={1} maxBarSize={40} />
            <Bar dataKey="signupsPhysio" name="Physiotherapists" stackId="s" fill={ink.series[1]} stroke={ink.surface} strokeWidth={1} maxBarSize={40} />
            <Bar dataKey="signupsClinic" name="Clinics" stackId="s" fill={ink.series[2]} stroke={ink.surface} strokeWidth={1} maxBarSize={40} />
            <Bar dataKey="signupsOther" name="Other" stackId="s" fill={ink.series[3]} stroke={ink.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartPanel>

        <ChartPanel
          title="Appointments by month"
          description="By scheduled date and outcome"
          loading={!monthly}
          legend={[
            { label: 'Completed', color: ink.series[0] },
            { label: 'No-show', color: ink.series[1] },
            { label: 'Upcoming / open', color: ink.series[2] },
            { label: 'Cancelled', color: ink.series[3] },
          ]}
        >
          <BarChart data={monthly ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} width={44} />
            <Tooltip content={<StackTooltip ink={ink} />} cursor={{ fill: ink.grid, opacity: 0.6 }} />
            <Bar dataKey="completed" name="Completed" stackId="a" fill={ink.series[0]} stroke={ink.surface} strokeWidth={1} maxBarSize={40} />
            <Bar dataKey="noShow" name="No-show" stackId="a" fill={ink.series[1]} stroke={ink.surface} strokeWidth={1} maxBarSize={40} />
            <Bar dataKey="upcoming" name="Upcoming / open" stackId="a" fill={ink.series[2]} stroke={ink.surface} strokeWidth={1} maxBarSize={40} />
            <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill={ink.series[3]} stroke={ink.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartPanel>

        <ChartPanel title="Paid volume by month" description="Paid invoices, by payment date (fees in the tooltip)" loading={!monthly}>
          <BarChart data={monthly ?? []} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={64} tickFormatter={(v: number) => compactNaira(v / 100)} />
            <Tooltip content={<RevenueTooltip ink={ink} />} cursor={{ fill: ink.grid, opacity: 0.6 }} />
            <Bar dataKey="grossKobo" name="Paid volume" fill={ink.data} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartPanel>

        <ChartPanel title="Marketplace bookings by month" description="Bookings made (paid and cancelled in the tooltip)" loading={!monthly}>
          <BarChart data={monthly ?? []} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} width={44} />
            <Tooltip content={<BookingsTooltip ink={ink} />} cursor={{ fill: ink.grid, opacity: 0.6 }} />
            <Bar dataKey="bookings" name="Bookings" fill={ink.data} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ChartPanel>

        <UsersByRole roles={roles} />
      </div>

      <RevenueStreams revenue={revenue} />

      <Panel title="Monthly table" description="The numbers behind the charts" bodyClassName="pb-2">
        {!monthly ? (
          <div className="px-5 py-4">
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <div className={tableWrapClass}>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-5 py-2.5">Month</th>
                  <th className="px-3 py-2.5 text-right">Sign-ups</th>
                  <th className="px-3 py-2.5 text-right">Appointments</th>
                  <th className="px-3 py-2.5 text-right">Completed</th>
                  <th className="px-3 py-2.5 text-right">Paid invoices</th>
                  <th className="px-3 py-2.5 text-right">Paid volume</th>
                  <th className="px-3 py-2.5 text-right">Platform fees</th>
                  <th className="px-5 py-2.5 text-right">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {[...monthly].reverse().map((m) => (
                  <tr key={m.month} className="border-b tabular-nums text-neutral-700 last:border-0 dark:text-neutral-200">
                    <td className="px-5 py-2.5 font-medium text-rh-ink dark:text-white">{monthLabel(m.month, true)}</td>
                    <td className="px-3 py-2.5 text-right">{m.signups}</td>
                    <td className="px-3 py-2.5 text-right">{m.appointments}</td>
                    <td className="px-3 py-2.5 text-right">{m.completed}</td>
                    <td className="px-3 py-2.5 text-right">{m.paidInvoices}</td>
                    <td className="px-3 py-2.5 text-right">{nairaFromKobo(m.grossKobo)}</td>
                    <td className="px-3 py-2.5 text-right">{nairaFromKobo(m.platformFeeKobo)}</td>
                    <td className="px-5 py-2.5 text-right">{m.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminPage>
  )
}

// ---------------------------------------------------------------------------

function TileSkeleton() {
  return <Skeleton className="mt-1 h-7 w-20 rounded-lg" />
}

function compactNaira(naira: number) {
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(naira >= 10_000_000 ? 0 : 1)}m`
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}k`
  return `₦${Math.round(naira)}`
}

function ChartPanel({
  title,
  description,
  loading,
  legend,
  children,
}: {
  title: string
  description: string
  loading: boolean
  legend?: { label: string; color: string }[]
  children: ReactElement
}) {
  return (
    <Panel title={title} description={description} bodyClassName="px-3 pb-4 pt-2 sm:px-4">
      {legend && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-neutral-600 dark:text-neutral-300">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div className="h-64">
        {loading ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  )
}

type Ink = (typeof INK)['light']

function TooltipBox({ ink, title, children }: { ink: Ink; title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg" style={{ background: ink.surface, border: `1px solid ${ink.border}`, color: ink.text }}>
      <p className="mb-1 font-semibold">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value, color, ink }: { label: string; value: ReactNode; color?: string; ink: Ink }) {
  return (
    <p className="flex items-center justify-between gap-4 tabular-nums">
      <span className="flex items-center gap-1.5" style={{ color: ink.muted }}>
        {color && <span className="h-2 w-2 rounded-sm" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </p>
  )
}

function StackTooltip({ active, payload, label, ink }: TooltipProps<number, string> & { ink: Ink }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
  return (
    <TooltipBox ink={ink} title={label}>
      {[...payload].reverse().map((p) => (
        <Row key={String(p.dataKey)} ink={ink} label={String(p.name)} value={Number(p.value) || 0} color={p.color} />
      ))}
      <div className="my-1 border-t" style={{ borderColor: ink.border }} />
      <Row ink={ink} label="Total" value={total} />
    </TooltipBox>
  )
}

function RevenueTooltip({ active, payload, label, ink }: TooltipProps<number, string> & { ink: Ink }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { grossKobo: number; platformFeeKobo: number; paidInvoices: number }
  return (
    <TooltipBox ink={ink} title={label}>
      <Row ink={ink} label="Paid volume" value={nairaFromKobo(row.grossKobo)} color={ink.data} />
      <Row ink={ink} label="Platform fees" value={nairaFromKobo(row.platformFeeKobo)} />
      <Row ink={ink} label="Paid invoices" value={row.paidInvoices} />
    </TooltipBox>
  )
}

function BookingsTooltip({ active, payload, label, ink }: TooltipProps<number, string> & { ink: Ink }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { bookings: number; bookingsPaid: number; bookingsCancelled: number }
  return (
    <TooltipBox ink={ink} title={label}>
      <Row ink={ink} label="Bookings made" value={row.bookings} color={ink.data} />
      <Row ink={ink} label="Paid" value={row.bookingsPaid} />
      <Row ink={ink} label="Cancelled" value={row.bookingsCancelled} />
    </TooltipBox>
  )
}

type RoleCounts = { byRole: Record<string, { count: number; capped: boolean }>; total: { count: number; capped: boolean } }

function UsersByRole({ roles }: { roles: RoleCounts | undefined }) {
  const rows = roles
    ? Object.entries(roles.byRole)
        .map(([role, c]) => ({ role, ...c }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count)
    : []
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0)
  return (
    <Panel title="Users by role" description={roles ? `${formatCount(roles.total)} accounts in total` : 'All accounts today'} bodyClassName="px-5 pb-5 pt-3">
      {!roles ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">No accounts yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.role}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-neutral-700 dark:text-neutral-200">{roleLabel(r.role)}</span>
                <span className="font-medium tabular-nums text-rh-ink dark:text-white">{formatCount(r)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-rh-honeydew dark:bg-white/[0.06]">
                <div className="h-full rounded-full bg-rh-lime dark:bg-rh-lime" style={{ width: `${max ? Math.max(2, (r.count / max) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
