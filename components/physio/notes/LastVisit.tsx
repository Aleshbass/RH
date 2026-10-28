'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { ChevronDown, History } from '@/components/icons'
import { PainPill } from '@/components/physio/workspace/shared'
import { MeasureList } from './MeasureList'
import { NOTE_TYPE_LABELS, type ClinicalNote } from './progress'

type CheckIn = { painScore: number; createdAt: number } | null | undefined

function Summary({ note, checkIn }: { note: ClinicalNote | null; checkIn: CheckIn }) {
  return (
    <div className="space-y-3 text-sm">
      {note ? (
        <>
          <p className="text-xs text-pt-muted">
            {format(note.sessionDate, 'EEE d MMM yyyy')} · {NOTE_TYPE_LABELS[note.noteType] ?? 'Note'}
            {note.mine === false && note.authorName ? ` · ${note.authorName}` : ''}
          </p>
          {note.diagnosis && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Assessment</p>
              <p className="mt-0.5 whitespace-pre-line text-pt-ink">{note.diagnosis}</p>
            </div>
          )}
          {note.planForNextSession && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{note.noteType === 'discharge_summary' ? 'Home advice' : 'Plan'}</p>
              <p className="mt-0.5 line-clamp-6 whitespace-pre-line text-pt-ink">{note.planForNextSession}</p>
            </div>
          )}
          {!note.diagnosis && !note.planForNextSession && note.subjectiveAssessment && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Subjective</p>
              <p className="mt-0.5 line-clamp-4 whitespace-pre-line text-pt-ink">{note.subjectiveAssessment}</p>
            </div>
          )}
          {note.measures.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">Measures</p>
              <MeasureList measures={note.measures} compact />
            </div>
          )}
        </>
      ) : (
        <p className="text-pt-muted">This is the first note for this patient.</p>
      )}
      {checkIn && (
        <div className="flex flex-wrap items-center gap-2 border-t border-pt-line pt-3 text-xs text-pt-muted">
          Latest check-in <PainPill score={checkIn.painScore} />
          <span>{formatDistanceToNow(checkIn.createdAt, { addSuffix: true })}</span>
        </div>
      )}
    </div>
  )
}

/**
 * What happened last time, beside the note: the last plan, assessment and measures, and the
 * patient's latest pain check-in. A side rail on wide screens; a fold-out at the top otherwise.
 */
export function LastVisit({ note, checkIn, variant }: { note: ClinicalNote | null; checkIn: CheckIn; variant: 'rail' | 'fold' }) {
  if (variant === 'rail') {
    return (
      <aside className="rounded-2xl bg-pt-sunken p-4" aria-label="Last visit">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
          <History className="h-3.5 w-3.5 text-pt-muted" />
          Last visit
        </p>
        <Summary note={note} checkIn={checkIn} />
      </aside>
    )
  }
  if (!note && !checkIn) return null
  return (
    <details className="group rounded-2xl bg-pt-sunken">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-sm font-medium text-pt-ink [&::-webkit-details-marker]:hidden">
        <History className="h-3.5 w-3.5 text-pt-muted" />
        Last visit{note ? ` · ${format(note.sessionDate, 'd MMM')}` : ''}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-pt-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">
        <Summary note={note} checkIn={checkIn} />
      </div>
    </details>
  )
}
