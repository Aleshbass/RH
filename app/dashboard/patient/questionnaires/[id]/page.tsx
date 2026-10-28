'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Check, ClipboardList, Clock } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState, LoadingBlocks, PageContainer, PageHeader, Panel, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { PATIENT_QUESTIONNAIRES } from '@/components/questionnaires/PatientQuestionnaireBanner'
import { QuestionnaireForm, type QuestionnaireInput } from '@/components/questionnaires/QuestionnaireForm'
import { whenText } from '@/components/questionnaires/display'
import { questionnaireRefs } from '@/components/questionnaires/refs'
import { programError } from '@/components/exercise-programs/errors'
import type { Id } from '@/convex/_generated/dataModel'
import { instrumentDef } from '@/lib/questionnaires/instruments'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const HOME = '/dashboard/patient'

/** The patient fills in one questionnaire: a short intro, then a few questions per screen. */
export default function FillQuestionnairePage() {
  const { id } = useParams<{ id: string }>()
  const qid = id as Id<'patientQuestionnaires'>
  const q = useQuery(questionnaireRefs.getMine, { id: qid })
  const saveDraft = useMutation(questionnaireRefs.saveDraft)
  const submit = useMutation(questionnaireRefs.submit)
  const [started, setStarted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const def = q ? instrumentDef(q.instrument) : undefined

  if (done) {
    return (
      <PageContainer className="max-w-lg">
        <section className="flex flex-col items-center rounded-3xl bg-pt-green-bg px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pt-surface text-pt-green-fg">
            <Check className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-pt-ink">Thank you</h1>
          <p className="mt-2 max-w-sm text-sm text-pt-muted">
            Your answers have gone to {q?.physioName ?? 'your physio'}. They’ll go through them with you{q?.forVisit ? ' at your visit' : ''}.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild className={cn(primaryButtonClass, 'h-11 px-6')}>
              <Link href={HOME}>Back to home</Link>
            </Button>
            <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-11 px-6')}>
              <Link href={PATIENT_QUESTIONNAIRES}>Your questionnaires</Link>
            </Button>
          </div>
        </section>
      </PageContainer>
    )
  }

  if (q === undefined) {
    return (
      <PageContainer className="max-w-2xl">
        <LoadingBlocks rows={4} />
      </PageContainer>
    )
  }

  if (q === null || !def) {
    return (
      <PageContainer className="max-w-2xl">
        <EmptyState
          icon={ClipboardList}
          title="Questionnaire not found"
          description="It may have been withdrawn by your physio."
          action={
            <Button asChild className={cn(primaryButtonClass, 'h-11 px-6')}>
              <Link href={PATIENT_QUESTIONNAIRES}>Your questionnaires</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  if (q.status === 'completed') {
    return (
      <PageContainer className="max-w-2xl">
        <PageHeader title={def.name} back={{ href: PATIENT_QUESTIONNAIRES, label: 'Questionnaires' }} />
        <Panel>
          <p className="text-sm text-pt-muted">
            You sent this {q.completedAt ? `on ${format(q.completedAt, 'EEEE d MMMM')}` : 'already'}. Thank you!
          </p>
        </Panel>
      </PageContainer>
    )
  }

  const save = (input: QuestionnaireInput) => {
    // Quietly keep their place; if it fails they still have their answers on screen
    void saveDraft({ id: qid, ...input }).catch(() => undefined)
  }

  const send = async (input: QuestionnaireInput) => {
    setSubmitting(true)
    try {
      await submit({ id: qid, ...input })
      playSound('success')
      setDone(true)
      window.scrollTo({ top: 0 })
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t send your answers. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const showIntro = !started && !q.hasDraft

  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title={def.name} back={{ href: PATIENT_QUESTIONNAIRES, label: 'Questionnaires' }} />

      {showIntro ? (
        <Panel>
          <div className="space-y-4">
            <p className="text-[15px] text-pt-ink">{q.intro}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-pt-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                About {q.minutes} minute{q.minutes === 1 ? '' : 's'}
              </span>
              <span>From {q.physioName}</span>
              {q.dueAt && <span>{q.forVisit ? `Before your visit ${whenText(q.dueAt)}` : `By ${whenText(q.dueAt)}`}</span>}
            </div>
            {q.message && (
              <blockquote className="rounded-2xl bg-pt-sunken p-4 text-sm text-pt-ink">
                <span className="mb-1 block text-xs font-semibold text-pt-muted">{q.physioName} wrote</span>“{q.message}”
              </blockquote>
            )}
            {def.kind !== 'psfs' && <p className="text-sm text-pt-muted">{def.instructions}</p>}
            <p className="text-xs text-pt-faint">Your answers are saved as you go, so you can finish later. Only your care team sees them.</p>
            <Button className={cn(primaryButtonClass, 'h-12 w-full text-[15px]')} onClick={() => setStarted(true)}>
              Start
            </Button>
          </div>
        </Panel>
      ) : (
        <Panel>
          <QuestionnaireForm
            def={def}
            mode="patient"
            initialAnswers={q.draftAnswers}
            initialPsfs={q.draftPsfs}
            previousPsfs={q.previousPsfs}
            submitting={submitting}
            submitLabel="Send my answers"
            onProgress={save}
            onSubmit={(input) => void send(input)}
          />
        </Panel>
      )}
    </PageContainer>
  )
}
