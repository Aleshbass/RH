'use client'

/**
 * Book a course of sessions in one go: the physio booking drawer and the clinic's Book
 * appointment form. Pick a rhythm (or the care plan's), the days and how many sessions; the
 * preview shows every date, flags times the clinician is already booked and public holidays,
 * and lets you take dates out. The course carries on until it has the number of sessions asked for.
 *
 * Use: `const repeat = useRepeatPlan({...})`, render `<RepeatPlanner repeat={repeat} />`, and send
 * `repeat.bookStarts` as the booking's `repeatStartTimes`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { CalendarCheck, Check, Clock, Loader2, Minus, Plus, Repeat } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { lagosShortDate, lagosTime } from '@/convex/helpers/lagosTime'
import { Switch } from '@/components/ui/switch'
import {
  DEFAULT_SESSIONS,
  MAX_REPEAT_VISITS,
  WEEKDAYS,
  lagosWeekday,
  planRepeatVisits,
  presetDays,
  presetOf,
  type PlannedVisit,
  type RepeatPlan,
  type RepeatPreset,
} from '@/lib/repeatVisits'
import { cn } from '@/lib/utils'

const DAY = 86_400_000

// By name: the generated `api` type is at TypeScript's depth limit
const busyTimesRef = makeFunctionReference<
  'query',
  { physiotherapistId?: Id<'users'>; from: number; to: number },
  { start: number; end: number }[]
>('repeatPlanner:busyTimes')

type Rhythm = {
  frequencyLabel: string | null
  perWeek: 1 | 2 | 3 | null
  everyWeeks: 1 | 2 | null
  plannedSessions: number | null
  used: number
  remaining: number | null
}
const carePlanRhythmRef = makeFunctionReference<'query', { patientId: Id<'users'>; physiotherapistId?: Id<'users'> }, Rhythm | null>(
  'repeatPlanner:carePlanRhythm'
)

const PRESETS: { id: Exclude<RepeatPreset, 'custom'>; label: string; hint: string }[] = [
  { id: 'weekly', label: 'Weekly', hint: 'Once a week' },
  { id: 'twice', label: '2× a week', hint: 'Two days a week' },
  { id: 'thrice', label: '3× a week', hint: 'Three days a week' },
  { id: 'fortnightly', label: 'Every 2 weeks', hint: 'Every other week' },
]

const SHORT: Record<number, string> = Object.fromEntries(WEEKDAYS.map((w) => [w.day, w.label]))
const LETTER: Record<number, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S', 0: 'S' }

function presetFromRhythm(rhythm: Rhythm): Exclude<RepeatPreset, 'custom'> | null {
  if (rhythm.everyWeeks === 2) return 'fortnightly'
  if (rhythm.perWeek === 3) return 'thrice'
  if (rhythm.perWeek === 2) return 'twice'
  if (rhythm.perWeek === 1) return 'weekly'
  return null
}

/** Sessions to suggest from the care plan: what's left, else what's planned. */
function sessionsFromRhythm(rhythm: Rhythm) {
  const n = rhythm.remaining ?? rhythm.plannedSessions
  return n && n >= 2 ? Math.min(MAX_REPEAT_VISITS, n) : null
}

export type RepeatPlanState = ReturnType<typeof useRepeatPlan>

export function useRepeatPlan({
  firstStart,
  durationMinutes,
  physiotherapistId,
  patientId,
  available = true,
}: {
  /** The first visit's start, or null until a time is chosen */
  firstStart: number | null
  durationMinutes: number
  /** Whose diary to check for clashes */
  physiotherapistId: string | null
  /** For the care plan's suggested rhythm */
  patientId: string | null
  /** False where repeats aren't offered (e.g. a paid Rehabify session) */
  available?: boolean
}) {
  const [plan, setPlan] = useState<RepeatPlan>({ enabled: false, everyWeeks: 1, days: [], sessions: DEFAULT_SESSIONS, removed: [], keep: [] })
  const [usedPlan, setUsedPlan] = useState(false)
  const firstDay = firstStart !== null ? lagosWeekday(firstStart) : -1

  const rhythm = useQuery(
    carePlanRhythmRef,
    available && patientId ? { patientId: patientId as Id<'users'>, physiotherapistId: (physiotherapistId || undefined) as Id<'users'> | undefined } : 'skip'
  )
  const busy = useQuery(
    busyTimesRef,
    available && plan.enabled && firstStart !== null && physiotherapistId
      ? { physiotherapistId: physiotherapistId as Id<'users'>, from: firstStart, to: firstStart + 366 * DAY }
      : 'skip'
  )

  // Dates taken out belong to the old first visit: a new time starts them afresh
  useEffect(() => {
    setPlan((current) => (current.removed.length || current.keep.length ? { ...current, removed: [], keep: [] } : current))
  }, [firstStart])

  const visits = useMemo(
    () => (available && plan.enabled && firstStart !== null ? planRepeatVisits(firstStart, durationMinutes * 60_000, plan, busy ?? []) : []),
    [available, plan, firstStart, durationMinutes, busy]
  )
  const bookStarts = visits.filter((visit) => visit.state === 'book').map((visit) => visit.start)
  const active = available && plan.enabled && firstStart !== null

  const applyPreset = (preset: Exclude<RepeatPreset, 'custom'>) => {
    if (firstDay < 0) return
    setPlan((current) => ({ ...current, ...presetDays(preset, firstDay) }))
  }

  const applyCarePlan = () => {
    if (!rhythm || firstDay < 0) return
    const preset = presetFromRhythm(rhythm)
    const sessions = sessionsFromRhythm(rhythm)
    setPlan((current) => ({
      ...current,
      enabled: true,
      ...(preset ? presetDays(preset, firstDay) : {}),
      ...(sessions ? { sessions } : {}),
    }))
    setUsedPlan(true)
  }

  const setEnabled = (enabled: boolean) => {
    if (enabled && !plan.enabled && rhythm && !usedPlan && (presetFromRhythm(rhythm) || sessionsFromRhythm(rhythm))) {
      applyCarePlan()
      return
    }
    setPlan((current) => ({ ...current, enabled }))
  }

  return {
    available: available && firstStart !== null,
    active,
    plan,
    setPlan,
    setEnabled,
    applyPreset,
    applyCarePlan,
    usedPlan,
    rhythm: rhythm ?? null,
    firstStart,
    firstDay,
    visits,
    /** The later visits to book (send as repeatStartTimes) */
    bookStarts: active ? bookStarts : [],
    /** Visits booked in all, the first included */
    total: active ? 1 + bookStarts.length : 1,
    checkingDiary: active && Boolean(physiotherapistId) && busy === undefined,
    hasClinician: Boolean(physiotherapistId),
  }
}

function daysLabel(days: number[]) {
  const names = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => SHORT[d])
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function VisitChip({ visit, onToggle }: { visit: PlannedVisit; onToggle: () => void }) {
  const label = lagosShortDate(visit.start)
  if (visit.state === 'first') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-pt-primary px-3 py-1.5 text-xs font-semibold text-pt-on-primary">
        <Check className="h-3 w-3" strokeWidth={3} /> {label}
        <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-medium">First</span>
      </span>
    )
  }
  if (visit.state === 'busy') {
    return (
      <span
        title="Already booked at this time, so it's skipped"
        className="inline-flex items-center gap-1.5 rounded-full bg-pt-amber-bg px-3 py-1.5 text-xs font-medium text-pt-amber-fg"
      >
        <Clock className="h-3 w-3" /> {label}
        <span className="text-[10px] font-semibold uppercase tracking-wide">Busy</span>
      </span>
    )
  }
  const styles: Record<'book' | 'holiday' | 'removed', string> = {
    book: 'bg-pt-green-bg text-pt-green-fg hover:brightness-95',
    holiday: 'bg-pt-sunken text-pt-muted hover:text-pt-ink',
    removed: 'border border-dashed border-pt-line-strong text-pt-faint line-through hover:text-pt-muted',
  }
  const titles = {
    book: 'Tap to leave this date out',
    holiday: 'Public holiday, skipped. Tap to book it anyway',
    removed: 'Left out. Tap to put it back',
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      title={titles[visit.state]}
      aria-pressed={visit.state === 'book'}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95', styles[visit.state])}
    >
      {visit.state === 'book' && <Check className="h-3 w-3" strokeWidth={3} />}
      {label}
      {visit.state === 'holiday' && <span className="text-[10px] font-semibold uppercase tracking-wide">Holiday</span>}
    </button>
  )
}

/** The repeat panel. Renders nothing until the first visit's time is known. */
export function RepeatPlanner({ repeat, className }: { repeat: RepeatPlanState; className?: string }) {
  const { plan, setPlan, firstDay, visits, rhythm, firstStart } = repeat
  if (!repeat.available || firstStart === null) return null

  const preset = presetOf(plan, firstDay)
  const days = [...new Set([firstDay, ...plan.days])]
  const skipped = visits.filter((v) => v.state === 'busy' || v.state === 'holiday' || v.state === 'removed')
  const last = [...visits].reverse().find((v) => v.state === 'book' || v.state === 'first')
  const short = repeat.total < plan.sessions
  const suggestion =
    rhythm && (rhythm.frequencyLabel || rhythm.plannedSessions)
      ? [rhythm.frequencyLabel, rhythm.remaining !== null && rhythm.plannedSessions ? `${rhythm.remaining} of ${rhythm.plannedSessions} sessions left` : null]
          .filter(Boolean)
          .join(' · ')
      : null

  // Weeks of the course, for the preview
  const weeks: { label: string; visits: PlannedVisit[] }[] = []
  const firstMonday = firstStart - ((firstDay + 6) % 7) * DAY
  for (const visit of visits) {
    const week = Math.floor((visit.start - firstMonday) / (7 * DAY))
    const label = `Week ${week + 1}`
    const group = weeks.find((w) => w.label === label)
    if (group) group.visits.push(visit)
    else weeks.push({ label, visits: [visit] })
  }

  const toggleVisit = (visit: PlannedVisit) =>
    setPlan((current) => {
      if (visit.state === 'book') return { ...current, removed: [...current.removed, visit.start] }
      if (visit.state === 'removed') return { ...current, removed: current.removed.filter((t) => t !== visit.start) }
      if (visit.state === 'holiday') return { ...current, keep: [...current.keep, visit.start] }
      return current
    })

  const toggleDay = (day: number) => {
    if (day === firstDay) return
    setPlan((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day],
    }))
  }

  const setSessions = (n: number) => setPlan((current) => ({ ...current, sessions: Math.max(2, Math.min(MAX_REPEAT_VISITS, n)) }))

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-pt-line bg-pt-surface', className)}>
      <div className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            plan.enabled ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted'
          )}
        >
          <Repeat className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-pt-ink">Repeat this visit</p>
          <p className="truncate text-xs text-pt-muted">
            {plan.enabled
              ? `${repeat.total} sessions · ${daysLabel(days)}${plan.everyWeeks === 2 ? ', every 2 weeks' : ''} · ${lagosTime(firstStart)}`
              : suggestion
                ? `Care plan: ${suggestion}`
                : 'Book a course of sessions in one go'}
          </p>
        </div>
        <Switch checked={plan.enabled} onCheckedChange={repeat.setEnabled} aria-label="Repeat this visit" />
      </div>

      {plan.enabled && (
        <div className="space-y-5 border-t border-pt-line p-4">
          {suggestion && !repeat.usedPlan && (
            <div className="flex items-center gap-3 rounded-xl bg-pt-accent-soft p-3">
              <CalendarCheck className="h-4 w-4 shrink-0 text-pt-ink" />
              <p className="min-w-0 flex-1 text-xs text-pt-ink">
                <span className="font-semibold">Care plan:</span> {suggestion}
              </p>
              <button
                type="button"
                onClick={repeat.applyCarePlan}
                className="shrink-0 rounded-lg bg-pt-primary px-2.5 py-1 text-xs font-semibold text-pt-on-primary transition active:scale-95"
              >
                Use it
              </button>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pt-muted">How often</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESETS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={preset === option.id}
                  onClick={() => repeat.applyPreset(option.id)}
                  className={cn(
                    'rounded-xl border px-2 py-2.5 text-left transition-colors',
                    preset === option.id ? 'border-pt-ink bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className={cn('block text-[11px]', preset === option.id ? 'opacity-80' : 'text-pt-muted')}>{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-pt-muted">On</p>
              {preset === 'custom' && <span className="rounded-full bg-pt-sunken px-2 py-0.5 text-[11px] font-medium text-pt-muted">Your own days</span>}
            </div>
            <div className="flex justify-between gap-1.5">
              {WEEKDAYS.map(({ day, label }) => {
                const selected = days.includes(day)
                const locked = day === firstDay
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    aria-label={locked ? `${label}, the first visit's day` : label}
                    title={locked ? 'The first visit’s day' : undefined}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition active:scale-95',
                      selected ? 'bg-pt-primary text-pt-on-primary' : 'border border-pt-line-strong text-pt-ink hover:bg-pt-hover',
                      locked && 'cursor-default ring-2 ring-rh-lime ring-offset-2 ring-offset-pt-surface'
                    )}
                  >
                    {LETTER[day]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-pt-muted">Sessions</p>
              <p className="text-xs text-pt-muted">Including this one</p>
            </div>
            <div className="flex items-center gap-1 rounded-full border border-pt-line-strong p-1">
              <button
                type="button"
                aria-label="Fewer sessions"
                onClick={() => setSessions(plan.sessions - 1)}
                disabled={plan.sessions <= 2}
                className="flex h-8 w-8 items-center justify-center rounded-full text-pt-ink transition hover:bg-pt-hover disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center text-base font-semibold tabular-nums text-pt-ink">{plan.sessions}</span>
              <button
                type="button"
                aria-label="More sessions"
                onClick={() => setSessions(plan.sessions + 1)}
                disabled={plan.sessions >= MAX_REPEAT_VISITS}
                className="flex h-8 w-8 items-center justify-center rounded-full text-pt-ink transition hover:bg-pt-hover disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-pt-sunken p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-pt-ink">
                  {repeat.total} session{repeat.total === 1 ? '' : 's'} at {lagosTime(firstStart)}
                </p>
                {last && (
                  <p className="text-xs text-pt-muted">
                    {lagosShortDate(firstStart)} → {lagosShortDate(last.start)}
                  </p>
                )}
              </div>
              {repeat.checkingDiary ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-pt-muted">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking the diary
                </span>
              ) : skipped.length > 0 ? (
                <span className="text-right text-[11px] text-pt-muted">{skipped.length} skipped</span>
              ) : null}
            </div>
            <div className="mt-3 space-y-2.5">
              {weeks.map((week) => (
                <div key={week.label} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[11px] font-medium text-pt-faint">{week.label}</span>
                  {week.visits.map((visit) => (
                    <VisitChip key={visit.start} visit={visit} onToggle={() => toggleVisit(visit)} />
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-pt-muted">
              {!repeat.hasClinician
                ? 'Choose the clinician to check their diary for clashes.'
                : 'Tap a date to leave it out. Busy times and public holidays are skipped, and the course carries on so it still has every session.'}
            </p>
            {short && (
              <p className="mt-2 text-[11px] font-medium text-pt-amber-fg">
                Only {repeat.total} fit in the next year on these days. Add a day or take fewer sessions.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
