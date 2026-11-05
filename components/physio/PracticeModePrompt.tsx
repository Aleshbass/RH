'use client'

/**
 * Asks a physio who applied before the question existed whether they're a Rehabify physio or an
 * independent physio (or both), so our team (and the admin directory) can tell them
 * apart. Until they answer they keep working as before, on the Rehabify network.
 */
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { primaryButtonClass } from '@/components/physio/ui'
import type { SetupStatus } from '@/components/physio/SetupChecklist'
import { errorMessage } from '@/components/partners/portal/shared'
import { PRACTICE_CHOICES, type PracticeChoice } from '@/lib/practiceModes'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const setPracticeModeRef = makeFunctionReference<'mutation', { practiceMode: PracticeChoice }, { practiceMode: PracticeChoice }>(
  'physioSetup:setMyPracticeMode'
)

export function PracticeModePrompt({ setup }: { setup: SetupStatus | null | undefined }) {
  const save = useMutation(setPracticeModeRef)
  const [chosen, setChosen] = useState<PracticeChoice | null>(null)
  const [saving, setSaving] = useState(false)

  if (!setup || setup.isClinicMember || setup.practiceMode) return null

  const submit = async () => {
    if (!chosen) return
    setSaving(true)
    try {
      await save({ practiceMode: chosen })
      toast.success('Saved')
      playSound('success')
    } catch (error) {
      toast.error(errorMessage(error, 'Couldn’t save that. Please try again.'))
      playSound('error')
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby="practice-mode-title"
      className="rounded-2xl bg-white p-5 shadow-soft ring-2 ring-rh-lime dark:bg-rh-ink-2 sm:p-6"
    >
      <h2 id="practice-mode-title" className="text-base font-semibold tracking-tight text-rh-ink dark:text-white">
        Are you a Rehabify physio or an independent physio?
      </h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Choose how you work. You can change it later in Settings › How you work.
      </p>

      <div role="radiogroup" aria-label="How you work with Rehabify" className="mt-4 grid gap-3 lg:grid-cols-3">
        {PRACTICE_CHOICES.map((choice) => {
          const selected = chosen === choice.id
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChosen(choice.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2 dark:focus-visible:ring-rh-lime dark:focus-visible:ring-offset-rh-ink-2',
                selected
                  ? 'border-rh-ink dark:border-rh-lime'
                  : 'border-neutral-200 hover:border-neutral-400 dark:border-white/10 dark:hover:border-white/25'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  selected ? 'border-rh-ink dark:border-rh-lime' : 'border-neutral-300 dark:border-white/25'
                )}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-rh-ink dark:bg-rh-lime" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-rh-ink dark:text-white">{choice.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{choice.summary}</span>
              </span>
            </button>
          )
        })}
      </div>

      {chosen === 'independent' && (
        <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          You’ll be taken off Find a Physio and won’t be matched with new Rehabify Care patients. Patients you already see stay
          with you.
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!chosen || saving}
          className={cn(primaryButtonClass, 'rounded-full disabled:cursor-not-allowed disabled:opacity-60')}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </button>
      </div>
    </section>
  )
}
