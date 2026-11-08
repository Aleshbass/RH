'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { Download, History, Pencil } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState, LoadingBlocks, Panel, StatusBadge, secondaryButtonClass } from '@/components/clinic/ui'
import { fieldClass } from '@/components/patient/ui'
import { cn } from '@/lib/utils'
import { lagosTime, zonedTimeKey } from '@/convex/helpers/lagosTime'
import { addDays, breakMs, decimalHours, formatDistance, formatWorked, mondayOf, workedMs } from '@/convex/helpers/clinicClock'
import { clockRefs, type ShiftView } from '@/components/clock/clockApi'
import { AtClinicBadge, ChoiceChips, dayTitle, downloadCsv, locationText } from './shared'
import type { ShiftTarget } from './ShiftDrawer'

type Range = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'

function rangeFor(range: Range, today: string, custom: { from: string; to: string }) {
  const monday = mondayOf(today)
  const firstOfMonth = `${today.slice(0, 8)}01`
  switch (range) {
    case 'this_week':
      return { from: monday, to: today }
    case 'last_week':
      return { from: addDays(monday, -7), to: addDays(monday, -1) }
    case 'this_month':
      return { from: firstOfMonth, to: today }
    case 'last_month': {
      const lastDay = addDays(firstOfMonth, -1)
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay }
    }
    default:
      return custom.from && custom.to && custom.from <= custom.to ? custom : { from: monday, to: today }
  }
}

/** "8:04 AM" average of first clock-in times ("HH:MM" in Lagos). */
function averageArrival(times: number[]) {
  if (times.length === 0) return '–'
  const minutes = times.map((t) => {
    const [h, m] = zonedTimeKey(t).split(':').map(Number)
    return h * 60 + m
  })
  const avg = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
  const h = Math.floor(avg / 60)
  const m = avg % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Hours over any period: totals per person, every shift, and a spreadsheet export. */
export function ClockHistory({ today, canManage, onEdit }: { today: string; canManage: boolean; onEdit: (target: ShiftTarget) => void }) {
  const [range, setRange] = useState<Range>('this_week')
  const [custom, setCustom] = useState({ from: addDays(today, -13), to: today })
  const [person, setPerson] = useState<string>('all')
  const { from, to } = rangeFor(range, today, custom)
  const data = useQuery(clockRefs.getClockHistory, { from, to })
  const [now] = useState(() => Date.now())

  const shifts = useMemo(
    () => (data?.shifts ?? []).filter((s) => person === 'all' || s.userId === person),
    [data?.shifts, person]
  )

  const totals = useMemo(() => {
    const byPerson = new Map<string, { name: string; days: Set<string>; ms: number; late: number; away: number; firsts: Map<string, number> }>()
    for (const s of shifts) {
      const row = byPerson.get(s.userId) ?? { name: s.name, days: new Set(), ms: 0, late: 0, away: 0, firsts: new Map() }
      row.days.add(s.dateKey)
      row.ms += workedMs(s, now)
      if (s.lateMinutes !== null) row.late += 1
      if (s.offsite) row.away += 1
      const first = row.firsts.get(s.dateKey)
      if (first === undefined || s.clockInAt < first) row.firsts.set(s.dateKey, s.clockInAt)
      byPerson.set(s.userId, row)
    }
    return [...byPerson.entries()]
      .map(([userId, r]) => ({ userId, name: r.name, days: r.days.size, ms: r.ms, late: r.late, away: r.away, arrival: averageArrival([...r.firsts.values()]) }))
      .sort((a, b) => b.ms - a.ms)
  }, [shifts, now])

  const byDay = useMemo(() => {
    const groups = new Map<string, typeof shifts>()
    for (const s of shifts) groups.set(s.dateKey, [...(groups.get(s.dateKey) ?? []), s])
    return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [shifts])

  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Date', 'Clinician', 'Clock in', 'Clock out', 'Breaks (min)', 'Hours worked', 'Late (min)', 'Clock-in location', 'Clock-out location', 'Reason', 'Closed by', 'Corrected', 'Note'],
    ]
    for (const s of [...shifts].sort((a, b) => a.clockInAt - b.clockInAt)) {
      rows.push([
        s.dateKey,
        s.name,
        lagosTime(s.clockInAt),
        s.clockOutAt ? lagosTime(s.clockOutAt) : 'Still in',
        Math.round(breakMs(s.breaks, now) / 60_000),
        decimalHours(workedMs(s, now)),
        s.lateMinutes ?? '',
        locationText(s) ?? '',
        locationText(s, true) ?? '',
        s.offsiteReason ?? '',
        s.closedBy === 'auto' ? 'Automatically' : s.closedBy === 'owner' ? 'Clinic' : s.closedBy === 'self' ? 'Themselves' : '',
        s.edited ? (s.lastEdit?.reason ?? 'Yes') : '',
        s.note ?? '',
      ])
    }
    downloadCsv(`clock-in-${from}-to-${to}.csv`, rows)
  }

  const total = totals.reduce((sum, t) => sum + t.ms, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ChoiceChips
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: 'this_week', label: 'This week' },
            { value: 'last_week', label: 'Last week' },
            { value: 'this_month', label: 'This month' },
            { value: 'last_month', label: 'Last month' },
            { value: 'custom', label: 'Dates…' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            aria-label="Clinician"
            className="h-10 rounded-xl border border-pt-line-strong bg-pt-surface px-3 text-sm text-pt-ink"
          >
            <option value="all">Everyone</option>
            {(data?.team ?? []).map((t) => (
              <option key={t.userId} value={t.userId}>
                {t.name}
              </option>
            ))}
          </select>
          <Button className={cn(secondaryButtonClass, 'h-10')} disabled={shifts.length === 0} onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={custom.from} max={today} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={cn(fieldClass, 'h-10 w-auto')} />
          <span className="text-sm text-pt-muted">to</span>
          <Input type="date" value={custom.to} max={today} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={cn(fieldClass, 'h-10 w-auto')} />
          <span className="text-xs text-pt-muted">Up to three months at a time.</span>
        </div>
      )}

      {data === undefined ? (
        <LoadingBlocks rows={4} />
      ) : !data || shifts.length === 0 ? (
        <Panel>
          <EmptyState icon={<History />} title="No shifts in this period" description="Clock-ins show here as soon as your team starts using it." />
        </Panel>
      ) : (
        <>
          <Panel
            title="Totals"
            description={`${dayTitle(data.from)} – ${dayTitle(data.to)} · ${formatWorked(total)} in all`}
            bodyClassName="px-0 pb-2"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-pt-faint">
                    <th className="px-5 py-2 font-medium sm:px-6">Clinician</th>
                    <th className="px-3 py-2 text-right font-medium">Days</th>
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                    <th className="px-3 py-2 text-right font-medium">Usually in</th>
                    <th className="px-3 py-2 text-right font-medium">Late</th>
                    <th className="px-5 py-2 text-right font-medium sm:px-6">Away</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pt-line">
                  {totals.map((t) => (
                    <tr key={t.userId} className="tabular-nums text-pt-ink">
                      <td className="px-5 py-3 font-medium sm:px-6">{t.name}</td>
                      <td className="px-3 py-3 text-right">{t.days}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatWorked(t.ms)}</td>
                      <td className="px-3 py-3 text-right text-pt-muted">{t.arrival}</td>
                      <td className={cn('px-3 py-3 text-right', t.late ? 'font-semibold' : 'text-pt-faint')}>{t.late || '–'}</td>
                      <td className={cn('px-5 py-3 text-right sm:px-6', t.away ? 'font-semibold' : 'text-pt-faint')}>{t.away || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Every shift" bodyClassName="px-2 pb-2 sm:px-3">
            <div className="space-y-4">
              {byDay.map(([day, rows]) => (
                <div key={day}>
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-pt-faint">{dayTitle(day)}</p>
                  <ul>
                    {rows.map((s: ShiftView & { name: string }) => (
                      <li key={s._id} className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-pt-hover">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-sm font-medium text-pt-ink">{s.name}</p>
                            {s.lateMinutes !== null && <StatusBadge tone="neutral">Late {formatWorked(s.lateMinutes * 60_000)}</StatusBadge>}
                            <AtClinicBadge shift={s} />
                            {s.offsite && <StatusBadge tone="neutral">Away{s.distanceM !== null ? ` · ${formatDistance(s.distanceM)}` : ''}</StatusBadge>}
                            {s.outLocation === 'away' && !s.offsite && <StatusBadge tone="neutral">Clocked out away</StatusBadge>}
                            {s.needsReview && <StatusBadge tone="ink">Check this</StatusBadge>}
                            {s.edited && !s.needsReview && <StatusBadge tone="blue">Corrected</StatusBadge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-pt-muted tabular-nums">
                            {lagosTime(s.clockInAt)} – {s.clockOutAt ? lagosTime(s.clockOutAt) : 'still in'}
                            {breakMs(s.breaks, now) > 0 && ` · breaks ${formatWorked(breakMs(s.breaks, now))}`}
                            {s.offsiteReason && ` · “${s.offsiteReason}”`}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold tabular-nums text-pt-ink">{formatWorked(workedMs(s, now))}</p>
                        {canManage && (
                          <button
                            type="button"
                            aria-label={`Correct ${s.name}'s times`}
                            onClick={() => onEdit({ kind: 'correct', shift: s, name: s.name })}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-pt-faint transition-colors hover:bg-pt-sunken hover:text-pt-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {data.truncated && <p className="px-3 pb-3 text-xs text-pt-muted">Showing the latest 3,000 shifts. Choose a shorter period to see the rest.</p>}
          </Panel>
        </>
      )}
    </div>
  )
}
