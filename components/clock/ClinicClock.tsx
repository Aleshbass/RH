'use client'

/**
 * Clock-in for clinicians on a clinic's team (convex/clinicAttendance.ts). Shows only once the
 * clinic owner has switched it on:
 * - ClockPill: the top bar of every physio-portal page (on shift for 3h 12m, or "Clock in").
 * - ClockHomeCard: on Today, with the hold-to-clock button right there.
 * - The drawer behind the pill: the same clock, plus this week's hours and recent shifts.
 * Reminders link to /dashboard/physiotherapist?clock=1, which opens the drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { faMugHot } from '@fortawesome/free-solid-svg-icons'
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Icon, Loader2, LocateFixed, MapPin, Play } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PatientDrawer, StatusBadge, accentButtonClass, cardClass, softButtonClass } from '@/components/patient/ui'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { formatLagos, lagosTime, zonedDateKey } from '@/convex/helpers/lagosTime'
import {
  addDays,
  breakMs,
  formatDistance,
  formatStopwatch,
  formatWorked,
  isOnSite,
  metresBetween,
  workedMs,
  CLOCK_REASON_MAX,
} from '@/convex/helpers/clinicClock'
import { HoldButton, buzz } from './HoldButton'
import { clockError, clockRefs, currentPosition, offsiteRequest, type MyClock, type Position, type ShiftView } from './clockApi'

type OnClock = Extract<NonNullable<MyClock>, { enabled: true }>

/** Re-renders every `ms`. */
function useTicker(ms: number, active = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms, active])
  return now
}

/** The signed-in clinician's clock, or null/undefined when there's nothing to show. */
export function useMyClock(): OnClock | null | undefined {
  const minute = useTicker(60_000)
  const today = zonedDateKey(minute)
  const data = useQuery(clockRefs.getMyClock, { today })
  if (data === undefined) return undefined
  return data && data.enabled ? data : null
}

type SiteFix =
  | { state: 'off' }
  | { state: 'ask' }
  | { state: 'locating' }
  | { state: 'denied' }
  | { state: 'unavailable' }
  | { state: 'ok'; position: Position; at: number; distanceM: number; onSite: boolean }

/**
 * Watches the phone's position while the clock is on screen, to say how far the clinic is.
 * With `mayAsk` false (the card on Today) it only watches if location is already allowed, so
 * opening the dashboard never pops a permission prompt; pressing the button asks.
 */
function useSiteFix(site: OnClock['site'], active: boolean, mayAsk: boolean): SiteFix {
  const [fix, setFix] = useState<SiteFix>({ state: site ? 'locating' : 'off' })
  const lat = site?.lat
  const lng = site?.lng
  const radius = site?.radiusM
  useEffect(() => {
    if (lat === undefined || lng === undefined || radius === undefined || !active) {
      setFix({ state: lat === undefined ? 'off' : 'ask' })
      return
    }
    if (!('geolocation' in navigator)) {
      setFix({ state: 'unavailable' })
      return
    }
    let watchId: number | null = null
    let cancelled = false
    const watch = () => {
      if (cancelled) return
      setFix({ state: 'locating' })
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          const position = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }
          const distanceM = metresBetween(position, { lat, lng })
          setFix({ state: 'ok', position, at: Date.now(), distanceM, onSite: isOnSite(distanceM, position.accuracyM, radius) })
        },
        (err) => setFix({ state: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
      )
    }
    if (mayAsk || !navigator.permissions?.query) {
      if (mayAsk) watch()
      else setFix({ state: 'ask' })
    } else {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((p) => {
          if (p.state === 'granted') watch()
          else if (!cancelled) setFix({ state: p.state === 'denied' ? 'denied' : 'ask' })
        })
        .catch(() => !cancelled && setFix({ state: 'ask' }))
    }
    return () => {
      cancelled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
    }
  }, [lat, lng, radius, active, mayAsk])
  return fix
}

const QUICK_REASONS = ['Home visit', 'Training or meeting', 'Working from another site', 'Location isn’t working']

const dayLabel = (dateKey: string) => formatLagos(new Date(`${dateKey}T12:00:00Z`).getTime(), { weekday: 'short' })
const shortDate = (ms: number) => formatLagos(ms, { weekday: 'short', day: 'numeric', month: 'short' }, 'en-NG')

function LocationChip({ clock, fix, shift }: { clock: OnClock; fix: SiteFix; shift: ShiftView | null }) {
  if (!clock.locationCheck) return null
  if (shift) {
    if (shift.offsite) {
      return (
        <StatusBadge tone="neutral">
          <MapPin className="h-3 w-3" />
          Clocked in away{shift.distanceM !== null ? ` · ${formatDistance(shift.distanceM)}` : ''}
        </StatusBadge>
      )
    }
    return (
      <StatusBadge tone="green">
        <MapPin className="h-3 w-3" />
        Clocked in at the clinic
      </StatusBadge>
    )
  }
  if (fix.state === 'ask') {
    return (
      <StatusBadge tone="neutral">
        <MapPin className="h-3 w-3" />
        Your location is checked when you clock in
      </StatusBadge>
    )
  }
  if (fix.state === 'locating') {
    return (
      <StatusBadge tone="neutral">
        <Loader2 className="h-3 w-3 animate-spin" />
        Finding where you are…
      </StatusBadge>
    )
  }
  if (fix.state === 'denied') {
    return (
      <StatusBadge tone="neutral">
        <AlertTriangle className="h-3 w-3" />
        Location is off for Rehabify
      </StatusBadge>
    )
  }
  if (fix.state === 'unavailable' || fix.state === 'off') {
    return (
      <StatusBadge tone="neutral">
        <LocateFixed className="h-3 w-3" />
        Can’t see your location yet
      </StatusBadge>
    )
  }
  return fix.onSite ? (
    <StatusBadge tone="green" dot>
      You’re at {clock.clinicName}
    </StatusBadge>
  ) : (
    <StatusBadge tone="ink">
      <MapPin className="h-3 w-3" />
      {formatDistance(fix.distanceM)} from the clinic
      {(fix.position.accuracyM ?? 0) > 200 ? ` (±${formatDistance(fix.position.accuracyM ?? 0)})` : ''}
    </StatusBadge>
  )
}

/** This week, Monday to Sunday: hours per day as small bars, today's growing live. */
function WeekStrip({ clock, now }: { clock: OnClock; now: number }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(clock.weekStart, i)), [clock.weekStart])
  const perDay = days.map((day) =>
    clock.shifts.filter((s) => s.dateKey === day).reduce((sum, s) => sum + workedMs(s, now), 0)
  )
  const total = perDay.reduce((a, b) => a + b, 0)
  const max = Math.max(8 * 3_600_000, ...perDay)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-pt-faint">This week</p>
        <p className="text-sm font-semibold tabular-nums text-pt-ink">{formatWorked(total)}</p>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map((day, i) => {
          const isToday = day === clock.today
          const future = day > clock.today
          const h = perDay[i]
          return (
            <div key={day} className="flex flex-col items-center gap-1.5" title={h ? `${dayLabel(day)}: ${formatWorked(h)}` : undefined}>
              <div className="flex h-14 w-full items-end overflow-hidden rounded-lg bg-pt-sunken">
                <div
                  className={cn('w-full rounded-lg transition-[height] duration-500', isToday ? 'bg-pt-accent' : 'bg-pt-ink/80 dark:bg-white/70')}
                  style={{ height: h ? `${Math.max(8, (h / max) * 100)}%` : 0 }}
                />
              </div>
              <span className={cn('text-[11px] font-medium', isToday ? 'text-pt-ink' : future ? 'text-pt-faint/60' : 'text-pt-faint')}>
                {dayLabel(day).slice(0, 2)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ShiftFlags({ shift }: { shift: ShiftView }) {
  return (
    <>
      {shift.lateMinutes !== null && <StatusBadge tone="neutral">Late {formatWorked(shift.lateMinutes * 60_000)}</StatusBadge>}
      {shift.offsite && <StatusBadge tone="neutral">Away</StatusBadge>}
      {shift.closedBy === 'auto' && <StatusBadge tone="ink">Closed for you</StatusBadge>}
      {shift.edited && <StatusBadge tone="blue">Corrected</StatusBadge>}
    </>
  )
}

function RecentShifts({ clock, now }: { clock: OnClock; now: number }) {
  const done = clock.shifts.filter((s) => s.clockOutAt !== null).slice(0, 6)
  if (done.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-pt-faint">Recent</p>
      <ul className="mt-2 divide-y divide-pt-line">
        {done.map((s) => (
          <li key={s._id} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-pt-ink">{shortDate(s.clockInAt)}</p>
              <p className="text-sm font-semibold tabular-nums text-pt-ink">{formatWorked(workedMs(s, now))}</p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-pt-muted">
              <span className="tabular-nums">
                {lagosTime(s.clockInAt)} – {s.clockOutAt ? lagosTime(s.clockOutAt) : '…'}
              </span>
              <ShiftFlags shift={s} />
            </div>
            {s.lastEdit && <p className="mt-1 text-xs text-pt-muted">Clinic note: {s.lastEdit.reason}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Clock in / break / clock out, with the reason step when the clinic asks for one. */
function useClockActions(clock: OnClock, fix: SiteFix) {
  const clockIn = useMutation(clockRefs.clockIn)
  const clockOut = useMutation(clockRefs.clockOut)
  const startBreak = useMutation(clockRefs.startBreak)
  const endBreak = useMutation(clockRefs.endBreak)
  const [busy, setBusy] = useState<null | 'in' | 'out' | 'break'>(null)
  const [done, setDone] = useState(false)
  const [offsite, setOffsite] = useState<{ distanceM: number | null; message: string } | null>(null)

  const flashDone = () => {
    setDone(true)
    window.setTimeout(() => setDone(false), 1400)
  }

  /** A fresh fix from the watcher, or ask the phone once. */
  const position = useCallback(async (): Promise<Position | undefined> => {
    if (!clock.locationCheck) return undefined
    if (fix.state === 'ok' && Date.now() - fix.at < 60_000) return fix.position
    return (await currentPosition()) ?? undefined
  }, [clock.locationCheck, fix])

  const doClockIn = useCallback(
    async (reason?: string) => {
      setBusy('in')
      try {
        const result = await clockIn({ position: await position(), ...(reason ? { reason } : {}) })
        setOffsite(null)
        flashDone()
        playSound('approve')
        buzz([15, 40, 15])
        toast.success(
          result.lateMinutes
            ? `You’re in · ${formatWorked(result.lateMinutes * 60_000)} after opening`
            : `You’re in${clock.firstName ? `, ${clock.firstName}` : ''}. Have a good day.`
        )
      } catch (error) {
        const ask = offsiteRequest(error)
        if (ask) {
          setOffsite(ask)
          buzz(30)
          return
        }
        playSound('error')
        toast.error(clockError(error, 'Could not clock you in. Try again.'))
      } finally {
        setBusy(null)
      }
    },
    [clockIn, position, clock.firstName]
  )

  const doClockOut = useCallback(async () => {
    setBusy('out')
    try {
      const result = await clockOut({ position: await position() })
      flashDone()
      playSound('success')
      buzz([15, 40, 15])
      toast.success(`Clocked out · ${formatWorked(result.workedMs)} today. See you next time.`)
    } catch (error) {
      playSound('error')
      toast.error(clockError(error, 'Could not clock you out. Try again.'))
    } finally {
      setBusy(null)
    }
  }, [clockOut, position])

  const toggleBreak = useCallback(async () => {
    const onBreak = clock.shift?.onBreak
    setBusy('break')
    try {
      await (onBreak ? endBreak({}) : startBreak({}))
      playSound('send')
      buzz(12)
      toast.success(onBreak ? 'Welcome back. Your clock is running again.' : 'Enjoy your break. Your clock is paused.')
    } catch (error) {
      toast.error(clockError(error, 'Could not update your break.'))
    } finally {
      setBusy(null)
    }
  }, [clock.shift?.onBreak, endBreak, startBreak])

  return { busy, done, offsite, setOffsite, doClockIn, doClockOut, toggleBreak }
}

function OffsiteReason({
  message,
  busy,
  onSubmit,
  onCancel,
}: {
  message: string
  busy: boolean
  onSubmit: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="w-full rounded-2xl border border-pt-line bg-pt-sunken p-4 text-left">
      <p className="flex items-start gap-2 text-sm font-medium text-pt-ink">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
        {message}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              reason === r ? 'border-pt-ink bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, CLOCK_REASON_MAX))}
        placeholder="Or write your own"
        className="mt-3 h-10 rounded-xl border-pt-line-strong bg-pt-surface"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && reason.trim()) onSubmit(reason.trim())
        }}
      />
      <div className="mt-3 flex gap-2">
        <Button className={cn(accentButtonClass, 'h-10 flex-1')} disabled={!reason.trim() || busy} onClick={() => onSubmit(reason.trim())}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Clock in with this reason
        </Button>
        <Button variant="ghost" className="h-10 rounded-xl text-pt-muted" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="mt-2 text-xs text-pt-muted">Your clinic owner sees the reason with your clock-in.</p>
    </div>
  )
}

/** The clock itself. `layout="card"` sits on Today; `layout="drawer"` is the full view. */
function ClockPanel({ clock, layout, active, onCollapse }: { clock: OnClock; layout: 'card' | 'drawer'; active: boolean; onCollapse?: () => void }) {
  const shift = clock.shift
  const now = useTicker(1000, active)
  const fix = useSiteFix(clock.site, active && !shift, layout === 'drawer')
  const { busy, done, offsite, setOffsite, doClockIn, doClockOut, toggleBreak } = useClockActions(clock, fix)

  const todayShifts = clock.shifts.filter((s) => s.dateKey === clock.today)
  const todayWorked = todayShifts.reduce((sum, s) => sum + workedMs(s, now), 0)
  const lastOut = todayShifts.find((s) => s.clockOutAt !== null)
  const onBreak = Boolean(shift?.onBreak)
  const openBreak = shift?.breaks.find((b) => b.endAt === undefined)
  const blocked = clock.locationCheck && clock.offsiteRule === 'block' && !shift && fix.state === 'ok' && !fix.onSite
  const hours = clock.hoursToday

  const hour = Number(formatLagos(now, { hour: '2-digit', hourCycle: 'h23' } as Intl.DateTimeFormatOptions))
  const greeting = `${hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'}, ${clock.firstName}`
  const status = shift
    ? onBreak
      ? { title: 'On a break', sub: `Since ${lagosTime(openBreak!.startAt)} · paused at ${formatWorked(workedMs(shift, now))}` }
      : {
          title: 'You’re clocked in',
          sub: `Since ${lagosTime(shift.clockInAt)}${shift.lateMinutes !== null ? ` · ${formatWorked(shift.lateMinutes * 60_000)} after opening` : ''}`,
        }
    : lastOut
      ? { title: 'Done for today', sub: `Clocked out at ${lagosTime(lastOut.clockOutAt!)} · ${formatWorked(todayWorked)} worked` }
      : {
          title: clock.firstName ? greeting : 'Not clocked in yet',
          sub: hours
            ? `${clock.clinicName} is open ${lagosTime(hours.openAt)} – ${lagosTime(hours.closeAt)} today`
            : `${clock.clinicName} has no opening hours today`,
        }

  const big = shift ? formatStopwatch(workedMs(shift, now)) : formatLagos(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as Intl.DateTimeFormatOptions)
  const seconds = shift ? null : formatLagos(now, { second: '2-digit' }).padStart(2, '0')

  const button = (
    <HoldButton
      mode={shift ? 'out' : 'in'}
      size={layout === 'drawer' ? 'lg' : 'md'}
      busy={busy === 'in' || busy === 'out'}
      busyLabel={busy === 'in' && clock.locationCheck ? 'Checking you’re at the clinic' : undefined}
      done={done}
      disabled={clock.readOnly || blocked || Boolean(offsite)}
      onConfirm={() => (shift ? doClockOut() : doClockIn())}
    />
  )

  const breakButton = shift && (
    <Button
      className={cn(onBreak ? accentButtonClass : softButtonClass, 'h-10 px-4')}
      disabled={busy !== null}
      onClick={toggleBreak}
    >
      {busy === 'break' ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : onBreak ? (
        <Play className="mr-2 h-3.5 w-3.5" />
      ) : (
        <Icon icon={faMugHot} className="mr-2 h-4 w-4" />
      )}
      {onBreak ? 'End break' : 'Take a break'}
    </Button>
  )

  const notes = (
    <>
      {clock.readOnly && <p className="text-xs text-pt-muted">Your clinic is paused on Rehabify, so clocking is paused too.</p>}
      {blocked && <p className="text-xs text-pt-muted">Your clinic only lets you clock in at the clinic. It unlocks when you get there.</p>}
      {clock.exempt && !shift && <p className="text-xs text-pt-muted">You’re not expected to clock in, but you can.</p>}
      {breakMs(shift?.breaks, now) > 0 && shift && !onBreak && (
        <p className="text-xs text-pt-muted">Breaks today: {formatWorked(breakMs(shift.breaks, now))}</p>
      )}
    </>
  )

  if (layout === 'card') {
    return (
      <section className={cn(cardClass, 'overflow-hidden p-5 sm:p-6')} aria-label="Clock-in">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-pt-faint">
                <Clock className="h-3.5 w-3.5" />
                Clock-in · {clock.clinicName}
              </p>
              {onCollapse && (
                <button
                  type="button"
                  onClick={onCollapse}
                  aria-expanded
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink sm:hidden"
                >
                  Hide <ChevronUp className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-pt-ink">{status.title}</h2>
              <p className="mt-0.5 text-sm text-pt-muted">{status.sub}</p>
            </div>
            <p className="text-4xl font-semibold tabular-nums tracking-tight text-pt-ink">
              {big}
              {seconds && <span className="ml-1 text-lg text-pt-faint">{seconds}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <LocationChip clock={clock} fix={fix} shift={shift} />
              {breakButton}
            </div>
            {notes}
          </div>
          <div className="relative flex shrink-0 flex-col items-center gap-3 sm:w-56">
            {onCollapse && (
              <button
                type="button"
                onClick={onCollapse}
                aria-expanded
                className="absolute -right-2 -top-2 hidden items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink sm:inline-flex"
              >
                Hide <ChevronUp className="h-3.5 w-3.5" />
              </button>
            )}
            {offsite ? (
              <OffsiteReason message={offsite.message} busy={busy === 'in'} onSubmit={(r) => doClockIn(r)} onCancel={() => setOffsite(null)} />
            ) : (
              button
            )}
          </div>
        </div>
        <div className="mt-6 border-t border-pt-line pt-5">
          <WeekStrip clock={clock} now={now} />
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 pb-2 text-center">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-pt-ink">{status.title}</h2>
        <p className="mt-0.5 text-sm text-pt-muted">{status.sub}</p>
      </div>
      <p className="text-5xl font-semibold tabular-nums tracking-tight text-pt-ink">
        {big}
        {seconds && <span className="ml-1 text-xl text-pt-faint">{seconds}</span>}
      </p>
      <LocationChip clock={clock} fix={fix} shift={shift} />
      {offsite ? (
        <OffsiteReason message={offsite.message} busy={busy === 'in'} onSubmit={(r) => doClockIn(r)} onCancel={() => setOffsite(null)} />
      ) : (
        button
      )}
      {breakButton}
      <div className="space-y-1">{notes}</div>
      <div className="w-full space-y-6 border-t border-pt-line pt-5 text-left">
        <WeekStrip clock={clock} now={now} />
        <RecentShifts clock={clock} now={now} />
      </div>
    </div>
  )
}

const CARD_PREF = 'rh-clock-card'

/** Folded clock on Today: one line with where they are in the day; tap to open the full clock. */
function ClockSummary({ clock, onExpand }: { clock: OnClock; onExpand: () => void }) {
  const shift = clock.shift
  const now = useTicker(30_000, Boolean(shift))
  const todayShifts = clock.shifts.filter((s) => s.dateKey === clock.today)
  const lastOut = todayShifts.find((s) => s.clockOutAt !== null)
  const worked = todayShifts.reduce((sum, s) => sum + workedMs(s, now), 0)
  const text = shift
    ? shift.onBreak
      ? `On a break · ${formatWorked(workedMs(shift, now))} so far`
      : `Clocked in since ${lagosTime(shift.clockInAt)} · ${formatWorked(workedMs(shift, now))}`
    : lastOut
      ? `Done for today · ${formatWorked(worked)} worked`
      : 'Not clocked in yet'
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-expanded={false}
      aria-label={`Clock-in: ${text}. Open the clock`}
      className={cn(
        cardClass,
        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 sm:px-5'
      )}
    >
      {shift && !shift.onBreak ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-pt-accent" aria-hidden />
      ) : shift ? (
        <Icon icon={faMugHot} className="h-4 w-4 shrink-0 text-pt-muted" />
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-pt-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Clock-in · {clock.clinicName}</span>
        <span className="block truncate text-sm font-semibold tabular-nums text-pt-ink">{text}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-pt-sunken px-2.5 py-1.5 text-xs font-semibold text-pt-ink">
        {shift ? 'Open' : lastOut ? 'Open' : 'Clock in'}
        <ChevronDown className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

/**
 * On Today: the clock, while the clinic uses clock-in. It can be folded to one line so it doesn't
 * push the day's patients down; the choice is remembered on this device. Folded by default once
 * they're clocked in, open while they still need to clock in.
 */
export function ClockHomeCard() {
  const clock = useMyClock()
  const [pref, setPref] = useState<'open' | 'folded' | null>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CARD_PREF)
      if (saved === 'open' || saved === 'folded') setPref(saved)
    } catch {
      // Private mode: not remembered
    }
  }, [])
  const choose = (next: 'open' | 'folded') => {
    setPref(next)
    try {
      localStorage.setItem(CARD_PREF, next)
    } catch {
      // Private mode: not remembered
    }
  }
  if (!clock) return null
  const folded = pref ? pref === 'folded' : Boolean(clock.shift)
  return folded ? (
    <ClockSummary clock={clock} onExpand={() => choose('open')} />
  ) : (
    <ClockPanel clock={clock} layout="card" active onCollapse={() => choose('folded')} />
  )
}

/**
 * Top bar: how long they've been in (or "Clock in"); opens the full clock. Hidden until the
 * clinic switches clock-in on.
 */
export function ClockPill() {
  const clock = useMyClock()
  const [open, setOpen] = useState(false)
  const now = useTicker(30_000, Boolean(clock?.shift))

  // Reminders open the clock: /dashboard/physiotherapist?clock=1
  useEffect(() => {
    if (!clock) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('clock') !== '1') return
    setOpen(true)
    params.delete('clock')
    const rest = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
  }, [clock])

  if (!clock) return null
  const shift = clock.shift
  const label = shift ? (shift.onBreak ? 'On break' : formatWorked(workedMs(shift, now))) : 'Clock in'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={shift ? `Clocked in, ${label}. Open clock` : 'Clock in'}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 active:scale-95',
          shift && !shift.onBreak
            ? 'border-transparent bg-pt-green-bg text-pt-green-fg'
            : shift
              ? 'border-transparent bg-pt-sunken text-pt-ink'
              : 'border-pt-line bg-pt-surface text-pt-ink hover:bg-pt-hover'
        )}
      >
        {shift && !shift.onBreak ? (
          <span className="h-2 w-2 rounded-full bg-pt-accent" aria-hidden />
        ) : shift ? (
          <Icon icon={faMugHot} className="h-3.5 w-3.5" />
        ) : (
          <Clock className="h-3.5 w-3.5" />
        )}
        <span>{label}</span>
      </button>
      <PatientDrawer
        open={open}
        onOpenChange={setOpen}
        title="Clock-in"
        description={`${clock.clinicName} · ${formatLagos(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }, 'en-NG')}`}
      >
        <ClockPanel clock={clock} layout="drawer" active={open} />
      </PatientDrawer>
    </>
  )
}
