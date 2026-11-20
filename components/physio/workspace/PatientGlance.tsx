'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { HeartPulse } from '@/components/icons'
import { IconChip } from '@/components/physio/ui'
import { cn } from '@/lib/utils'
import type { Workspace } from './shared'

/**
 * The patient at first glance, in the header of the physio workspace and the clinic's record:
 * age, gender, date of birth and town under the name, and their past medical history. Clinics
 * asked for these back (Nov 2026): the date of birth was collected but age and gender weren't
 * shown anywhere you'd look first. Anything not recorded is simply left out.
 */

const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other' }

/** "3 Jan 1991" from a stored date of birth ("1991-01-03…" or a timestamp), or null. */
function bornOn(value: string | undefined) {
  const dob = value?.trim()
  if (!dob) return null
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob)
  // A calendar date: the same day wherever the viewer is (no time-zone shift)
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(Number(dob))
  return Number.isNaN(date.getTime()) ? null : format(date, 'd MMM yyyy')
}

function ageLabel(years: number | null | undefined) {
  if (typeof years !== 'number' || years < 0) return null
  if (years === 0) return 'Under 1 yr'
  return years === 1 ? '1 yr' : `${years} yrs`
}

/** "34 yrs · Female · Born 3 Jan 1991 · Lagos" under the patient's name. */
export function PatientFacts({ profile, className }: { profile: Workspace['profile']; className?: string }) {
  const born = bornOn(profile?.dateOfBirth)
  const facts = [
    ageLabel(profile?.ageYears),
    profile?.gender ? (GENDER_LABELS[profile.gender.toLowerCase()] ?? null) : null,
    born ? `Born ${born}` : null,
    profile?.city?.trim() || null,
  ].filter((fact): fact is string => Boolean(fact))
  if (facts.length === 0) return null
  return <p className={cn('text-sm font-medium text-pt-ink', className)}>{facts.join(' · ')}</p>
}

/**
 * The patient's past medical history, two lines with "More" for the rest. When none is recorded,
 * `onAdd` (where the viewer may edit the patient's details) opens the edit form.
 */
export function MedicalHistoryLine({
  history,
  onAdd,
  className,
}: {
  history: string | null | undefined
  onAdd?: () => void
  className?: string
}) {
  const text = history?.trim() || null
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  // "More" only when two lines aren't enough (measured, so it follows the screen width)
  useEffect(() => {
    const el = textRef.current
    if (!el || open) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, open])

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <IconChip icon={HeartPulse} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Medical history</p>
        {text ? (
          <>
            <p ref={textRef} className={cn('whitespace-pre-line break-words text-sm text-pt-ink', !open && 'line-clamp-2')}>
              {text}
            </p>
            {(clamped || open) && (
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="mt-0.5 text-xs font-semibold text-pt-ink underline-offset-2 hover:underline"
                aria-expanded={open}
              >
                {open ? 'Less' : 'More'}
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-pt-muted">
            No medical history recorded
            {onAdd && (
              <>
                {' · '}
                <button type="button" onClick={onAdd} className="font-semibold text-pt-ink underline-offset-2 hover:underline">
                  Add
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
