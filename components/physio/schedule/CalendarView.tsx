'use client'

/**
 * Schedule → Calendar, built for the physio instead of a generic calendar widget.
 *
 * - Week grid (desktop): your working hours in white, the rest shaded, sessions coloured by what
 *   they need from you, a live "now" line, and any empty time bookable with one tap.
 * - Day agenda (beside the grid, or the whole page on a phone): the day in order with the free
 *   gaps in your working hours shown as "Free · 2 h" you can book straight into.
 * Everything is live and in Lagos time; sessions open in the same drawer as the Schedule list.
 */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  CalendarOff,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Hourglass,
  Loader2,
  MapPin,
  Plus,
  Video,
} from '@/components/icons'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { formatLagos, lagosDate, lagosTime, startOfZonedDay } from '@/convex/helpers/lagosTime'
import { isCancelledAppointment } from '@/convex/helpers/appointmentStatus'
import { Button } from '@/components/ui/button'
import { isVideoVisit } from '@/components/appointments/appointment-ui'
import {
  cardClass,
  DetailRow,
  InfoTip,
  PhysioDrawer,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/physio/ui'
import { formatKobo } from '@/lib/rehabify-services'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { usePracticeMode } from '@/components/physio/practiceMode'
import { AppointmentDrawer } from './AppointmentDrawer'
import { useBooking } from './BookingDrawer'
import { JoinVideoButton } from './JoinVideoButton'
import {
  DAY_MS,
  durationLabel,
  freeTime,
  hourLabel,
  MINUTE_MS,
  minuteOfDay,
  nextQuarterHour,
  sideBySide,
  weekDays,
  weekStartOf,
  workingHours,
  type Span,
  type WorkingSchedule,
} from './calendarTime'
import {
  asLike,
  minutesOf,
  needsMyAnswer,
  patientName,
  Quiet,
  readableError,
  scheduleApi,
  useNow,
  videoJoin,
  visitStatus,
  type HeldBooking,
  type PhysioAppointment,
} from './shared'

const availabilityApi = (api as unknown as Record<string, Record<string, Record<string, unknown>>>).calendar.availability

const HOUR_PX = 52
const WORKING_HOURS_HREF = '/dashboard/physiotherapist/settings/availability'

export type Entry =
  | { kind: 'visit'; id: string; start: number; end: number; visit: PhysioAppointment }
  | { kind: 'held'; id: string; start: number; end: number; held: HeldBooking }

/** ink = needs your answer (solid), outline = time passed and not closed yet. */
type Look = { tone: 'green' | 'ink' | 'outline' | 'rose' | 'blue' | 'neutral'; label: string; dashed: boolean; faded: boolean }

function lookOf(entry: Entry, now: number): Look {
  if (entry.kind === 'held') return { tone: 'neutral', label: 'Waiting for payment', dashed: true, faded: false }
  const status = visitStatus(entry.visit, now)
  const tone =
    status.label === 'Not closed'
      ? 'outline'
      : status.tone === 'green' || status.tone === 'ink' || status.tone === 'rose' || status.tone === 'blue'
        ? status.tone
        : 'neutral'
  return {
    tone,
    label: status.label,
    dashed: status.label === 'Waiting for patient' || status.label === 'New time sent',
    faded: entry.visit.status === 'completed' || entry.visit.status === 'no_show' || isCancelledAppointment(entry.visit.status),
  }
}

const BLOCK_TONE: Record<Look['tone'], string> = {
  green: 'bg-pt-green-bg border-pt-green-fg/25 text-pt-green-fg',
  ink: 'bg-pt-primary border-pt-primary text-pt-on-primary/75',
  outline: 'bg-pt-surface border-pt-ink/30 text-pt-ink',
  rose: 'bg-pt-rose-bg border-pt-rose-fg/25 text-pt-rose-fg',
  blue: 'bg-pt-blue-bg border-pt-blue-fg/40 text-pt-blue-fg',
  neutral: 'bg-pt-surface border-pt-line-strong text-pt-muted',
}

/** The patient's name on a session block. */
const NAME_TONE: Record<Look['tone'], string> = {
  green: 'text-pt-ink',
  ink: 'text-pt-on-primary',
  outline: 'text-pt-ink',
  rose: 'text-pt-ink',
  blue: 'text-pt-ink',
  neutral: 'text-pt-ink',
}

/** The coloured bar down the left edge of a session. */
const BAR_TONE: Record<Look['tone'], string> = {
  green: 'border-l-pt-green-fg',
  ink: 'border-l-pt-primary',
  outline: 'border-l-pt-ink',
  rose: 'border-l-pt-rose-fg',
  blue: 'border-l-pt-blue-fg',
  neutral: 'border-l-pt-line-strong',
}

const TEXT_TONE: Record<Look['tone'], string> = {
  green: 'text-pt-green-fg',
  ink: 'text-pt-ink',
  outline: 'text-pt-ink',
  rose: 'text-pt-rose-fg',
  blue: 'text-pt-blue-fg',
  neutral: 'text-pt-muted',
}

function entryTitle(entry: Entry) {
  return entry.kind === 'visit' ? patientName(entry.visit) : entry.held.patientName
}

function entryIsVideo(entry: Entry) {
  return entry.kind === 'visit' ? isVideoVisit(asLike(entry.visit)) : entry.held.isOnline
}

function entryDetail(entry: Entry) {
  if (entry.kind === 'held') return `${entry.held.serviceName} · you earn ${formatKobo(entry.held.payoutKobo)}`
  const video = isVideoVisit(asLike(entry.visit))
  return `${entry.visit.serviceType || 'Session'} · ${video ? 'Video call' : entry.visit.location || 'In person'}`
}

function weekLabel(weekStart: number) {
  const end = weekStart + 6 * DAY_MS
  const sameMonth = formatLagos(weekStart, { month: 'short' }) === formatLagos(end, { month: 'short' })
  const from = formatLagos(weekStart, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  return `${from} – ${formatLagos(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function dayHeading(day: number, now: number) {
  const today = startOfZonedDay(now)
  if (day === today) return 'Today'
  if (day === today + DAY_MS) return 'Tomorrow'
  if (day === today - DAY_MS) return 'Yesterday'
  return formatLagos(day, { weekday: 'long' })
}

// ─── Data that may not be deployed yet: read inside Quiet so a gap can't break the page ───

function HeldSource({ onChange }: { onChange: (held: HeldBooking[]) => void }) {
  const held = useQueryUntyped(scheduleApi.booking.getMyHeldBookingsAsPhysio, {}) as HeldBooking[] | undefined
  useEffect(() => {
    if (held) onChange(held)
  }, [held, onChange])
  return null
}

function HoursSource({ onChange }: { onChange: (schedule: WorkingSchedule) => void }) {
  const me = useQueryUntyped(scheduleApi.users.getMyUser, {}) as { _id: string } | null | undefined
  const schedule = useQueryUntyped(availabilityApi.getAvailabilitySchedule, me ? { physiotherapistId: me._id } : 'skip') as
    | WorkingSchedule
    | undefined
  useEffect(() => {
    if (schedule) onChange(schedule)
  }, [schedule, onChange])
  return null
}

// ─── Week grid ───

function DayColumn({
  day,
  entries,
  hours,
  range,
  now,
  onOpen,
  onBook,
}: {
  day: number
  entries: Entry[]
  hours: Span[] | null
  range: { start: number; end: number }
  now: number
  onOpen: (entry: Entry) => void
  onBook: (start: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const px = (minutes: number) => (minutes * HOUR_PX) / 60
  const topOf = (utc: number) => px((utc - day) / MINUTE_MS - range.start * 60)
  const isToday = day === startOfZonedDay(now)

  // The half hour under the pointer, if it's still ahead of us
  const slotAt = (event: { clientY: number; currentTarget: HTMLElement }) => {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top
    const minute = Math.floor((y / HOUR_PX) * 2) * 30 + range.start * 60
    const start = day + minute * MINUTE_MS
    return start >= nextQuarterHour(now) - 15 * MINUTE_MS ? start : null
  }
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-entry]')) return setHover(null)
    setHover(slotAt(event))
  }

  return (
    <div
      className={cn('relative border-l border-pt-line', hours ? 'bg-pt-sunken' : 'bg-pt-surface')}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('[data-entry]')) return
        const start = slotAt(event)
        if (start !== null) onBook(start)
      }}
    >
      {/* Working hours in white, everything else shaded */}
      {hours?.map((span) => (
        <div
          key={span.start}
          aria-hidden
          className="absolute inset-x-0 bg-pt-surface"
          style={{ top: topOf(span.start), height: px((span.end - span.start) / MINUTE_MS) }}
        />
      ))}
      {Array.from({ length: range.end - range.start }, (_, i) => (
        <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-pt-line" style={{ top: i * HOUR_PX }} />
      ))}

      {hover !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 z-[1] rounded-lg border border-dashed border-pt-ink/40 bg-pt-surface px-1.5 py-1 text-[11px] font-semibold text-pt-ink"
          style={{ top: topOf(hover) + 1, height: px(60) - 2 }}
        >
          <Plus className="mr-0.5 inline h-3 w-3" />
          {lagosTime(hover)}
        </div>
      )}

      {sideBySide(entries).map(({ item: entry, column, columns }) => {
        const look = lookOf(entry, now)
        const height = Math.max(px((entry.end - entry.start) / MINUTE_MS) - 2, 22)
        const Icon = entry.kind === 'held' ? Hourglass : entryIsVideo(entry) ? Video : MapPin
        // A live Join on the block itself while the window is open (lib/videoJoin.ts), when there's room
        const join = entry.kind === 'visit' ? videoJoin(entry.visit, now) : null
        const joinHere = join?.kind === 'open' && height >= 34 && columns === 1 ? join : null
        return (
          <div
            key={entry.id}
            data-entry
            className="absolute z-[2]"
            style={{
              top: topOf(entry.start) + 1,
              height,
              left: `calc(${(column / columns) * 100}% + 3px)`,
              width: `calc(${100 / columns}% - 6px)`,
            }}
          >
          <button
            type="button"
            onClick={() => onOpen(entry)}
            title={`${entryTitle(entry)} · ${lagosTime(entry.start)} · ${look.label}`}
            className={cn(
              'block h-full w-full overflow-hidden rounded-lg border border-l-[3px] px-1.5 py-1 text-left transition hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-ink/40',
              BLOCK_TONE[look.tone],
              BAR_TONE[look.tone],
              look.dashed && 'border-dashed',
              look.faded && 'opacity-60'
            )}
          >
            {height < 34 || columns > 2 ? (
              <span className="flex items-center gap-1 truncate text-[11px] leading-tight">
                <span className="font-semibold tabular-nums">{lagosTime(entry.start).replace(' ', '')}</span>
                <span className={cn('truncate font-semibold', NAME_TONE[look.tone], look.faded && entry.kind === 'visit' && isCancelledAppointment(entry.visit.status) && 'line-through')}>
                  {entryTitle(entry)}
                </span>
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] font-medium tabular-nums leading-tight">
                  {columns === 1 && <Icon className="h-3 w-3 shrink-0" />}
                  {columns === 1 ? lagosTime(entry.start) : lagosTime(entry.start).replace(' ', '')}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block truncate text-[12px] font-semibold leading-tight',
                    NAME_TONE[look.tone],
                    entry.kind === 'visit' && isCancelledAppointment(entry.visit.status) && 'line-through'
                  )}
                >
                  {entryTitle(entry)}
                </span>
                {height >= 56 && <span className="mt-0.5 block truncate text-[11px] leading-tight">{look.label}</span>}
              </>
            )}
          </button>
          {joinHere && (
            <JoinVideoButton
              join={joinHere}
              iconOnly
              label={`Join video call with ${entryTitle(entry)}`}
              className="absolute right-1 top-1 h-6 w-6 rounded-md px-0"
            />
          )}
          </div>
        )
      })}

      {isToday && now >= day + range.start * 60 * MINUTE_MS && now <= day + range.end * 60 * MINUTE_MS && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[3]" style={{ top: topOf(now) }}>
          <div className="h-[2px] bg-pt-accent" />
          <span className="absolute -left-[5px] -top-[4px] h-2.5 w-2.5 rounded-full bg-pt-accent" />
        </div>
      )}
    </div>
  )
}

export function WeekGrid({
  days,
  entriesByDay,
  hoursByDay,
  range,
  now,
  selectedDay,
  onSelectDay,
  onOpen,
  onBook,
  loading,
}: {
  days: number[]
  entriesByDay: Map<number, Entry[]>
  hoursByDay: Map<number, Span[] | null>
  range: { start: number; end: number }
  now: number
  selectedDay: number
  onSelectDay: (day: number) => void
  onOpen: (entry: Entry) => void
  onBook: (start: number) => void
  loading: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = startOfZonedDay(now)

  // Open each week near the action: now if it's this week, else the first session or working hour
  const weekKey = days[0]
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const firsts = days.flatMap((day) => [
      ...(entriesByDay.get(day) ?? []).map((e) => minuteOfDay(e.start)),
      ...(hoursByDay.get(day) ?? []).map((s) => minuteOfDay(s.start)),
    ])
    const target = days.includes(today) ? minuteOfDay(now) - 90 : firsts.length ? Math.min(...firsts) - 30 : 8 * 60
    el.scrollTop = Math.max(0, ((target - range.start * 60) * HOUR_PX) / 60)
    // Only when the week changes, not on every live update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey])

  return (
    <div ref={scrollRef} className="relative max-h-[calc(100dvh-16rem)] min-h-[28rem] overflow-y-auto overscroll-contain">
      <div className="sticky top-0 z-10 grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-pt-line bg-pt-surface">
        <div />
        {days.map((day) => {
          const entries = entriesByDay.get(day) ?? []
          const answers = entries.filter((e) => e.kind === 'visit' && needsMyAnswer(e.visit, now)).length
          const active = entries.filter((e) => e.kind === 'held' || !isCancelledAppointment(e.visit.status)).length
          const hours = hoursByDay.get(day)
          const isToday = day === today
          const selected = day === selectedDay
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={selected}
              className={cn(
                'relative flex flex-col items-center gap-0.5 px-1 pb-2 pt-2.5 transition-colors hover:bg-pt-hover',
                selected && 'after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-pt-ink'
              )}
            >
              <span className={cn('text-[11px] font-semibold uppercase tracking-wide', isToday ? 'text-pt-ink' : 'text-pt-faint')}>
                {formatLagos(day, { weekday: 'short' })}
              </span>
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums',
                  isToday ? 'bg-pt-primary text-pt-on-primary' : 'text-pt-ink'
                )}
              >
                {formatLagos(day, { day: 'numeric' })}
              </span>
              <span className={cn('h-4 truncate text-[11px]', answers ? 'font-semibold text-pt-ink' : 'text-pt-faint')}>
                {answers ? `${answers} to answer` : active ? `${active} session${active === 1 ? '' : 's'}` : hours && hours.length === 0 ? 'Day off' : ''}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]" style={{ height: (range.end - range.start) * HOUR_PX }}>
        <div className="relative">
          {Array.from({ length: range.end - range.start - 1 }, (_, i) => (
            <span
              key={i}
              className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-pt-faint"
              style={{ top: (i + 1) * HOUR_PX }}
            >
              {hourLabel(range.start + i + 1)}
            </span>
          ))}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            entries={entriesByDay.get(day) ?? []}
            hours={hoursByDay.get(day) ?? null}
            range={range}
            now={now}
            onOpen={onOpen}
            onBook={onBook}
          />
        ))}
        {loading && <div className="pointer-events-none absolute inset-0 z-[4] animate-pulse bg-pt-surface/40" aria-hidden />}
      </div>
    </div>
  )
}

// ─── Week strip (phones) ───

export function WeekStrip({
  days,
  entriesByDay,
  now,
  selectedDay,
  onSelectDay,
  onSwipe,
}: {
  days: number[]
  entriesByDay: Map<number, Entry[]>
  now: number
  selectedDay: number
  onSelectDay: (day: number) => void
  onSwipe: (direction: 1 | -1) => void
}) {
  const touchX = useRef<number | null>(null)
  const today = startOfZonedDay(now)
  return (
    <div
      className="grid grid-cols-7 gap-1"
      onTouchStart={(event) => (touchX.current = event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const start = touchX.current
        const end = event.changedTouches[0]?.clientX
        touchX.current = null
        if (start === null || end === undefined || Math.abs(end - start) < 50) return
        onSwipe(end < start ? 1 : -1)
      }}
    >
      {days.map((day) => {
        const entries = (entriesByDay.get(day) ?? []).filter((e) => e.kind === 'held' || !isCancelledAppointment(e.visit.status))
        const answers = entries.filter((e) => e.kind === 'visit' && needsMyAnswer(e.visit, now)).length
        const selected = day === selectedDay
        const isToday = day === today
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelectDay(day)}
            aria-pressed={selected}
            aria-label={`${lagosDate(day)}, ${entries.length} session${entries.length === 1 ? '' : 's'}`}
            className={cn(
              'flex flex-col items-center rounded-2xl py-2 transition-colors',
              selected ? 'bg-pt-primary text-pt-on-primary' : 'text-pt-ink hover:bg-pt-hover'
            )}
          >
            <span className={cn('text-[11px] font-medium', selected ? 'opacity-80' : 'text-pt-faint')}>
              {formatLagos(day, { weekday: 'narrow' })}
            </span>
            <span className={cn('text-base font-semibold tabular-nums', isToday && !selected && 'text-pt-accent-ink')}>
              {formatLagos(day, { day: 'numeric' })}
            </span>
            <span className="mt-1 flex h-1.5 items-center gap-0.5">
              {entries.slice(0, 3).map((e, i) => (
                <span
                  key={e.id}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    i < answers ? (selected ? 'bg-pt-accent' : 'bg-pt-ink') : selected ? 'bg-pt-on-primary/60' : 'bg-pt-faint'
                  )}
                />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Day agenda ───

type AgendaRow = { kind: 'entry'; at: number; entry: Entry } | { kind: 'free'; at: number; span: Span } | { kind: 'now'; at: number }

function TimeCell({ children }: { children: ReactNode }) {
  return <div className="w-[4.25rem] shrink-0 pt-2.5 text-right">{children}</div>
}

export function DayAgenda({
  day,
  entries,
  hours,
  now,
  onOpen,
  onBook,
}: {
  day: number
  entries: Entry[]
  hours: Span[] | null
  now: number
  onOpen: (entry: Entry) => void
  onBook: (start?: number) => void
}) {
  const practice = usePracticeMode()
  const today = startOfZonedDay(now)
  const past = day + DAY_MS <= now
  const active = entries.filter((e) => e.kind === 'held' || !isCancelledAppointment(e.visit.status))
  const answers = entries.filter((e) => e.kind === 'visit' && needsMyAnswer(e.visit, now)).length
  const free = useMemo(
    () => (hours && !past ? freeTime(hours, active, day === today ? nextQuarterHour(now) : day, 30) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hours, past, entries, day, today, Math.floor(now / (5 * MINUTE_MS))]
  )
  const freeMs = free.reduce((sum, span) => sum + span.end - span.start, 0)

  const rows: AgendaRow[] = [
    ...entries.map((entry) => ({ kind: 'entry' as const, at: entry.start, entry })),
    ...free.map((span) => ({ kind: 'free' as const, at: span.start, span })),
    ...(day === today ? [{ kind: 'now' as const, at: now }] : []),
  ].sort((a, b) => a.at - b.at || (a.kind === 'now' ? -1 : b.kind === 'now' ? 1 : 0))
  const dayOff = hours !== null && hours.length === 0

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-pt-ink">
            {dayHeading(day, now)}
            <InfoTip label="About this day">
              Your day in order. “Free” is time inside your working hours with nothing booked, at least 30 minutes long. Tap it to book a patient
              in.
            </InfoTip>
          </h2>
          <p className="text-[13px] text-pt-muted">{lagosDate(day)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-pt-sunken px-2.5 py-1 text-xs font-medium text-pt-ink">
          {active.length === 0 ? 'Nothing booked' : `${active.length} session${active.length === 1 ? '' : 's'}`}
        </span>
        {answers > 0 && (
          <span className="rounded-full bg-pt-primary px-2.5 py-1 text-xs font-semibold text-pt-on-primary">{answers} to answer</span>
        )}
        {freeMs > 0 && <span className="rounded-full bg-pt-green-bg px-2.5 py-1 text-xs font-medium text-pt-green-fg">{durationLabel(freeMs)} free</span>}
        {dayOff && <span className="rounded-full bg-pt-sunken px-2.5 py-1 text-xs font-medium text-pt-muted">Day off</span>}
      </div>

      {rows.filter((row) => row.kind !== 'now').length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-pt-line-strong px-4 py-8 text-center">
          {dayOff ? <CalendarOff className="h-6 w-6 text-pt-faint" /> : <CalendarPlus className="h-6 w-6 text-pt-faint" />}
          <p className="mt-2 text-sm font-semibold text-pt-ink">{dayOff ? 'Not a working day' : past ? 'Nothing happened this day' : 'Nothing booked'}</p>
          <p className="mt-1 max-w-[16rem] text-xs text-pt-muted">
            {dayOff
              ? 'You aren’t taking bookings this day. Change that in your working hours.'
              : past
                ? 'No sessions were booked.'
                : practice.isIndependent
                  ? 'Book one of your patients in.'
                  : 'Book a patient in, or share your booking page from Today.'}
          </p>
          {dayOff ? (
            <Button asChild size="sm" className={cn(secondaryButtonClass, 'mt-4 h-9')}>
              <Link href={WORKING_HOURS_HREF}>Working hours</Link>
            </Button>
          ) : (
            !past && (
              <Button size="sm" className={cn(primaryButtonClass, 'mt-4 h-9')} onClick={() => onBook()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New appointment
              </Button>
            )
          )}
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {rows.map((row) => {
            if (row.kind === 'now') {
              return (
                <li key="now" className="flex items-center gap-3 py-0.5" aria-label={`Now, ${lagosTime(now)}`}>
                  <span className="w-[4.25rem] shrink-0 text-right text-[11px] font-semibold tabular-nums text-pt-accent-ink">{lagosTime(now)}</span>
                  <span className="relative h-[2px] flex-1 rounded-full bg-pt-accent">
                    <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-pt-accent" />
                  </span>
                </li>
              )
            }
            if (row.kind === 'free') {
              const { span } = row
              return (
                <li key={`free-${span.start}`} className="flex gap-3">
                  <TimeCell>
                    <span className="text-[12px] tabular-nums text-pt-faint">{lagosTime(span.start)}</span>
                  </TimeCell>
                  <button
                    type="button"
                    onClick={() => onBook(span.start)}
                    className="group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border border-dashed border-pt-line-strong px-3 py-2 text-left transition-colors hover:border-pt-ink/40 hover:bg-pt-hover"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-pt-ink">Free · {durationLabel(span.end - span.start)}</span>
                      <span className="block text-[11px] text-pt-faint">until {lagosTime(span.end)}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-pt-sunken px-2 py-1 text-xs font-semibold text-pt-ink group-hover:bg-pt-surface">
                      <Plus className="h-3 w-3" />
                      Book
                    </span>
                  </button>
                </li>
              )
            }
            const { entry } = row
            const look = lookOf(entry, now)
            // Online visits show Join (greyed out until 15 minutes before); one awaiting your answer shows that first
            const join = entry.kind === 'visit' && !needsMyAnswer(entry.visit, now) ? videoJoin(entry.visit, now) : null
            const minutes = entry.kind === 'visit' ? minutesOf(entry.visit) : Math.round((entry.end - entry.start) / MINUTE_MS)
            return (
              <li key={entry.id} className={cn('flex gap-3', look.faded && 'opacity-60')}>
                <TimeCell>
                  <span className="block text-[13px] font-semibold tabular-nums text-pt-ink">{lagosTime(entry.start)}</span>
                  <span className="block text-[11px] tabular-nums text-pt-faint">{minutes} min</span>
                </TimeCell>
                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-l-[3px] border-pt-line bg-pt-surface px-3 py-2.5',
                    BAR_TONE[look.tone],
                    look.dashed && 'border-dashed'
                  )}
                >
                  <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 text-left focus-visible:outline-none">
                    <span
                      className={cn(
                        'block truncate text-sm font-semibold text-pt-ink',
                        entry.kind === 'visit' && isCancelledAppointment(entry.visit.status) && 'line-through'
                      )}
                    >
                      {entryTitle(entry)}
                    </span>
                    <span className="block truncate text-xs text-pt-muted">{entryDetail(entry)}</span>
                    <span className={cn('mt-1 inline-flex items-center gap-1 text-[11px] font-semibold', TEXT_TONE[look.tone])}>
                      {entry.kind === 'held' ? <Hourglass className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      {look.label}
                    </span>
                  </button>
                  {join && <JoinVideoButton join={join} className="h-8 px-2.5" />}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ─── A Rehabify booking waiting for payment ───

function HeldDrawer({ booking, onClose }: { booking: HeldBooking | null; onClose: () => void }) {
  const cancel = useMutationUntyped(scheduleApi.booking.cancelUnpaidMarketplaceBooking)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  // Keep the last booking on screen while the drawer slides away
  const last = useRef<HeldBooking | null>(null)
  if (booking) last.current = booking
  const shown = booking ?? last.current
  useEffect(() => setConfirming(false), [booking?.id])
  if (!shown) return null

  const withdraw = async () => {
    setBusy(true)
    try {
      await cancel({ bookingId: shown.id as Id<'marketplaceBookings'> })
      playSound('reject')
      toast.success('Withdrawn. The time is free again.')
      onClose()
    } catch (error) {
      playSound('error')
      toast.error(readableError(error, 'Couldn’t withdraw it. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PhysioDrawer
      open={booking !== null}
      onOpenChange={(next) => !next && onClose()}
      title={shown.patientName}
      description="Waiting for payment"
      footer={
        confirming ? (
          <div className="flex w-full items-center gap-2">
            <span className="flex-1 text-sm text-pt-muted">Withdraw this booking?</span>
            <Button className={cn(secondaryButtonClass, 'h-10')} disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button className="h-10 rounded-xl bg-pt-rose-bg px-4 text-pt-rose-fg shadow-none hover:brightness-95" disabled={busy} onClick={() => void withdraw()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw'}
            </Button>
          </div>
        ) : (
          <Button className={cn(secondaryButtonClass, 'h-10 w-full')} onClick={() => setConfirming(true)}>
            Withdraw booking
          </Button>
        )
      }
    >
      <div className="px-5 py-4">
        <p className="rounded-2xl bg-pt-sunken p-3.5 text-sm text-pt-muted">
          {shown.held && shown.holdExpiresAt
            ? `The patient has until ${lagosTime(shown.holdExpiresAt)} on ${formatLagos(shown.holdExpiresAt, { weekday: 'short', day: 'numeric', month: 'short' })} to pay. Once they do, it becomes a confirmed session here.`
            : 'The hold has ended. If the patient doesn’t pay soon, the time is released.'}
        </p>
        <div className="mt-2 divide-y divide-pt-line">
          <DetailRow icon={CalendarPlus} label="When">
            {lagosDate(shown.sessionDate)}, {lagosTime(shown.sessionDate)} · {shown.durationMinutes || 60} min
          </DetailRow>
          <DetailRow icon={shown.isOnline ? Video : MapPin} label="Service">
            {shown.serviceName}
            {shown.isOnline ? ' · Video call' : shown.travelZoneName ? ` · ${shown.travelZoneName}` : ''}
          </DetailRow>
          <DetailRow icon={Hourglass} label="You earn">
            {formatKobo(shown.payoutKobo)}
          </DetailRow>
        </div>
      </div>
    </PhysioDrawer>
  )
}

// ─── The page ───

export function CalendarView({ header }: { header: ReactNode }) {
  const openBooking = useBooking()
  const now = useNow(30_000)
  // Rehabify bookings waiting for payment: only for Rehabify Care patients (an independent physio may have kept some)
  const practice = usePracticeMode()
  const showHeld = practice.loaded
  const [weekStart, setWeekStart] = useState(() => weekStartOf(Date.now()))
  const [selectedDay, setSelectedDay] = useState(() => startOfZonedDay(Date.now()))
  const [showCancelled, setShowCancelled] = useState(false)
  const [held, setHeld] = useState<HeldBooking[]>([])
  const [schedule, setSchedule] = useState<WorkingSchedule | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState<HeldBooking | null>(null)

  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const result = useQueryUntyped(scheduleApi.appointments.getMyAppointments, {
    startDate: weekStart,
    endDate: weekStart + 7 * DAY_MS - 1,
    limit: 300,
  }) as PhysioAppointment[] | undefined
  // Keep the last week on screen while the next one loads, instead of blanking the grid
  const lastResult = useRef<PhysioAppointment[]>([])
  if (result) lastResult.current = result
  const appointments = result ?? lastResult.current

  const entriesByDay = useMemo(() => {
    const map = new Map<number, Entry[]>(days.map((day) => [day, []]))
    const add = (entry: Entry) => map.get(startOfZonedDay(entry.start))?.push(entry)
    for (const visit of appointments) {
      if (!showCancelled && isCancelledAppointment(visit.status)) continue
      add({ kind: 'visit', id: visit._id, start: visit.startTime, end: visit.endTime, visit })
    }
    for (const booking of showHeld ? held : []) {
      add({
        kind: 'held',
        id: booking.id,
        start: booking.sessionDate,
        end: booking.sessionDate + (booking.durationMinutes || 60) * MINUTE_MS,
        held: booking,
      })
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start)
    return map
  }, [appointments, held, showHeld, days, showCancelled])

  const hoursByDay = useMemo(() => new Map(days.map((day) => [day, workingHours(schedule, day)])), [days, schedule])

  // Hours shown: from just before the earliest start to just after the latest end, at least 9 hours
  const range = useMemo(() => {
    const starts: number[] = []
    const ends: number[] = []
    for (const day of days) {
      for (const span of [...(hoursByDay.get(day) ?? []), ...(entriesByDay.get(day) ?? [])]) {
        starts.push((span.start - day) / MINUTE_MS)
        ends.push(Math.min(24 * 60, (span.end - day) / MINUTE_MS))
      }
    }
    let start = starts.length ? Math.max(0, Math.floor(Math.min(...starts) / 60) - 1) : 8
    let end = ends.length ? Math.min(24, Math.ceil(Math.max(...ends) / 60) + 1) : 18
    if (end - start < 9) {
      end = Math.min(24, start + 9)
      start = Math.max(0, end - 9)
    }
    return { start, end }
  }, [days, hoursByDay, entriesByDay])

  const step = (direction: 1 | -1) => {
    setWeekStart((week) => week + direction * 7 * DAY_MS)
    setSelectedDay((day) => day + direction * 7 * DAY_MS)
  }
  const goToday = () => {
    setWeekStart(weekStartOf(Date.now()))
    setSelectedDay(startOfZonedDay(Date.now()))
  }

  const open = useCallback((entry: Entry) => {
    if (entry.kind === 'held') return setHeldOpen(entry.held)
    setSelectedId(entry.id)
    setDrawerOpen(true)
  }, [])
  const book = useCallback((start?: number) => openBooking(start ? { slot: { start } } : undefined), [openBooking])
  const selected = useMemo(() => appointments.find((apt) => apt._id === selectedId) ?? null, [appointments, selectedId])
  const thisWeek = weekStart === weekStartOf(now)

  return (
    <>
      {header}
      {showHeld && (
        <Quiet>
          <HeldSource onChange={setHeld} />
        </Quiet>
      )}
      <Quiet>
        <HoursSource onChange={setSchedule} />
      </Quiet>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <section className={cn(cardClass, 'min-w-0 overflow-hidden')}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pt-line px-3 py-3 sm:px-4">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl p-0 text-pt-ink hover:bg-pt-hover" onClick={() => step(-1)} aria-label="Previous week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl p-0 text-pt-ink hover:bg-pt-hover" onClick={() => step(1)} aria-label="Next week">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="ml-1 text-[15px] font-semibold tabular-nums text-pt-ink">{weekLabel(weekStart)}</h2>
              {!thisWeek && (
                <Button size="sm" className={cn(secondaryButtonClass, 'ml-1 h-8 px-3')} onClick={goToday}>
                  Today
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-xl px-2.5 text-xs font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink"
                onClick={() => setShowCancelled((value) => !value)}
                aria-pressed={showCancelled}
              >
                {showCancelled ? <Eye className="mr-1.5 h-3.5 w-3.5" /> : <EyeOff className="mr-1.5 h-3.5 w-3.5" />}
                {showCancelled ? 'Showing cancelled' : 'Cancelled hidden'}
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-8 rounded-xl px-2.5 text-xs font-medium text-pt-muted hover:bg-pt-hover hover:text-pt-ink">
                <Link href={WORKING_HOURS_HREF}>
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  Working hours
                </Link>
              </Button>
              <InfoTip label="What the colours mean">
                <span className="block font-semibold">Reading the calendar</span>
                <span className="mt-1.5 block">White is your working hours; shaded is outside them. Tap any empty time to book it.</span>
                <span className="mt-1.5 block">
                  <b>Black</b> needs your answer; <b>outlined</b> has passed and needs closing.
                </span>
                <span className="block">
                  <b className="text-pt-blue-fg">Blue, dashed</b> is waiting for the patient to accept.
                </span>
                <span className="block">
                  <b className="text-pt-green-fg">Green</b> is confirmed or done.
                </span>
                {showHeld && (
                  <span className="block">
                    <b>Dashed white</b> is a Rehabify Care booking waiting for payment.
                  </span>
                )}
                <span className="mt-1.5 block">Online sessions show a lime Join from 15 minutes before the start.</span>
              </InfoTip>
            </div>
          </div>

          <div className="px-2 py-3 lg:hidden">
            <WeekStrip days={days} entriesByDay={entriesByDay} now={now} selectedDay={selectedDay} onSelectDay={setSelectedDay} onSwipe={step} />
          </div>
          <div className="hidden lg:block">
            <WeekGrid
              days={days}
              entriesByDay={entriesByDay}
              hoursByDay={hoursByDay}
              range={range}
              now={now}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onOpen={open}
              onBook={book}
              loading={result === undefined}
            />
          </div>
        </section>

        <section className={cn(cardClass, 'p-4 sm:p-5 lg:sticky lg:top-24')}>
          <DayAgenda
            day={selectedDay}
            entries={entriesByDay.get(selectedDay) ?? []}
            hours={hoursByDay.get(selectedDay) ?? null}
            now={now}
            onOpen={open}
            onBook={book}
          />
        </section>
      </div>

      <AppointmentDrawer appointment={selected} open={drawerOpen && selected !== null} onOpenChange={setDrawerOpen} />
      <HeldDrawer booking={heldOpen} onClose={() => setHeldOpen(null)} />
    </>
  )
}
