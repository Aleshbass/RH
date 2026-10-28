'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ArrowRight } from '@/components/icons'
import { whenText } from './display'
import { questionnaireRefs } from './refs'

export const PATIENT_QUESTIONNAIRES = '/dashboard/patient/questionnaires'

/** On the patient's home screen while their physio is waiting for a questionnaire. */
export function PatientQuestionnaireBanner() {
  const pending = useQuery(questionnaireRefs.myPending, {})
  if (!pending || pending.length === 0) return null
  const first = pending[0]
  const minutes = pending.reduce((n, q) => n + q.minutes, 0)
  const due = first.dueAt ? (first.forVisit ? `before your visit ${whenText(first.dueAt)}` : `by ${whenText(first.dueAt)}`) : null
  const single = pending.length === 1
  return (
    <Link
      href={single ? `${PATIENT_QUESTIONNAIRES}/${first._id}` : PATIENT_QUESTIONNAIRES}
      className="group flex items-center gap-4 rounded-3xl bg-pt-primary p-5 text-pt-on-primary transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/60 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {single
            ? first.hasDraft
              ? 'Finish your questionnaire'
              : `${first.physioName} sent you a questionnaire`
            : `${pending.length} questionnaires from your physio`}
        </p>
        <p className="text-sm opacity-75">
          {pending.map((q) => q.short).join(', ')} · about {minutes} minute{minutes === 1 ? '' : 's'}
          {due ? ` · ${due}` : ''}
        </p>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pt-accent text-[#06210a]">
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
