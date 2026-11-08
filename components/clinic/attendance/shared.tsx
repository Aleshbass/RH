'use client'

import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/components/patient/ui'
import { cn } from '@/lib/utils'
import { formatLagos, zonedDateKey, zonedDateTimeToUtc, zonedTimeKey } from '@/convex/helpers/lagosTime'
import { formatDistance } from '@/convex/helpers/clinicClock'
import { MapPin } from '@/components/icons'
import { StatusBadge } from '@/components/clinic/ui'
import type { BoardPerson, ShiftView } from '@/components/clock/clockApi'

/**
 * Where a clock-in (or clock-out) happened against the clinic's pin, in words, or null when the
 * clinic doesn't check location. "At the clinic (40 m from your pin)".
 */
export function locationText(shift: ShiftView, out = false): string | null {
  const where = out ? shift.outLocation : shift.location ?? (shift.offsite ? 'away' : undefined)
  const distance = out ? shift.outDistanceM : shift.distanceM
  const metres = distance !== null && distance !== undefined ? ` (${formatDistance(distance)} from your pin)` : ''
  if (where === 'clinic') return `At the clinic${metres}`
  if (where === 'away') return distance !== null && distance !== undefined ? `Away: ${formatDistance(distance)} from the clinic` : 'Away from the clinic'
  if (where === 'unknown') return 'No location from their phone'
  return null
}

/** Green "At the clinic" badge for a clock-in at the clinic; the distance shows on hover. */
export function AtClinicBadge({ shift, out = false }: { shift: ShiftView; out?: boolean }) {
  if ((out ? shift.outLocation : shift.location) !== 'clinic') return null
  return (
    <span title={locationText(shift, out) ?? undefined}>
      <StatusBadge tone="green">
        <MapPin className="h-3 w-3" />
        {out ? 'Left from the clinic' : 'At the clinic'}
      </StatusBadge>
    </span>
  )
}

export const CLOCK_PAGE = '/dashboard/clinic/attendance'

/** Re-renders every `ms` (live durations). */
export function useTicker(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}

/** Today's Lagos date, updated when the day turns. */
export function useLagosToday() {
  return zonedDateKey(useTicker(60_000))
}

export const STATUS_ORDER: Record<BoardPerson['status'], number> = { working: 0, on_break: 1, out: 2, not_in: 3, off: 4 }

export function PersonAvatar({ name, imageUrl, status, size = 'md' }: { name: string; imageUrl: string | null; status?: BoardPerson['status']; size?: 'sm' | 'md' }) {
  return (
    <span className="relative shrink-0">
      <Avatar className={size === 'md' ? 'h-10 w-10' : 'h-8 w-8'}>
        {imageUrl && <AvatarImage src={imageUrl} alt="" />}
        <AvatarFallback className="bg-pt-sunken text-xs font-semibold text-pt-ink">{initials(name)}</AvatarFallback>
      </Avatar>
      {(status === 'working' || status === 'on_break') && (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-pt-surface',
            status === 'working' ? 'bg-pt-accent' : 'bg-pt-line-strong'
          )}
        />
      )}
    </span>
  )
}

/** "Mon 3 Nov" */
export const dayTitle = (dateKey: string) =>
  formatLagos(zonedDateTimeToUtc(dateKey, '12:00'), { weekday: 'short', day: 'numeric', month: 'short' }, 'en-NG')

/** Lagos date and time pieces for <input type="date|time">. */
export const dateInput = (ms: number) => zonedDateKey(ms)
export const timeInput = (ms: number) => zonedTimeKey(ms)
export const fromInputs = (date: string, time: string) => zonedDateTimeToUtc(date, time)

/** A CSV file download, built in the browser. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A row of choice chips (radius, grace minutes...). */
export function ChoiceChips<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
            value === option.value
              ? 'border-pt-ink bg-pt-primary text-pt-on-primary'
              : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
