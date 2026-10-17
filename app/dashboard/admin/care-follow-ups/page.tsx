'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { HeartPulse, Loader2, Mail, Phone, PhoneCall, Star } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { AdminPage, cardClass, EmptyState, FilterChips, PageHeader, primaryButtonClass, softButtonClass, StatusBadge } from '@/components/admin/ui'
import { errorMessage, insetClass, linkClass, LoadingBlock, textareaClass } from '@/components/admin/partners/shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Status = 'responded' | 'sent' | 'scheduled' | 'closed'

type Row = {
  episodeId: Id<'careEpisodes'>
  patient: { name: string; email?: string; phone?: string }
  physio: { name: string; email?: string }
  completedAt?: number
  outcome?: string
  dischargeSummary?: string
  followUpDueAt?: number
  followUpSentAt?: number
  rating?: number
  recovery?: string
  comment?: string
  wantsCall?: boolean
  respondedAt?: number
  notes?: string
}

const TABS: { id: Status; label: string; hint: string }[] = [
  { id: 'responded', label: 'Answered', hint: 'Patients who told us how it went. Call anyone who asked, or who is struggling.' },
  { id: 'sent', label: 'Waiting for answer', hint: 'We have asked and there is no reply yet. Consider a call after a few days.' },
  { id: 'scheduled', label: 'Coming up', hint: 'Care is complete; we ask automatically on the date shown.' },
  { id: 'closed', label: 'Closed', hint: 'Finished follow-ups.' },
]

const label = (value?: string) => (value ? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '')

const needsCall = (row: Row) => !!row.wantsCall || (row.rating !== undefined && row.rating <= 2) || row.recovery === 'worse'

function FollowUpCard({ row, status }: { row: Row; status: Status }) {
  const update = useMutation(api.physioCare.updateFollowUp)
  const [notes, setNotes] = useState(row.notes ?? '')
  const [busy, setBusy] = useState<'save' | 'close' | 'send' | null>(null)
  const flagged = needsCall(row) && status === 'responded'

  const act = async (kind: 'save' | 'close' | 'send') => {
    setBusy(kind)
    try {
      await update({ episodeId: row.episodeId, notes, close: kind === 'close', sendNow: kind === 'send' })
      if (kind !== 'save') playSound(kind === 'send' ? 'send' : 'success')
      toast.success(kind === 'close' ? 'Follow-up closed' : kind === 'send' ? 'Follow-up sent to the patient' : 'Notes saved')
    } catch (error) {
      playSound('error')
      toast.error(errorMessage(error, 'Something went wrong'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn(cardClass, 'space-y-4 p-5', flagged && 'ring-2 ring-amber-300/80 dark:ring-amber-500/40')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-rh-night dark:text-white">{row.patient.name}</p>
            {flagged && (
              <StatusBadge tone="amber" className="gap-1">
                <PhoneCall className="h-3 w-3" /> Call them
              </StatusBadge>
            )}
            {row.outcome && <StatusBadge tone="neutral">{label(row.outcome)}</StatusBadge>}
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Treated by {row.physio.name}
            {row.completedAt ? ` · completed ${format(row.completedAt, 'd MMM yyyy')}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {row.patient.phone && (
              <a href={`tel:${row.patient.phone}`} className={cn(linkClass, 'inline-flex items-center gap-1')}>
                <Phone className="h-3.5 w-3.5" />
                {row.patient.phone}
              </a>
            )}
            {row.patient.email && (
              <a href={`mailto:${row.patient.email}`} className={cn(linkClass, 'inline-flex items-center gap-1')}>
                <Mail className="h-3.5 w-3.5" />
                {row.patient.email}
              </a>
            )}
          </div>
        </div>
        <div className="shrink-0 text-sm text-neutral-500 dark:text-neutral-400 sm:text-right">
          {status === 'scheduled' && row.followUpDueAt && <p>Asks on {format(row.followUpDueAt, 'd MMM')}</p>}
          {status === 'sent' && row.followUpSentAt && <p>Asked {formatDistanceToNow(row.followUpSentAt, { addSuffix: true })}</p>}
          {row.respondedAt && <p>Answered {formatDistanceToNow(row.respondedAt, { addSuffix: true })}</p>}
        </div>
      </div>

      {row.rating !== undefined && (
        <div className={cn(insetClass, 'flex flex-wrap items-center gap-3')}>
          <span className="flex" aria-label={`${row.rating} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className={cn('h-4 w-4', i <= (row.rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300 dark:text-neutral-600')} />
            ))}
          </span>
          {row.recovery && <span className="text-sm font-medium text-rh-night dark:text-neutral-200">{label(row.recovery)}</span>}
          {row.wantsCall && <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Asked for a call</span>}
          {row.comment && <p className="w-full text-sm italic text-neutral-600 dark:text-neutral-300">&ldquo;{row.comment}&rdquo;</p>}
        </div>
      )}

      {row.dischargeSummary && (
        <details className="text-sm text-neutral-600 dark:text-neutral-300">
          <summary className="cursor-pointer text-neutral-500 dark:text-neutral-400">Discharge summary</summary>
          <p className="mt-1 whitespace-pre-line">{row.dischargeSummary}</p>
        </details>
      )}

      {status !== 'closed' ? (
        <div className="space-y-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notes from your call (only the Rehabify team sees these)"
            className={cn(textareaClass, 'resize-none')}
            aria-label={`Notes for ${row.patient.name}`}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {status === 'scheduled' && (
              <Button size="sm" variant="ghost" className={softButtonClass} disabled={busy !== null} onClick={() => act('send')}>
                {busy === 'send' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Ask now
              </Button>
            )}
            <Button size="sm" variant="ghost" className={softButtonClass} disabled={busy !== null} onClick={() => act('save')}>
              {busy === 'save' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save notes
            </Button>
            <Button size="sm" className={primaryButtonClass} disabled={busy !== null} onClick={() => act('close')}>
              {busy === 'close' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Close
            </Button>
          </div>
        </div>
      ) : (
        row.notes && <p className="text-sm text-neutral-600 dark:text-neutral-300">Notes: {row.notes}</p>
      )}
    </div>
  )
}

/**
 * How Rehabify follows up after care: when a physio completes a patient's care, the patient is
 * asked how they're doing after 1-4 weeks (email + in-app). Answers land here; anyone who asks
 * for a call, rates their care 2/5 or lower, or says they're worse is flagged for a call.
 */
export default function CareFollowUpsPage() {
  const [tab, setTab] = useState<Status>('responded')
  const rows = useQuery(api.physioCare.listFollowUps, { status: tab }) as Row[] | undefined
  const current = TABS.find((t) => t.id === tab)!
  const callCount = tab === 'responded' ? (rows?.filter(needsCall).length ?? 0) : 0
  // Flagged patients first on the Answered tab
  const ordered = tab === 'responded' && rows ? [...rows].sort((a, b) => Number(needsCall(b)) - Number(needsCall(a))) : rows

  return (
    <AdminPage className="max-w-5xl">
      <PageHeader
        eyebrow="Patients & Care"
        title="Care follow-ups"
        description="After a physiotherapist completes a patient's care, we ask the patient how they're doing. Answers, and anyone who needs a call, show up here."
      />

      <div className="space-y-2">
        <FilterChips value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.id, label: t.label }))} />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {current.hint}
          {callCount > 0 && <span className="font-medium text-amber-700 dark:text-amber-300"> {callCount} flagged for a call.</span>}
        </p>
      </div>

      {ordered === undefined ? (
        <LoadingBlock className="h-48" />
      ) : ordered.length === 0 ? (
        <div className={cardClass}>
          <EmptyState icon={<HeartPulse />} title="Nothing here right now" description="Follow-ups move through these tabs as patients finish care and reply." />
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map((row) => (
            <FollowUpCard key={row.episodeId} row={row} status={tab} />
          ))}
        </div>
      )}
    </AdminPage>
  )
}
