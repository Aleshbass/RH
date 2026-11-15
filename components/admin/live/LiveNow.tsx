'use client'

/**
 * Admin › Live now (owner 2026-11-15): how many people are using Rehabify right now, who, where
 * and on what, plus active today / 7 days / 30 days. From the presence heartbeat (convex/presence.ts):
 * anyone with a visible tab in the last 2 minutes. Refreshes every 10 seconds.
 */

import { useEffect, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { AdminPage, EmptyState, PageHeader, Panel, StatTile, StatusBadge } from '@/components/admin/ui'
import { LoadingBlock } from '@/components/admin/partners/shared'
import { Activity, CalendarDays, Monitor, Smartphone, Users } from '@/components/icons'
import { cn } from '@/lib/utils'

type Count = { count: number }
type LiveData = {
  at: number
  live: { total: number; signedIn: number; visitors: number; tabs: number }
  byKind: (Count & { kind: string })[]
  byArea: (Count & { area: string })[]
  byDevice: (Count & { device: string })[]
  online: { userId: string; name: string; kind: string; area: string; device: string; since: number; lastSeen: number }[]
  today: { total: number; signedIn: number; visitors: number }
  week: { total: number; signedIn: number; visitors: number }
  month: { total: number; signedIn: number; visitors: number }
}
const liveRef = makeFunctionReference<'query', { at: number }, LiveData | null>('presence:adminLive')

const KIND_LABEL: Record<string, string> = {
  patient: 'Patients',
  physio: 'Physiotherapists',
  clinic: 'Clinic teams',
  learner: 'Learn learners',
  family: 'Family & carers',
  doctor: 'Doctors',
  partner: 'Partners',
  team: 'Rehabify team',
  admin: 'Admins',
  new: 'Signed up, no role yet',
  visitor: 'Visitors (not signed in)',
}
const KIND_ONE: Record<string, string> = {
  patient: 'Patient',
  physio: 'Physio',
  clinic: 'Clinic team',
  learner: 'Learner',
  family: 'Family',
  doctor: 'Doctor',
  partner: 'Partner',
  team: 'Team',
  admin: 'Admin',
  new: 'No role yet',
  visitor: 'Visitor',
}
const AREA_LABEL: Record<string, string> = {
  site: 'Main website',
  learn: 'Rehabify Learn',
  patient: 'Patient dashboard',
  physio: 'Physio dashboard',
  clinic: 'Clinic dashboard',
  admin: 'Admin console',
  family: 'Family portal',
  partner: 'Partner portal',
  call: 'Video calls',
  blog: 'Blog',
}
const DEVICE_LABEL: Record<string, string> = { phone: 'Phones', tablet: 'Tablets', computer: 'Computers' }

const tick = () => Math.floor(Date.now() / 10_000) * 10_000

function duration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 1) return 'just arrived'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

function Bars({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  if (!rows.length) return <p className="px-5 pb-5 pt-2 text-sm text-neutral-500">Nobody right now.</p>
  return (
    <ul className="space-y-3 px-5 pb-5 pt-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-rh-ink dark:text-white">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-rh-ink dark:text-white">{r.count}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
            <div className="h-full rounded-full bg-rh-lime transition-[width] duration-500" style={{ width: `${total ? Math.max(4, (r.count / total) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function LiveNow() {
  const [at, setAt] = useState(tick)
  useEffect(() => {
    const id = window.setInterval(() => setAt(tick()), 10_000)
    return () => window.clearInterval(id)
  }, [])
  const fresh = useQuery(liveRef, { at })
  // Keep showing the last numbers while the next window loads (no flicker every 10 s)
  const last = useRef<LiveData | null>(null)
  if (fresh) last.current = fresh
  const data = fresh ?? last.current

  const header = (
    <PageHeader
      eyebrow="Overview"
      title="Live now"
      description="People using Rehabify right now: anyone with the site open on their screen in the last 2 minutes. Updates every 10 seconds."
    />
  )
  if (fresh === null) {
    return (
      <AdminPage>
        {header}
        <EmptyState title="Only platform admins can see who’s online" />
      </AdminPage>
    )
  }
  if (!data) {
    return (
      <AdminPage>
        {header}
        <LoadingBlock />
      </AdminPage>
    )
  }

  const total = data.live.total
  return (
    <AdminPage>
      {header}

      <section className="flex flex-col gap-5 rounded-3xl bg-rh-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-center gap-5">
          <span className="relative flex h-4 w-4 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-lime opacity-60" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-rh-lime" />
          </span>
          <div>
            <p className="text-[56px] font-semibold leading-none tabular-nums sm:text-[72px]">{total}</p>
            <p className="mt-2 text-sm text-white/65">{total === 1 ? 'person' : 'people'} online now</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          {[
            [data.live.signedIn, 'signed in'],
            [data.live.visitors, 'visitors'],
            [data.live.tabs, 'open tabs'],
          ].map(([n, label]) => (
            <div key={String(label)} className="rounded-2xl bg-white/[0.07] px-3 py-3">
              <p className="text-2xl font-semibold tabular-nums">{n}</p>
              <p className="text-xs text-white/55">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Active today" value={data.today.total} hint={`${data.today.signedIn} signed in · ${data.today.visitors} visitors`} icon={Activity} />
        <StatTile label="Active in 7 days" value={data.week.total} hint={`${data.week.signedIn} signed in · ${data.week.visitors} visitors`} icon={CalendarDays} />
        <StatTile label="Active in 30 days" value={data.month.total} hint={`${data.month.signedIn} signed in · ${data.month.visitors} visitors`} icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Who" description="Right now, by type of person">
          <Bars rows={data.byKind.map((k) => ({ label: KIND_LABEL[k.kind] ?? k.kind, count: k.count }))} total={total} />
        </Panel>
        <Panel title="Where" description="The part of Rehabify they have open">
          <Bars rows={data.byArea.map((a) => ({ label: AREA_LABEL[a.area] ?? a.area, count: a.count }))} total={total} />
        </Panel>
        <Panel title="On what" description="Phone, tablet or computer">
          <Bars rows={data.byDevice.map((d) => ({ label: DEVICE_LABEL[d.device] ?? d.device, count: d.count }))} total={total} />
        </Panel>
      </div>

      <Panel title="Signed in now" description={data.online.length ? `${data.online.length} ${data.online.length === 1 ? 'person' : 'people'}` : undefined}>
        {data.online.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nobody signed in right now" description="Visitors who aren’t signed in are counted above." />
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.online.map((p) => (
              <li key={p.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-rh-ink dark:text-white">{p.name}</span>
                <StatusBadge tone={p.kind === 'admin' || p.kind === 'team' ? 'neutral' : 'green'}>{KIND_ONE[p.kind] ?? p.kind}</StatusBadge>
                <span className="w-36 truncate text-neutral-600 dark:text-neutral-300">{AREA_LABEL[p.area] ?? p.area}</span>
                <span className={cn('flex w-24 items-center gap-1.5 text-neutral-500')}>
                  {p.device === 'computer' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                  {p.device === 'computer' ? 'Computer' : p.device === 'tablet' ? 'Tablet' : 'Phone'}
                </span>
                <span className="w-24 text-right tabular-nums text-neutral-500">{duration(data.at - p.since)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">
        How it’s counted: each open, visible tab checks in every 45 seconds. A signed-in person counts once however many tabs or devices they use. Visitors who
        allowed analytics count once per browser; the rest are counted per page view, so the visitor number can run slightly high but never low. A tab left in the
        background drops off within 2 minutes.
      </p>
    </AdminPage>
  )
}
