'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { StatusBadge, cardClass } from '@/components/admin/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import type { CaseloadResult } from './shared'

// The same free-time calculation the booking page and Joy use (convex/calendar/availability.ts)
const slotsRef = makeFunctionReference<
  'query',
  { physiotherapistId: Id<'users'>; startDate: number; endDate: number },
  { start: number; end: number; duration: number }[]
>('calendar/availability:getAvailableSlots')

const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const FORMAT_LABEL: Record<string, string> = { online: 'Video', home_visit: 'Home visits', clinic: 'Clinic' }
const sectionTitle = 'text-sm font-semibold text-rh-ink dark:text-white'
const muted = 'text-xs text-neutral-500 dark:text-neutral-400'

/** "09:00" → "9am", "13:30" → "1:30pm" */
function clock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

// Times are shown in Lagos time whatever the admin's own time zone
const TZ = 'Africa/Lagos'
const dayKey = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t)
const dayText = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(t)
export const lagosTime = (t: number) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(t)

/** Why a Rehabify physio isn't on Find a Physio or offered to Joy patients. */
function notLiveReasons(physio: CaseloadResult['physio']) {
  const reasons: string[] = []
  if (!physio.servesNetwork) reasons.push('Independent only')
  if (physio.approvalStatus !== 'approved') reasons.push('Not approved')
  if (!physio.listedOnMarketplace) reasons.push('Listing switched off')
  if (!physio.hasSchedule) reasons.push('No working hours set')
  if (physio.suspended) reasons.push('Suspended')
  return reasons
}

/**
 * When, how and where a physio works, and their next free times: what the care team needs to
 * pair a patient with them.
 */
export function WorkDetails({ data }: { data: CaseloadResult }) {
  const { physio } = data
  // Free times from two hours from now (booking notice) to a week ahead, fixed for this open drawer
  const [range] = useState(() => {
    const now = Date.now()
    return { startDate: now + 2 * 60 * 60 * 1000, endDate: now + 7 * 24 * 60 * 60 * 1000 }
  })
  const slots = useQuery(slotsRef, physio.hasSchedule ? { physiotherapistId: physio.userId as Id<'users'>, ...range } : 'skip')

  const freeByDay = useMemo(() => {
    const days: { key: string; label: string; times: number[] }[] = []
    for (const slot of [...(slots ?? [])].sort((a, b) => a.start - b.start)) {
      const key = dayKey(slot.start)
      const day = days.find((d) => d.key === key)
      if (day) day.times.push(slot.start)
      else days.push({ key, label: dayText(slot.start), times: [slot.start] })
    }
    return days
  }, [slots])

  const reasons = notLiveReasons(physio)
  const working = physio.weeklyHours.filter((d) => d.isAvailable && d.slots.length > 0)
  const areas = [...physio.coveredZones.map((z) => `${z.name} (${z.city})`), ...physio.serviceAreas]

  return (
    <section className={cn(cardClass, 'space-y-4 p-4')} aria-labelledby="work-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="work-title" className={sectionTitle}>
          When and how they work
        </h3>
        {physio.mode !== 'independent' && physio.mode !== 'clinic' && (
          physio.liveOnFindAPhysio ? (
            <StatusBadge tone="green">Can be matched</StatusBadge>
          ) : (
            <StatusBadge tone="amber">Not matched: {reasons.join(', ') || 'setup not finished'}</StatusBadge>
          )
        )}
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className={muted}>Sees patients by</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {physio.formats.length ? (
              physio.formats.map((f) => (
                <StatusBadge key={f} tone="teal">
                  {FORMAT_LABEL[f] ?? f}
                </StatusBadge>
              ))
            ) : (
              <span className="text-sm text-neutral-500">Not set</span>
            )}
          </dd>
        </div>
        <div>
          <dt className={muted}>Languages</dt>
          <dd className="mt-1 text-sm font-medium text-rh-ink dark:text-white">{physio.languages.length ? physio.languages.join(', ') : 'English'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className={muted}>Areas covered for home visits</dt>
          <dd className="mt-1 text-sm font-medium text-rh-ink dark:text-white">{areas.length ? areas.join(' · ') : physio.location ?? 'Not set'}</dd>
        </div>
      </dl>

      <div>
        <p className={muted}>Working hours (Lagos time){physio.sessionMinutes ? ` · ${physio.sessionMinutes}-minute sessions` : ''}</p>
        {!physio.hasSchedule ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">No working hours set yet, so they can't be booked.</p>
        ) : working.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">Every day is switched off.</p>
        ) : (
          <ul className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {physio.weeklyHours.map((day) => (
              <li key={day.dayOfWeek} className="flex gap-3">
                <span className="w-9 shrink-0 font-medium text-rh-ink dark:text-white">{DAY_NAME[day.dayOfWeek]}</span>
                <span className={day.isAvailable && day.slots.length ? 'text-rh-ink/80 dark:text-white/80' : 'text-neutral-400'}>
                  {day.isAvailable && day.slots.length ? day.slots.map((s) => `${clock(s.start)}–${clock(s.end)}`).join(', ') : 'Off'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {physio.timeOff.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Changes ahead:{' '}
            {physio.timeOff
              .map((o) => `${format(new Date(`${o.date}T12:00:00`), 'd MMM')} ${o.isAvailable ? o.slots.map((s) => `${clock(s.start)}–${clock(s.end)}`).join(', ') : 'off'}${o.reason ? ` (${o.reason})` : ''}`)
              .join(' · ')}
          </p>
        )}
      </div>

      {physio.hasSchedule && (
        <div>
          <p className={muted}>Free times in the next 7 days</p>
          {slots === undefined ? (
            <div className="mt-1.5 h-10 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
          ) : freeByDay.length === 0 ? (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">Fully booked or away for the next 7 days.</p>
          ) : (
            <ul className="mt-1.5 space-y-1 text-sm">
              {freeByDay.slice(0, 5).map((day) => (
                <li key={day.key} className="flex gap-3">
                  <span className="w-24 shrink-0 font-medium text-rh-ink dark:text-white">{day.label}</span>
                  <span className="text-rh-ink/80 dark:text-white/80">
                    {day.times.slice(0, 6).map(lagosTime).join(', ')}
                    {day.times.length > 6 ? ` +${day.times.length - 6} more` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
