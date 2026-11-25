'use client'

/**
 * Team page: how far back the clinic's clinicians may add a visit that already happened (seen but
 * never booked), so they can write its notes. Clinic feedback, 24 Nov 2026: clinicians forget to
 * book some visits and need to document them afterwards; the owner decides how far back.
 * The owner can always add one from Appointments. Enforced in appointments.createAppointment.
 */

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { Check, Loader2 } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import { Panel } from '@/components/clinic/ui'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'
import { teamError } from './team-shared'

// Plain references: the generated api type is at TypeScript's depth limit
const ruleRef = makeFunctionReference<'query', Record<string, never>, { days: number; canChange: boolean } | null>('clinicTools:getPastVisitRule')
const setRuleRef = makeFunctionReference<'mutation', { days: number }, { days: number }>('clinicTools:setPastVisitRule')

const CHOICES: { days: number; label: string; hint: string }[] = [
  { days: 365, label: 'Up to a year back', hint: 'Any visit they forgot to book' },
  { days: 30, label: 'Up to 30 days back', hint: 'Last month’s visits' },
  { days: 7, label: 'Up to 7 days back', hint: 'This week and last' },
  { days: 0, label: 'Not allowed', hint: 'Only you add visits that already happened' },
]

export default function PastVisitsPanel() {
  const { requireFullAccess } = useClinicAccess()
  const rule = useQuery(ruleRef, {})
  const setRule = useMutation(setRuleRef)
  const [saving, setSaving] = useState<number | null>(null)

  const choose = async (days: number) => {
    if (!rule || rule.days === days || saving !== null) return
    if (!requireFullAccess('Change past visits')) return
    setSaving(days)
    try {
      await setRule({ days })
      playSound('success')
      toast.success(days === 0 ? 'Only you can add past visits now' : `Clinicians can add visits up to ${days === 365 ? 'a year' : `${days} days`} back`)
    } catch (error) {
      playSound('error')
      toast.error(teamError(error, 'Could not save that. Please try again.'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Panel
      title="Past visits"
      description="Saw a patient but didn’t book it? Clinicians add the visit afterwards, then write its note."
      info="Added from the clinician's diary or the patient's record (More › Add a past visit). It's saved as attended, and nothing is sent to the patient. Notes written later show “Written later” with the date."
    >
      <div className="px-5 pb-5 pt-3 sm:px-6">
        {rule === undefined ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : rule === null ? null : (
          <div role="radiogroup" aria-label="How far back clinicians can add visits" className="grid gap-2 sm:grid-cols-2">
            {CHOICES.map((choice) => {
              const selected = rule.days === choice.days
              return (
                <button
                  key={choice.days}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!rule.canChange || saving !== null}
                  onClick={() => void choose(choice.days)}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed',
                    selected ? 'border-pt-ink bg-pt-sunken' : 'border-pt-line hover:bg-pt-hover',
                    !rule.canChange && !selected && 'opacity-60'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      selected ? 'border-pt-ink bg-pt-ink text-pt-surface' : 'border-pt-line-strong'
                    )}
                    aria-hidden
                  >
                    {saving === choice.days ? <Loader2 className="h-3 w-3 animate-spin" /> : selected ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-pt-ink">{choice.label}</span>
                    <span className="block text-xs text-pt-muted">{choice.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {rule && !rule.canChange && <p className="mt-3 text-xs text-pt-muted">Only the clinic owner can change this.</p>}
      </div>
    </Panel>
  )
}
