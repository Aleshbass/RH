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
 * shown anywhere you'd look first. Anything not recorded is left out, with an "Add" where the
 * viewer may edit the patient's details. Older patients' details are gathered from wherever they
 * were recorded (convex/helpers/patientGlance.ts), so they read the same as new ones.
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

/**
 * "34 yrs · Female · Born 3 Jan 1991 · Lagos" under the patient's name. `onAdd` (where the viewer
 * may edit the patient's details) offers to add an age or gender that isn't recorded.
 */
export function PatientFacts({ profile, onAdd, className }: { profile: Workspace['profile']; onAdd?: () => void; className?: string }) {
  const born = bornOn(profile?.dateOfBirth)
  const age = ageLabel(profile?.ageYears)
  const gender = profile?.gender ? (GENDER_LABELS[profile.gender.toLowerCase()] ?? null) : null
  const facts = [age, gender, born ? `Born ${born}` : null, profile?.city?.trim() || null].filter((fact): fact is string => Boolean(fact))
  const missing = [!age && !born ? 'age' : null, !gender ? 'gender' : null].filter(Boolean)
  if (facts.length === 0 && !onAdd) return null
  return (
    <p className={cn('text-sm font-medium text-pt-ink', className)}>
      {facts.join(' · ')}
      {onAdd && missing.length > 0 && (
        <span className="font-normal text-pt-muted">
          {facts.length > 0 ? ' · ' : ''}
          {missing.length === 2 ? 'No age or gender recorded' : `No ${missing[0]} recorded`}
          {' · '}
          <button type="button" onClick={onAdd} className="font-semibold text-pt-ink underline-offset-2 hover:underline">
            Add
          </button>
        </span>
      )}
    </p>
  )
}

/** "From the initial assessment, 3 Oct 2026": where a history not in their details was found. */
function historySourceLabel(from: NonNullable<Workspace['profile']>['medicalHistoryFrom']) {
  if (!from) return null
  if (from.kind === 'joy') return `From what they told Joy, ${format(from.date, 'd MMM yyyy')}`
  const note = from.noteType === 'initial_assessment' ? 'the initial assessment' : 'a clinical note'
  return `From ${note}, ${format(from.date, 'd MMM yyyy')}`
}

/**
 * The patient's past medical history, two lines with "More" for the rest. When none is recorded,
 * `onAdd` (where the viewer may edit the patient's details) opens the edit form.
 */
export function MedicalHistoryLine({
  history,
  from,
  onAdd,
  className,
}: {
  history: string | null | undefined
  /** Where it was found, when it isn't the patient's details (an assessment note, Joy's intake) */
  from?: NonNullable<Workspace['profile']>['medicalHistoryFrom']
  onAdd?: () => void
  className?: string
}) {
  const text = history?.trim() || null
  const source = text ? historySourceLabel(from) : null
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
            {source && (
              <p className="mt-0.5 text-xs text-pt-muted">
                {source}
                {onAdd && (
                  <>
                    {' · '}
                    <button type="button" onClick={onAdd} className="font-semibold text-pt-ink underline-offset-2 hover:underline">
                      Save to their details
                    </button>
                  </>
                )}
              </p>
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
