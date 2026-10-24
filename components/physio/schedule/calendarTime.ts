/**
 * Calendar maths for the physio Calendar, all in Lagos time (no DST, so a day is always 24h):
 * weeks start on Monday, working hours come from the physio's availability schedule, and free
 * time is what's left of those hours once sessions are taken out.
 */

import { LAGOS_TIME_ZONE, startOfZonedDay, zonedDateKey, zonedDateTimeToUtc } from '@/convex/helpers/lagosTime'

export const MINUTE_MS = 60_000
export const DAY_MS = 24 * 60 * MINUTE_MS

export type Span = { start: number; end: number }

export type WorkingSchedule = {
  timezone?: string
  weeklyHours: { dayOfWeek: number; isAvailable: boolean; slots: { start: string; end: string }[] }[]
  dateOverrides?: { date: string; isAvailable: boolean; slots?: { start: string; end: string }[] }[]
}

/** 0 for Sunday … 6 for Saturday, in Lagos. */
export function dayOfWeek(utc: number) {
  return new Date(`${zonedDateKey(utc)}T00:00:00Z`).getUTCDay()
}

/** Midnight starting the Monday of the week holding `utc`. */
export function weekStartOf(utc: number) {
  const day = startOfZonedDay(utc)
  return day - ((dayOfWeek(day) + 6) % 7) * DAY_MS
}

export function weekDays(weekStart: number) {
  return Array.from({ length: 7 }, (_, i) => weekStart + i * DAY_MS)
}

/** Minutes since midnight, Lagos time. */
export function minuteOfDay(utc: number) {
  return Math.round((utc - startOfZonedDay(utc)) / MINUTE_MS)
}

/**
 * Working hours on the day starting at `dayStart`. A date override wins over the weekly hours.
 * [] is a day off; null means we don't know the hours (schedule not loaded).
 */
export function workingHours(schedule: WorkingSchedule | null | undefined, dayStart: number): Span[] | null {
  if (!schedule) return null
  const key = zonedDateKey(dayStart)
  const override = schedule.dateOverrides?.find((o) => o.date === key)
  const weekly = schedule.weeklyHours.find((d) => d.dayOfWeek === dayOfWeek(dayStart))
  const slots = override ? (override.isAvailable ? override.slots ?? [] : []) : weekly?.isAvailable ? weekly.slots : []
  const zone = schedule.timezone || LAGOS_TIME_ZONE
  return slots
    .map((slot) => ({ start: zonedDateTimeToUtc(key, slot.start, zone), end: zonedDateTimeToUtc(key, slot.end, zone) }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start)
}

/** Stretches of working time after `from` with nothing booked, at least `minMinutes` long. */
export function freeTime(hours: Span[], busy: Span[], from: number, minMinutes = 30): Span[] {
  const sorted = busy.slice().sort((a, b) => a.start - b.start)
  const free: Span[] = []
  for (const window of hours) {
    let cursor = Math.max(window.start, from)
    for (const block of sorted) {
      if (cursor >= window.end) break
      if (block.end <= cursor || block.start >= window.end) continue
      if (block.start > cursor) free.push({ start: cursor, end: block.start })
      cursor = Math.max(cursor, block.end)
    }
    if (cursor < window.end) free.push({ start: cursor, end: window.end })
  }
  return free.filter((span) => span.end - span.start >= minMinutes * MINUTE_MS)
}

/** Places overlapping items side by side: each gets a column and the width of its cluster. */
export function sideBySide<T extends Span>(items: T[]): { item: T; column: number; columns: number }[] {
  const sorted = items.slice().sort((a, b) => a.start - b.start || b.end - a.end)
  const placed: { item: T; column: number; columns: number }[] = []
  let cluster: { item: T; column: number }[] = []
  let clusterEnd = -Infinity
  const flush = () => {
    const columns = Math.max(1, ...cluster.map((c) => c.column + 1))
    for (const c of cluster) placed.push({ ...c, columns })
    cluster = []
  }
  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    const taken = new Set(cluster.filter((c) => c.item.end > item.start).map((c) => c.column))
    let column = 0
    while (taken.has(column)) column++
    cluster.push({ item, column })
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return placed
}

/** "9 AM", "12 PM". */
export function hourLabel(hour: number) {
  const h = hour % 24
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
}

/** "45 min", "2 h", "1 h 30 min". */
export function durationLabel(ms: number) {
  const minutes = Math.round(ms / MINUTE_MS)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/** The next quarter hour from `utc`, so free time "now" starts somewhere bookable. */
export function nextQuarterHour(utc: number) {
  const quarter = 15 * MINUTE_MS
  return Math.ceil(utc / quarter) * quarter
}
