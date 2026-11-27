'use client'

/**
 * The SOAP note at the end of a consult, written in the real Rehabify note editor (the one physios
 * use on the platform), so students learn the tool while they learn the note. It's marked against
 * the case's rubric and comes back with coaching (learnSimConsult:submitNote).
 */

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAction } from 'convex/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ClipboardList, Loader2, Send, X } from '@/components/icons'
import { ClinicalNoteEditor } from '@/components/physio/notes/ClinicalNoteEditor'
import { emptyDraft, type NoteDraft, type PendingHandle } from '@/components/physio/notes/progress'
import { measureDetail, measureResult, measureTitle, type ClinicalMeasure } from '@/convex/helpers/clinicalMeasures'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillOutline } from '../../shared'
import { consultApi, errorText, simPath, simTrack, type NoteSections, type SimAttempt } from '../simApi'
import { FindingsSheet, PlayerFrame } from '../v2/parts'

const measureLine = (m: ClinicalMeasure) => {
  const detail = measureDetail(m)
  return `${measureTitle(m)}${detail ? ` (${detail})` : ''}: ${measureResult(m)}`
}

/** The editor's draft as the four sections the marker reads (measures written out under O). */
export function draftSections(draft: NoteDraft): NoteSections {
  const measures = draft.measures.map(measureLine)
  return {
    S: draft.subjective.trim(),
    O: [draft.objective.trim(), ...measures].filter(Boolean).join('\n'),
    A: draft.assessment.trim(),
    P: [draft.treatment.trim(), draft.plan.trim()].filter(Boolean).join('\n'),
  }
}

export function ConsultNote({ attempt }: { attempt: SimAttempt }) {
  const router = useRouter()
  const submit = useAction(consultApi.submitNote)
  const c = attempt.case
  const [draft, setDraft] = useState<NoteDraft>(() => emptyDraft('initial_assessment'))
  const [sessionDate] = useState(() => Date.now())
  const [busy, setBusy] = useState<null | 'marking' | 'skipping'>(null)
  const [findingsOpen, setFindingsOpen] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const pending = useRef<PendingHandle>(null)
  const written = useMemo(() => Object.values(draftSections(draft)).some((s) => s.trim().length > 0), [draft])

  const handIn = async (skip: boolean) => {
    if (busy) return
    let full = draft
    if (!skip) {
      // A measure typed into an open form but not added yet still counts
      const extra = pending.current?.collect()
      if (extra?.kind === 'invalid') {
        toast.error(extra.message)
        return
      }
      if (extra?.kind === 'ok') full = { ...draft, measures: [...draft.measures, ...extra.measures] }
    }
    setBusy(skip ? 'skipping' : 'marking')
    try {
      await submit({ attemptId: attempt.attemptId, sections: draftSections(full), skip })
      simTrack('sim_consult_note', { case: c.slug, skipped: skip })
    } catch (err) {
      toast.error(errorText(err, 'That didn’t go through. Your note is still here; try again.'))
      setBusy(null)
    }
  }

  return (
    <PlayerFrame low>
      <div className="learn-fixed-dark flex h-14 shrink-0 items-center gap-1 bg-[rgb(8_16_15)] px-1.5 text-white">
        <button type="button" onClick={() => router.push(simPath(c.slug))} aria-label="Leave the case" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold leading-tight">Write your note</p>
          <p className="truncate text-[11px] leading-tight text-white/55">
            {c.patient.name}, {c.patient.age} · {c.setting}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFindingsOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold hover:bg-white/15"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Your findings
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-2xl bg-rh-ink/[0.05] px-4 py-3 text-[13px] leading-5 text-rh-ink/70">
          <p className={cn('text-[17px] text-rh-ink', displayFont)}>The note, as you’d write it on Rehabify</p>
          <p className="mt-1">
            Record what {c.patient.sex === 'F' ? 'she' : 'he'} told you, what you found and what you decided. Only write down what you actually asked or examined: made-up findings
            lose marks. Add an outcome measure if you took one.
          </p>
        </div>
        <div className="mt-4 rounded-2xl bg-white p-3 text-rh-ink shadow-sm sm:p-4">
          <ClinicalNoteEditor
            draft={draft}
            onChange={setDraft}
            notes={[]}
            measuredNotes={[]}
            sessionDate={sessionDate}
            condition={c.patient.presentingComplaint}
            typeEditable={false}
            pendingRef={pending}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-rh-ink/[0.08] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        {confirmSkip ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13px] leading-5 text-rh-ink/70">Without a note you can’t pass this case. Skip it anyway?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmSkip(false)} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
                Write it
              </button>
              <button type="button" onClick={() => void handIn(true)} disabled={Boolean(busy)} className={cn(pillInk, 'h-10 px-4 text-sm')}>
                {busy === 'skipping' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Skip
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setConfirmSkip(true)} disabled={Boolean(busy)} className="h-11 px-3 text-sm font-semibold text-rh-ink/55 hover:text-rh-ink">
              Skip
            </button>
            <button type="button" onClick={() => void handIn(false)} disabled={Boolean(busy) || !written} className={cn(pillInk, 'ml-auto h-11 px-6 text-[15px]')}>
              {busy === 'marking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Hand in my note
            </button>
          </div>
        )}
      </div>

      {busy && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[rgb(8_16_15/0.9)] px-8 text-center text-white">
          <Loader2 className="h-8 w-8 animate-spin text-rh-lime" />
          <p className={cn('text-[22px] leading-tight', displayFont)}>{busy === 'marking' ? 'Marking your note' : 'Wrapping up'}</p>
          <p className="max-w-xs text-sm leading-6 text-white/65">Reading your consultation back and writing your coaching. This takes a few seconds.</p>
        </motion.div>
      )}
      <FindingsSheet open={findingsOpen} onClose={() => setFindingsOpen(false)} findings={attempt.findings} />
    </PlayerFrame>
  )
}
