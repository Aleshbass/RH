'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { Loader2, Mail, Phone, Star } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
  { id: 'responded', label: 'Answered', hint: 'Patients who told us how it went. Call anyone who asked, or is struggling.' },
  { id: 'sent', label: 'Waiting for answer', hint: 'We’ve asked; no reply yet. Consider a call after a few days.' },
  { id: 'scheduled', label: 'Coming up', hint: 'Care completed; we’ll ask automatically on the date shown.' },
  { id: 'closed', label: 'Closed', hint: 'Finished follow-ups.' },
]

const label = (value?: string) => (value ? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '')

function FollowUpCard({ row, status }: { row: Row; status: Status }) {
  const update = useMutation(api.physioCare.updateFollowUp)
  const [notes, setNotes] = useState(row.notes ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const needsCall = row.wantsCall || (row.rating !== undefined && row.rating <= 2) || row.recovery === 'worse'

  const act = async (kind: 'save' | 'close' | 'send') => {
    setBusy(kind)
    try {
      await update({ episodeId: row.episodeId, notes, close: kind === 'close', sendNow: kind === 'send' })
      toast.success(kind === 'close' ? 'Follow-up closed' : kind === 'send' ? 'Follow-up sent to the patient' : 'Notes saved')
    } catch (error) {
      toast.error((error as Error).message || 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className={cn('overflow-hidden rounded-2xl', needsCall && status === 'responded' && 'ring-2 ring-amber-300')}>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-900">{row.patient.name}</p>
              {needsCall && status === 'responded' && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Call them</Badge>}
              {row.outcome && <Badge variant="secondary">{label(row.outcome)}</Badge>}
            </div>
            <p className="text-sm text-gray-500">
              Treated by {row.physio.name}
              {row.completedAt ? ` · completed ${format(row.completedAt, 'd MMM yyyy')}` : ''}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {row.patient.phone && (
                <a href={`tel:${row.patient.phone}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                  <Phone className="h-3.5 w-3.5" />
                  {row.patient.phone}
                </a>
              )}
              {row.patient.email && (
                <a href={`mailto:${row.patient.email}`} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                  <Mail className="h-3.5 w-3.5" />
                  {row.patient.email}
                </a>
              )}
            </div>
          </div>
          <div className="shrink-0 text-sm text-gray-500 sm:text-right">
            {status === 'scheduled' && row.followUpDueAt && <p>Asks on {format(row.followUpDueAt, 'd MMM')}</p>}
            {status === 'sent' && row.followUpSentAt && <p>Asked {formatDistanceToNow(row.followUpSentAt, { addSuffix: true })}</p>}
            {row.respondedAt && <p>Answered {formatDistanceToNow(row.respondedAt, { addSuffix: true })}</p>}
          </div>
        </div>

        {row.rating !== undefined && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3">
            <span className="flex" aria-label={`${row.rating} of 5`}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={cn('h-4 w-4', i <= (row.rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
              ))}
            </span>
            {row.recovery && <span className="text-sm font-medium text-gray-800">{label(row.recovery)}</span>}
            {row.wantsCall && <span className="text-sm font-semibold text-amber-800">Asked for a call</span>}
            {row.comment && <p className="w-full text-sm italic text-gray-600">“{row.comment}”</p>}
          </div>
        )}

        {row.dischargeSummary && (
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer text-gray-500">Discharge summary</summary>
            <p className="mt-1 whitespace-pre-line">{row.dischargeSummary}</p>
          </details>
        )}

        {status !== 'closed' && (
          <div className="space-y-2">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notes from your call (only the Rehabify team sees these)"
              className="resize-none rounded-xl"
            />
            <div className="flex flex-wrap justify-end gap-2">
              {status === 'scheduled' && (
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act('send')}>
                  {busy === 'send' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Ask now
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act('save')}>
                {busy === 'save' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save notes
              </Button>
              <Button size="sm" className="bg-[#005b57] text-white hover:bg-[#00443e]" disabled={busy !== null} onClick={() => act('close')}>
                {busy === 'close' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Close
              </Button>
            </div>
          </div>
        )}
        {status === 'closed' && row.notes && <p className="text-sm text-gray-600">Notes: {row.notes}</p>}
      </CardContent>
    </Card>
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Care follow-ups</h1>
        <p className="mt-1 text-sm text-gray-500">
          After a physiotherapist completes a patient’s care, we ask the patient how they’re doing. Answers and anyone who needs a call show up here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm transition-colors',
              tab === t.id ? 'bg-[#005b57] font-medium text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500">{current.hint}</p>

      {rows === undefined ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center text-sm text-gray-500">Nothing here right now.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <FollowUpCard key={row.episodeId} row={row} status={tab} />
          ))}
        </div>
      )}
    </div>
  )
}
