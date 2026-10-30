'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { ArrowRight, MessageCircle, Quote, Share2, Star } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState, PageContainer, PageHeader, PageSkeleton, Panel, StatTile, StatusBadge, primaryButtonClass } from '@/components/physio/ui'
import { FeedbackCardComposer } from '@/components/outcomes/FeedbackCardComposer'
import type { Id } from '@/convex/_generated/dataModel'
import { globalChangeLabel } from '@/lib/outcomes/moments'
import { cn } from '@/lib/utils'

type Feedback = {
  rows: {
    checkId: Id<'outcomeChecks'>
    patientId: Id<'users'>
    patientName: string
    rating: number | null
    feedback: string | null
    globalChange: number | null
    canShare: boolean
    revoked: boolean
    shares: number
    at: number
    painFrom: number | null
    painTo: number | null
    sessions: number | null
  }[]
  ratingAverage: number | null
  shareable: number
} | null

// Plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const feedbackRef = makeFunctionReference<'query', Record<string, never>, Feedback>('outcomes:getMyFeedback')

/** Me → Feedback: what patients said at the end of care, and cards to share the words they allowed. */
export default function MyFeedbackPage() {
  const data = useQuery(feedbackRef, {})
  const [cardFor, setCardFor] = useState<Id<'outcomeChecks'> | null>(null)

  if (data === undefined) return <PageSkeleton />
  if (data === null) {
    return (
      <PageContainer>
        <EmptyState title="Feedback opens once your account is approved" />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="About me"
        title="Patient feedback"
        description="What patients say when care ends. Share the words they allow as a card that links to your booking page."
        info="At discharge Rehabify asks each patient for their final scores, a rating and a few words, and whether those words may be shared (first name and area only). Patients can take that back at any time; their card stops being available."
        back={{ href: '/dashboard/physiotherapist/me', label: 'About me' }}
      />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Average rating" value={data.ratingAverage !== null ? <span className="inline-flex items-center gap-1.5">{data.ratingAverage}<Star className="h-5 w-5" /></span> : '–'} />
        <StatTile label="Responses" value={data.rows.length} />
        <StatTile label="Can be shared" value={data.shareable} />
      </div>

      {data.rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<MessageCircle />}
            title="No feedback yet"
            description="When you complete care with a patient, Rehabify asks them how they are and how their care was. Their answers show here."
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.rows.map((r) => (
            <article key={r.checkId} className="flex flex-col rounded-3xl border border-pt-line bg-pt-surface p-5">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/dashboard/physiotherapist/patients/${r.patientId}`} className="text-sm font-semibold text-pt-ink hover:underline">
                  {r.patientName}
                </Link>
                {r.rating !== null && (
                  <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${r.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={cn('h-3.5 w-3.5', n <= r.rating! ? 'text-pt-ink' : 'text-pt-line-strong')} />
                    ))}
                  </span>
                )}
              </div>
              {r.feedback ? (
                <p className="mt-3 flex gap-2 text-[15px] leading-relaxed text-pt-ink">
                  <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-pt-faint" />
                  {r.feedback}
                </p>
              ) : (
                <p className="mt-3 text-sm text-pt-muted">{globalChangeLabel(r.globalChange) ?? 'Rated their care'}, no comment.</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs text-pt-muted">
                {r.painFrom !== null && r.painTo !== null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-pt-sunken px-2.5 py-0.5 font-semibold tabular-nums text-pt-ink">
                    Pain {r.painFrom}
                    <ArrowRight className="h-3 w-3 text-pt-faint" />
                    {r.painTo}
                  </span>
                )}
                {r.sessions ? <span>{r.sessions} sessions</span> : null}
                <span>{format(r.at, 'd MMM yyyy')}</span>
                {r.revoked ? (
                  <StatusBadge tone="neutral">Sharing withdrawn</StatusBadge>
                ) : r.canShare ? (
                  <StatusBadge tone="green">Can be shared</StatusBadge>
                ) : r.feedback ? (
                  <StatusBadge tone="neutral">Private</StatusBadge>
                ) : null}
              </div>
              {r.canShare && (
                <Button className={cn(primaryButtonClass, 'mt-4 h-10')} onClick={() => setCardFor(r.checkId)}>
                  <Share2 className="mr-1.5 h-4 w-4" />
                  {r.shares ? `Create card · shared ${r.shares}×` : 'Create card'}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}

      <FeedbackCardComposer checkId={cardFor} onClose={() => setCardFor(null)} />
    </PageContainer>
  )
}
