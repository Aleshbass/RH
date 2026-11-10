/**
 * Repeat visits booked in one go (the physio portal's booking drawer). Times are Lagos time,
 * which is UTC+1 all year, so a week later is exactly 7 × 24 hours later.
 * The server takes the extra start times as `repeatStartTimes` (appointments.createAppointment).
 */

export const MAX_REPEAT_VISITS = 40

const DAY = 86_400_000
const LAGOS_OFFSET = 3_600_000

/** Monday first, as people read a week here. `day` is 0 Sunday … 6 Saturday. */
export const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
]

/** The weekday (0 Sunday … 6 Saturday) of a time, in Lagos. */
export function lagosWeekday(ms: number) {
  return new Date(ms + LAGOS_OFFSET).getUTCDay()
}

/**
 * Every visit of a repeat booking, the first one included, in order: the chosen weekdays at the
 * first visit's time of day, every `everyWeeks` weeks, for `weeks` weeks from the first visit's week.
 */
export function repeatVisitStarts(firstStart: number, days: number[], everyWeeks: number, weeks: number): number[] {
  if (!Number.isFinite(firstStart)) return []
  const monday = firstStart - ((lagosWeekday(firstStart) + 6) % 7) * DAY
  const starts = new Set<number>([firstStart])
  for (let week = 0; week < weeks; week += Math.max(1, everyWeeks)) {
    for (const day of days) {
      const start = monday + week * 7 * DAY + ((day + 6) % 7) * DAY
      if (start > firstStart) starts.add(start)
    }
  }
  return [...starts].sort((a, b) => a - b)
}

/** "2026-11-10" and "14:30", Lagos time, to a timestamp. NaN when either is missing or invalid. */
export function lagosDateTimeToMs(date: string, time: string) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return NaN
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2])) - LAGOS_OFFSET
}

/** Today's date in Lagos as "YYYY-MM-DD". */
export function lagosToday(now = Date.now()) {
  return new Date(now + LAGOS_OFFSET).toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// The repeat planner (components/appointments/RepeatPlanner.tsx): a course of N sessions on
// chosen weekdays. Dates the clinician is busy, public holidays and dates taken out are skipped,
// and the course carries on to the next day so it still has N sessions.
// ─────────────────────────────────────────────────────────────────────────────

export type RepeatPreset = 'weekly' | 'twice' | 'thrice' | 'fortnightly' | 'custom'

export type RepeatPlan = {
  enabled: boolean
  everyWeeks: 1 | 2
  /** Weekdays (0 Sunday … 6 Saturday) besides the first visit's own */
  days: number[]
  /** Sessions in the course, the first visit included */
  sessions: number
  /** Dates taken out by hand (their start times) */
  removed: number[]
  /** Public holidays booked anyway (their start times) */
  keep: number[]
}

export type PlannedVisit = {
  start: number
  state: 'first' | 'book' | 'busy' | 'holiday' | 'removed'
}

export const DEFAULT_SESSIONS = 6
const MAX_WEEKS = 52

/** Nigeria's fixed-date public holidays (month-day). Moving ones (Easter, Eid) are left to the clinician. */
const FIXED_HOLIDAYS = new Set(['01-01', '05-01', '06-12', '10-01', '12-25', '12-26'])

export function isPublicHoliday(ms: number) {
  return FIXED_HOLIDAYS.has(new Date(ms + LAGOS_OFFSET).toISOString().slice(5, 10))
}

/** A weekday `gap` days after `day`, never a Sunday (moved to Monday). */
function weekdayAfter(day: number, gap: number) {
  const next = (day + gap) % 7
  return next === 0 ? 1 : next
}

/** The weekdays a preset uses, given the first visit's weekday. */
export function presetDays(preset: Exclude<RepeatPreset, 'custom'>, firstDay: number): { everyWeeks: 1 | 2; days: number[] } {
  if (preset === 'twice') return { everyWeeks: 1, days: [weekdayAfter(firstDay, 3)].filter((d) => d !== firstDay) }
  // Spread over the week: Mon/Wed/Fri or Tue/Thu/Sat (a Sunday start: Sun/Tue/Thu)
  if (preset === 'thrice') {
    const pattern = firstDay === 0 ? [0, 2, 4] : firstDay % 2 === 1 ? [1, 3, 5] : [2, 4, 6]
    return { everyWeeks: 1, days: pattern.filter((d) => d !== firstDay) }
  }
  if (preset === 'fortnightly') return { everyWeeks: 2, days: [] }
  return { everyWeeks: 1, days: [] }
}

/** Which preset the plan matches, or "custom". */
export function presetOf(plan: Pick<RepeatPlan, 'everyWeeks' | 'days'>, firstDay: number): RepeatPreset {
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d))
  for (const preset of ['weekly', 'twice', 'thrice', 'fortnightly'] as const) {
    const p = presetDays(preset, firstDay)
    if (p.everyWeeks === plan.everyWeeks && same(p.days, plan.days.filter((d) => d !== firstDay))) return preset
  }
  return 'custom'
}

/**
 * Every date the course touches, in order, with what happens to it. Stops once `sessions`
 * visits are booked (the first included), after a year, or at MAX_REPEAT_VISITS.
 */
export function planRepeatVisits(
  firstStart: number,
  durationMs: number,
  plan: Pick<RepeatPlan, 'everyWeeks' | 'days' | 'sessions' | 'removed' | 'keep'>,
  busy: { start: number; end: number }[] = []
): PlannedVisit[] {
  if (!Number.isFinite(firstStart)) return []
  const firstDay = lagosWeekday(firstStart)
  const days = [...new Set([firstDay, ...plan.days])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
  const monday = firstStart - ((firstDay + 6) % 7) * DAY
  const target = Math.max(1, Math.min(MAX_REPEAT_VISITS, Math.round(plan.sessions)))
  const removed = new Set(plan.removed)
  const keep = new Set(plan.keep)
  const visits: PlannedVisit[] = []
  let booked = 0
  for (let week = 0; week < MAX_WEEKS && booked < target; week += plan.everyWeeks) {
    for (const day of days) {
      if (booked >= target) break
      const start = monday + week * 7 * DAY + ((day + 6) % 7) * DAY
      if (start < firstStart) continue
      if (start === firstStart) {
        visits.push({ start, state: 'first' })
        booked += 1
        continue
      }
      const clash = busy.some((b) => b.start < start + durationMs && b.end > start)
      const state: PlannedVisit['state'] = removed.has(start)
        ? 'removed'
        : clash
          ? 'busy'
          : isPublicHoliday(start) && !keep.has(start)
            ? 'holiday'
            : 'book'
      visits.push({ start, state })
      if (state === 'book') booked += 1
    }
  }
  return visits
}
