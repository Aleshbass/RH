'use client'

import { useMemo } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { faMugHot } from '@fortawesome/free-solid-svg-icons'
import { Check, Icon, LogOut, MapPin, MoreHorizontal, Pencil, Plus } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Panel, StatusBadge } from '@/components/clinic/ui'
import { InfoTip } from '@/components/patient/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { formatLagos, lagosTime, zonedDateTimeToUtc } from '@/convex/helpers/lagosTime'
import { formatDistance, formatWorked, workedMs } from '@/convex/helpers/clinicClock'
import { clockError, clockRefs, type BoardPerson, type ClockBoard, type ShiftView } from '@/components/clock/clockApi'
import { PersonAvatar, STATUS_ORDER } from './shared'
import type { ShiftTarget } from './ShiftDrawer'

type Board = NonNullable<ClockBoard>

function statusLine(person: BoardPerson, now: number) {
  const open = person.shifts.find((s) => s.clockOutAt === null)
  const first = person.shifts[0]
  const last = person.shifts[person.shifts.length - 1]
  switch (person.status) {
    case 'working':
      return `In since ${lagosTime(open!.clockInAt)}`
    case 'on_break': {
      const b = open!.breaks.find((x) => x.endAt === undefined)
      return `On a break since ${lagosTime(b!.startAt)}`
    }
    case 'out':
      return `${lagosTime(first.clockInAt)} – ${lagosTime(last.clockOutAt ?? now)}`
    case 'off':
      return 'Not expected to clock in'
    default:
      return 'Not in yet'
  }
}

function Flags({ shifts }: { shifts: ShiftView[] }) {
  const late = shifts.find((s) => s.lateMinutes !== null)
  const away = shifts.find((s) => s.offsite)
  const review = shifts.some((s) => s.needsReview)
  const edited = shifts.some((s) => s.edited)
  return (
    <>
      {late && <StatusBadge tone="neutral">Late {formatWorked(late.lateMinutes! * 60_000)}</StatusBadge>}
      {away && (
        <span className="inline-flex items-center gap-0.5">
          <StatusBadge tone="neutral">
            <MapPin className="h-3 w-3" />
            Away{away.distanceM !== null ? ` · ${formatDistance(away.distanceM)}` : ''}
          </StatusBadge>
          {away.offsiteReason && <InfoTip label="Their reason">“{away.offsiteReason}”</InfoTip>}
        </span>
      )}
      {review && <StatusBadge tone="ink">Check this</StatusBadge>}
      {edited && !review && <StatusBadge tone="blue">Corrected</StatusBadge>}
    </>
  )
}

/** Everyone on the team and where they are today: in, on a break, done, or not in yet. */
export function TeamToday({ board, now, onEdit }: { board: Board; now: number; onEdit: (target: ShiftTarget) => void }) {
  const clockOut = useMutation(clockRefs.clockOutForClinician)
  const reviewed = useMutation(clockRefs.markShiftReviewed)
  const people = useMemo(
    () => [...board.people].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)),
    [board.people]
  )

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn()
      playSound('success')
      toast.success(success)
    } catch (error) {
      playSound('error')
      toast.error(clockError(error, 'That didn’t work. Try again.'))
    }
  }

  return (
    <Panel
      title="Today"
      description={
        board.hoursToday
          ? `Open ${lagosTime(board.hoursToday.openAt)} – ${lagosTime(board.hoursToday.closeAt)}`
          : 'Closed today in your opening hours'
      }
      bodyClassName="px-2 pb-2 sm:px-3"
    >
      {people.length === 0 ? (
        <p className="px-3 pb-4 text-sm text-pt-muted">Add clinicians on the Team page. They clock in from their Rehabify dashboard.</p>
      ) : (
        <ul>
          {people.map((person) => {
            const worked = person.shifts.reduce((sum, s) => sum + workedMs(s, now), 0)
            const open = person.shifts.find((s) => s.clockOutAt === null) ?? null
            const latest = person.shifts[person.shifts.length - 1] ?? null
            const review = person.shifts.find((s) => s.needsReview) ?? null
            return (
              <li key={person.userId} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-pt-hover">
                <PersonAvatar name={person.name} imageUrl={person.imageUrl} status={person.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-pt-ink">{person.name}</p>
                    {person.status === 'on_break' && (
                      <StatusBadge tone="neutral">
                        <Icon icon={faMugHot} className="h-3 w-3" />
                        Break
                      </StatusBadge>
                    )}
                    <Flags shifts={person.shifts} />
                  </div>
                  <p className={cn('mt-0.5 truncate text-[13px]', person.status === 'not_in' ? 'text-pt-ink' : 'text-pt-muted')}>
                    {statusLine(person, now)}
                  </p>
                </div>
                {worked > 0 && (
                  <p className={cn('shrink-0 text-sm font-semibold tabular-nums', person.status === 'working' ? 'text-pt-ink' : 'text-pt-muted')}>
                    {formatWorked(worked)}
                  </p>
                )}
                {board.canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Options for ${person.name}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-pt-muted transition-colors hover:bg-pt-sunken hover:text-pt-ink"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {open && (
                        <DropdownMenuItem
                          onClick={() => run(() => clockOut({ shiftId: open._id }), `${person.name.split(' ')[0]} is clocked out`)}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Clock out now
                        </DropdownMenuItem>
                      )}
                      {latest && (
                        <DropdownMenuItem onClick={() => onEdit({ kind: 'correct', shift: latest, name: person.name })}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Correct times
                        </DropdownMenuItem>
                      )}
                      {review && (
                        <DropdownMenuItem onClick={() => run(() => reviewed({ shiftId: review._id }), 'Marked as checked')}>
                          <Check className="mr-2 h-4 w-4" />
                          Times look right
                        </DropdownMenuItem>
                      )}
                      {!open && (
                        <DropdownMenuItem
                          onClick={() =>
                            onEdit({
                              kind: 'add',
                              userId: person.userId,
                              name: person.name,
                              dateKey: board.today,
                              open: board.hoursToday?.open,
                              close: board.hoursToday?.close,
                            })
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add a missed shift
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/**
 * The day on one line per person: worked time as bars, breaks as gaps, opening hours shaded,
 * and a line at "now". Live shifts are green.
 */
export function DayTimeline({ board, now }: { board: Board; now: number }) {
  const lanes = board.people.filter((p) => p.shifts.length > 0 || p.status === 'not_in')
  const { start, end, ticks } = useMemo(() => {
    const all = board.people.flatMap((p) => p.shifts)
    const fallbackStart = zonedDateTimeToUtc(board.today, '07:00')
    const fallbackEnd = zonedDateTimeToUtc(board.today, '19:00')
    let s = Math.min(board.hoursToday ? board.hoursToday.openAt - 3_600_000 : fallbackStart, ...all.map((x) => x.clockInAt))
    let e = Math.max(board.hoursToday ? board.hoursToday.closeAt + 3_600_000 : fallbackEnd, ...all.map((x) => x.clockOutAt ?? now))
    const HOUR = 3_600_000
    s = Math.floor(s / HOUR) * HOUR
    e = Math.ceil(e / HOUR) * HOUR
    const every = e - s > 14 * HOUR ? 3 : 2
    const marks: number[] = []
    for (let t = s; t <= e; t += HOUR * every) marks.push(t)
    return { start: s, end: e, ticks: marks }
    // `now` moves every few seconds; the window only needs it once a minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, Math.floor(now / 60_000)])

  if (lanes.length === 0) return null
  const pct = (t: number) => `${(Math.min(Math.max(t, start), end) - start) / (end - start) * 100}%`
  const width = (a: number, b: number) => `${Math.max(0.4, ((Math.min(b, end) - Math.max(a, start)) / (end - start)) * 100)}%`
  const showNow = now >= start && now <= end

  return (
    <Panel title="Timeline" info="Each bar is time clocked in. Gaps are breaks. The shaded band is your opening hours." bodyClassName="px-5 pb-5 sm:px-6">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="relative ml-28 h-5 text-[11px] font-medium text-pt-faint">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>
                {formatLagos(t, { hour: 'numeric', hour12: true }, 'en-US')}
              </span>
            ))}
          </div>
          <div className="relative mt-1 space-y-2">
            {lanes.map((person) => (
              <div key={person.userId} className="flex items-center gap-3">
                <p className="shrink-0 truncate text-[13px] font-medium text-pt-ink" style={{ width: '6.25rem' }}>
                  {person.name.split(' ')[0]}
                </p>
                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-pt-sunken/60">
                  {board.hoursToday && (
                    <div
                      className="absolute inset-y-0 bg-pt-sunken"
                      style={{ left: pct(board.hoursToday.openAt), width: width(board.hoursToday.openAt, board.hoursToday.closeAt) }}
                    />
                  )}
                  {person.shifts.map((shift) => {
                    const stop = shift.clockOutAt ?? now
                    const live = shift.clockOutAt === null
                    // Worked stretches between breaks
                    const pieces: [number, number][] = []
                    let cursor = shift.clockInAt
                    for (const b of [...shift.breaks].sort((x, y) => x.startAt - y.startAt)) {
                      if (b.startAt > cursor) pieces.push([cursor, Math.min(b.startAt, stop)])
                      cursor = Math.max(cursor, b.endAt ?? stop)
                    }
                    if (cursor < stop) pieces.push([cursor, stop])
                    return pieces.map(([a, b]) => (
                      <div
                        key={`${shift._id}-${a}`}
                        title={`${lagosTime(a)} – ${live && b === stop ? 'now' : lagosTime(b)}`}
                        className={cn(
                          'absolute inset-y-1 rounded-md',
                          live ? 'bg-pt-accent' : 'bg-pt-ink/85 dark:bg-white/70',
                          shift.needsReview && 'opacity-60'
                        )}
                        style={{ left: pct(a), width: width(a, b) }}
                      />
                    ))
                  })}
                </div>
              </div>
            ))}
            {showNow && (
              <div className="pointer-events-none absolute inset-y-0 left-28 right-0" aria-hidden>
                <div className="absolute inset-y-[-6px] w-px bg-pt-ink" style={{ left: pct(now) }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}
