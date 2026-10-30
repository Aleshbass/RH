'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  TrendingDown,
  TrendingUp,
} from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  EmptyState,
  InfoTip,
  PageContainer,
  PageHeader,
  PageSkeleton,
  Panel,
  StatTile,
  primaryButtonClass,
} from '@/components/patient/ui'
import { PatientProgressSection } from '@/components/outcomes/PatientProgressSection'

/** api.analytics.getPatientStats */
type PatientStats = {
  sessions: { completed: number; upcoming: number; total: number; chartData: { date: string; count: number }[] }
  treatment: { activePlans: number; completedExercises: number }
} | null

/** api.physioCare.getMyCheckIns (newest first, up to 14) */
type CheckIns = {
  checkedInToday: boolean
  physioName: string | null
  recent: {
    _id: string
    painScore: number
    functionScore: number
    exercisesDone: 'all' | 'some' | 'none'
    createdAt: number
  }[]
} | null

type Point = { id: string; value: number; at: number }

function painBarClass(value: number) {
  if (value >= 7) return 'bg-pt-rose-fg'
  if (value >= 4) return 'bg-pt-amber-fg'
  return 'bg-pt-green-fg'
}

function activityBarClass(value: number) {
  if (value >= 7) return 'bg-pt-green-fg'
  if (value >= 4) return 'bg-pt-amber-fg'
  return 'bg-pt-rose-fg'
}

/** Flat 0–10 bars, oldest on the left. */
function ScoreBars({ points, barClass, label }: { points: Point[]; barClass: (value: number) => string; label: string }) {
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-40 items-end gap-1.5 border-b border-pt-line pb-px pt-5">
        {points.map((point) => (
          <div key={point.id} className="flex h-full min-w-0 flex-1 items-end justify-center">
            <div
              className={cn('relative w-full max-w-7 rounded-t-md', barClass(point.value))}
              style={{ height: `${Math.max(4, (point.value / 10) * 100)}%` }}
              title={`${format(point.at, 'd MMM')}: ${point.value}/10`}
            >
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-pt-muted">
                {point.value}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {points.map((point, i) => (
          <span key={point.id} className="min-w-0 flex-1 truncate text-center text-[10px] text-pt-faint">
            {/* Every other label when there are many, so they don't overlap on phones */}
            {points.length <= 7 || i % 2 === points.length % 2 ? format(point.at, 'd/M') : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function Trend({ points, lowerIsBetter }: { points: Point[]; lowerIsBetter: boolean }) {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const change = last.value - first.value
  if (change === 0) {
    return <p className="text-sm text-pt-muted">No change since {format(first.at, 'd MMM')}.</p>
  }
  const better = lowerIsBetter ? change < 0 : change > 0
  const Icon = change < 0 ? TrendingDown : TrendingUp
  return (
    <p className={cn('flex items-center gap-1.5 text-sm font-medium', better ? 'text-pt-green-fg' : 'text-pt-amber-fg')}>
      <Icon className="h-4 w-4" />
      {change < 0 ? 'Down' : 'Up'} {Math.abs(change)} point{Math.abs(change) === 1 ? '' : 's'} since {format(first.at, 'd MMM')}
    </p>
  )
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return format(new Date(year, month - 1, 1), 'MMM yy')
}

export default function PatientProgressPage() {
  const stats = useQuery(api.analytics.getPatientStats) as PatientStats | undefined
  const checkIns = useQuery(api.physioCare.getMyCheckIns, {}) as CheckIns | undefined

  if (stats === undefined) return <PageSkeleton />

  const rows = [...(checkIns?.recent ?? [])].reverse()
  const pain: Point[] = rows.map((r) => ({ id: r._id, value: r.painScore, at: r.createdAt }))
  const activity: Point[] = rows.map((r) => ({ id: r._id, value: r.functionScore, at: r.createdAt }))
  const allDone = rows.filter((r) => r.exercisesDone === 'all').length
  const months = (stats?.sessions.chartData ?? []).slice(-12)
  const maxMonth = Math.max(1, ...months.map((m) => m.count))

  const noCheckIns = (
    <EmptyState
      icon={HeartPulse}
      title="No check-ins yet"
      description="Do the quick daily check-in on Home and your trend shows up here."
      action={
        <Button asChild className={primaryButtonClass}>
          <Link href="/dashboard/patient">Check in on Home</Link>
        </Button>
      }
    />
  )

  return (
    <PageContainer>
      <PageHeader
        title="Progress"
        description="How your recovery is going, from your visits and daily check-ins."
        info="Built from your visits, exercise logs and check-ins. The more often you check in, the clearer the picture for you and your physio."
      />

      {/* Pain from the start of care to now, and questions from the physio (convex/outcomes.ts) */}
      <PatientProgressSection />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sessions done"
          value={stats?.sessions.completed ?? 0}
          icon={CalendarCheck}
          tone="green"
          info="Visits your physio has marked as completed."
        />
        <StatTile
          label="Coming up"
          value={stats?.sessions.upcoming ?? 0}
          icon={Calendar}
          tone="blue"
          href="/dashboard/patient/appointments"
          info="Visits that are booked or confirmed and haven’t happened yet."
        />
        <StatTile
          label="Active plans"
          value={stats?.treatment.activePlans ?? 0}
          icon={ClipboardList}
          tone="violet"
          href="/dashboard/patient/treatment-plans"
          info="Treatment plans your physio has set up for you that are still in progress."
        />
        <StatTile
          label="Exercises logged"
          value={stats?.treatment.completedExercises ?? 0}
          icon={Dumbbell}
          tone="amber"
          href="/dashboard/patient/exercises"
          info="Each time you mark a home exercise as done, it counts here."
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Pain"
          description={pain.length > 0 ? `Your last ${pain.length} check-in${pain.length === 1 ? '' : 's'}` : undefined}
          info="From your daily check-ins. 0 is no pain and 10 is the worst you can imagine, so lower is better."
        >
          {checkIns === undefined ? (
            <div className="h-44 animate-pulse rounded-2xl bg-pt-sunken" />
          ) : pain.length === 0 ? (
            noCheckIns
          ) : (
            <div className="space-y-3">
              <Trend points={pain} lowerIsBetter />
              <ScoreBars points={pain} barClass={painBarClass} label="Pain scores from your recent check-ins" />
            </div>
          )}
        </Panel>

        <Panel
          title="Day-to-day activity"
          description={activity.length > 0 ? 'How much you can do, out of 10' : undefined}
          info="From your daily check-ins. 10 means you can do everything as normal, so higher is better."
        >
          {checkIns === undefined ? (
            <div className="h-44 animate-pulse rounded-2xl bg-pt-sunken" />
          ) : activity.length === 0 ? (
            noCheckIns
          ) : (
            <div className="space-y-3">
              <Trend points={activity} lowerIsBetter={false} />
              <ScoreBars points={activity} barClass={activityBarClass} label="Activity scores from your recent check-ins" />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Home exercises" info="What you told us in your check-ins about doing the exercises your physio set.">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-pt-muted">Your check-ins will show how your exercises are going.</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-pt-ink">
                You did all your exercises on <span className="font-semibold">{allDone}</span> of your last {rows.length} check-in
                {rows.length === 1 ? '' : 's'}.
              </p>
              <div className="flex flex-wrap gap-1.5" aria-hidden>
                {rows.map((r) => (
                  <span
                    key={r._id}
                    title={`${format(r.createdAt, 'd MMM')}: ${r.exercisesDone === 'all' ? 'all' : r.exercisesDone === 'some' ? 'some' : 'none'}`}
                    className={cn(
                      'h-6 w-6 rounded-lg',
                      r.exercisesDone === 'all' ? 'bg-pt-green-fg' : r.exercisesDone === 'some' ? 'bg-pt-amber-fg/70' : 'bg-pt-line-strong'
                    )}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-pt-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-pt-green-fg" /> All
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-pt-amber-fg/70" /> Some
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-pt-line-strong" /> None
                </span>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Visits by month"
          info="Completed visits in each month. Regular sessions usually mean steadier progress."
        >
          {months.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No completed visits yet"
              description="Once you’ve had a session, your monthly visits show up here."
            />
          ) : (
            <div role="img" aria-label="Completed visits per month">
              <div className="flex h-40 items-end gap-2 border-b border-pt-line pb-px pt-5">
                {months.map((m) => (
                  <div key={m.date} className="flex h-full min-w-0 flex-1 items-end justify-center">
                    <div className="relative w-full max-w-10 rounded-t-md bg-pt-ink" style={{ height: `${Math.max(4, (m.count / maxMonth) * 100)}%` }}>
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-pt-muted">
                        {m.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2">
                {months.map((m) => (
                  <span key={m.date} className="min-w-0 flex-1 truncate text-center text-[10px] text-pt-faint">
                    {monthLabel(m.date)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {checkIns?.physioName && (
        <p className="flex items-center justify-center gap-1 text-center text-xs text-pt-muted">
          {checkIns.physioName} sees your check-ins too.
          <InfoTip>Your physio uses them to adjust your plan between visits.</InfoTip>
        </p>
      )}
    </PageContainer>
  )
}
