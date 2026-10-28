'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { PhysioDrawer, fieldClass } from '@/components/physio/ui'
import { programError } from '@/components/exercise-programs/errors'
import type { Id } from '@/convex/_generated/dataModel'
import { INSTRUMENTS, instrumentDef } from '@/lib/questionnaires/instruments'
import { scoreResponse, scoreText } from '@/lib/questionnaires/scoring'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { QuestionnaireForm, type QuestionnaireInput } from './QuestionnaireForm'
import { questionnaireRefs } from './refs'

export type EnterTarget = { instrument?: string; requestId?: Id<'patientQuestionnaires'> }

/**
 * The physio types in a questionnaire: filled in on paper, or answered together at the visit.
 * Opened from a waiting request ("Fill in now") it completes that request.
 */
export function EnterQuestionnaireDrawer({
  target,
  onOpenChange,
  patientId,
  patientName,
  lastPsfs,
}: {
  target: EnterTarget | null
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  patientName: string
  /** Activities from the patient's last PSFS, offered to rate again */
  lastPsfs: string[]
}) {
  const enter = useMutation(questionnaireRefs.enterResponse)
  const [instrument, setInstrument] = useState<string | null>(null)
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!target) return
    setInstrument(target.instrument ?? null)
    setDate(format(new Date(), 'yyyy-MM-dd'))
  }, [target])

  const def = instrument ? instrumentDef(instrument) : undefined
  const today = format(new Date(), 'yyyy-MM-dd')

  const save = async (input: QuestionnaireInput) => {
    if (!def) return
    setSaving(true)
    try {
      // Today: now. An earlier day: midday on that day
      const completedAt = date === today ? undefined : new Date(`${date}T12:00`).getTime()
      await enter({ patientId, instrument: def.key, answers: input.answers, psfs: input.psfs, requestId: target?.requestId, completedAt })
      const total = scoreResponse(def, input).total
      playSound('success')
      toast.success(`${def.short} saved: ${scoreText(def, total)}`)
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PhysioDrawer
      open={target !== null}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title={def ? `${def.short} for ${patientName}` : 'Enter a questionnaire'}
      description={def ? def.name : 'Type in a form filled in on paper, or go through it together at the visit.'}
      className="sm:max-w-xl"
    >
      {!def ? (
        <ul className="space-y-2">
          {INSTRUMENTS.map((d) => (
            <li key={d.key}>
              <button
                type="button"
                onClick={() => setInstrument(d.key)}
                className="flex w-full flex-col items-start rounded-2xl border border-pt-line p-3.5 text-left transition-colors hover:bg-pt-hover"
              >
                <span className="text-sm font-semibold text-pt-ink">{d.short}</span>
                <span className="text-xs text-pt-muted">{d.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-5">
          {!target?.instrument && (
            <button
              type="button"
              onClick={() => setInstrument(null)}
              className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-pt-muted hover:text-pt-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Choose another
            </button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="questionnaire-date" className="text-sm font-medium text-pt-ink">
              Filled in on
            </label>
            <Input
              id="questionnaire-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className={cn(fieldClass, 'h-10 w-44')}
            />
          </div>
          <p className="text-sm text-pt-muted">{def.instructions}</p>
          <QuestionnaireForm
            key={def.key}
            def={def}
            mode="physio"
            initialPsfs={def.kind === 'psfs' ? lastPsfs.map((activity) => ({ activity, score: null })) : null}
            submitting={saving}
            submitLabel="Save"
            onSubmit={(input) => void save(input)}
          />
        </div>
      )}
    </PhysioDrawer>
  )
}
