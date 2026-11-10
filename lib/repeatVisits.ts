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
