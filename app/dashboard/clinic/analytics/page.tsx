'use client'

import type { ReactNode } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Skeleton } from '@/components/ui/skeleton'
import { TourGuide } from '@/components/shared/TourGuide'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { PageShell, Panel, StatTile, formatNaira } from '@/components/clinic/ui'

const pct = (value: number) => `${Number(value || 0).toFixed(1)}%`

function signedPct(value: number) {
  const v = Number(value || 0)
  return `${v > 0 ? '+' : ''}${v.toFixed(v % 1 === 0 ? 0 : 1)}%`
}

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
      <span className={strong ? 'text-sm font-medium text-pt-ink' : 'text-sm text-pt-muted'}>
        {label}
      </span>
      <span
        className={
          strong
            ? 'text-sm font-semibold tabular-nums text-pt-ink'
            : 'text-sm tabular-nums text-pt-ink'
        }
      >
        {value}
      </span>
    </div>
  )
}

export default function OwnerAnalyticsPage() {
  const { isReadOnly } = useClinicAccess()
  const analyticsData = useQuery(api.clinics.getOwnerAnalytics)
  const revenueData = useQuery(api.clinics.getClinicRevenue)
  const staffMetrics = useQuery(api.clinics.getStaffMetrics)
  const appointmentStats = useQuery(api.clinics.getClinicAppointmentStats)

  const description = isReadOnly
    ? 'Figures fill in once your clinic is set up and approved.'
    : 'How your clinic is doing this month.'

  if (
    analyticsData === undefined ||
    revenueData === undefined ||
    staffMetrics === undefined ||
    appointmentStats === undefined
  ) {
    return (
      <PageShell title="Reports" description={description}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </PageShell>
    )
  }

  // Revenue values are already in naira.
  const revenueGrowth = revenueData.growth ?? 0
  const utilization = staffMetrics.utilization ?? 0
  const totalAppointments = appointmentStats.total ?? 0
  const noShows = appointmentStats.noShows ?? 0
  const telehealthSessions = analyticsData.telehealth?.sessionsCount ?? 0
  const telehealthHours = Math.round((analyticsData.telehealth?.totalMinutes ?? 0) / 60)

  // Plain, rule-based tips. Only shown when a rule actually applies.
  const tips: string[] = []
  if (staffMetrics.active > 0 && utilization >= 85) {
    tips.push(`Your clinicians are ${pct(utilization)} booked. Consider inviting another clinician before the team is overloaded.`)
  } else if (staffMetrics.active > 0 && utilization < 50) {
    tips.push(`Your clinicians are ${pct(utilization)} booked, so you have room to take on more patients.`)
  }
  if (totalAppointments > 0 && (noShows > 3 || noShows / totalAppointments > 0.08)) {
    tips.push(`${noShows} patients missed their appointment this month. A reminder the day before can help.`)
  }
  if ((revenueData.pendingPayments ?? 0) > 0) {
    tips.push(`${formatNaira(revenueData.pendingPayments)} is still unpaid on sent invoices.`)
  }

  return (
    <PageShell title="Reports" description={description} info="Figures for your clinic only: your own patients and the ones Rehabify referred to you.">
      <div id="analytics-key-metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue this month"
          value={formatNaira(revenueData.thisMonth ?? 0)}
          hint={`${signedPct(revenueGrowth)} vs last month`}
        />
        <StatTile
          label="Visits this month"
          value={totalAppointments}
          hint={`${pct(appointmentStats.completionRate ?? 0)} attended`}
        />
        <StatTile
          label="Active patients"
          value={analyticsData.patients?.active ?? 0}
          hint={`${analyticsData.patients?.newThisMonth ?? 0} new this month`}
        />
        <StatTile
          label="Active clinicians"
          value={staffMetrics.active ?? 0}
          hint={`${pct(utilization)} booked`}
        />
      </div>

      <div id="analytics-detailed" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Revenue" description="Paid invoices">
          <div className="divide-y divide-pt-line">
            <Row label="This month" value={formatNaira(revenueData.thisMonth ?? 0)} />
            <Row label="Last month" value={formatNaira(revenueData.lastMonth ?? 0)} />
            <Row label="Unpaid invoices" value={formatNaira(revenueData.pendingPayments ?? 0)} />
            <Row label="All time" value={formatNaira(revenueData.totalRevenue ?? 0)} strong />
          </div>
        </Panel>

        <Panel title="Appointments" description="This month">
          <div className="divide-y divide-pt-line">
            <Row label="Booked" value={totalAppointments} />
            <Row label="Completed" value={appointmentStats.completed ?? 0} />
            <Row label="Cancelled" value={appointmentStats.cancelled ?? 0} />
            <Row label="No-shows" value={noShows} />
            <Row label="Video consultations (all time)" value={`${telehealthSessions} · ${telehealthHours}h`} />
            <Row label="Attendance rate" value={pct(appointmentStats.completionRate ?? 0)} strong />
          </div>
        </Panel>

        <Panel title="Patients">
          <div className="divide-y divide-pt-line">
            <Row label="All patients" value={analyticsData.patients?.total ?? 0} />
            <Row label="In active care" value={analyticsData.patients?.active ?? 0} />
            <Row label="New this month" value={analyticsData.patients?.newThisMonth ?? 0} />
            <Row label="Still in care" value={pct(analyticsData.patients?.retention ?? 0)} strong />
          </div>
        </Panel>

        <Panel title="Team">
          <div className="divide-y divide-pt-line">
            <Row label="Clinicians" value={staffMetrics.total ?? 0} />
            <Row label="Active" value={staffMetrics.active ?? 0} />
            <Row label="Joined this month" value={staffMetrics.newThisMonth ?? 0} />
            <Row label="Booked capacity" value={pct(utilization)} strong />
          </div>
        </Panel>
      </div>

      {tips.length > 0 && (
        <div id="analytics-insights">
          <Panel title="Tips">
            <ul className="divide-y divide-pt-line">
              {tips.map((tip) => (
                <li key={tip} className="px-5 py-3 text-sm text-pt-ink sm:px-6">
                  {tip}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <TourGuide
        tourId="clinic-analytics-tour"
        steps={[
          {
            target: '#analytics-key-metrics',
            title: 'This month at a glance',
            content: 'Revenue, visits, patients and clinicians for the current month.',
            position: 'bottom',
          },
          {
            target: '#analytics-detailed',
            title: 'Breakdown',
            content: 'Revenue, appointments, patients and team numbers in more detail.',
            position: 'top',
          },
        ]}
      />
    </PageShell>
  )
}
