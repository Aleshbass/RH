'use client'

import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ArrowRight, BadgeCheck, Quote, Star } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'

type Proof = {
  outcomes: {
    scored: number
    baselineMedian: number | null
    latestMedian: number | null
    meaningfulPct: number | null
    sessionsMedian: number | null
    ratingAverage: number | null
    ratingCount: number
  } | null
  quotes: {
    id: string
    quote: string
    firstName: string
    area: string | null
    rating: number | null
    painFrom: number | null
    painTo: number | null
    at: number
  }[]
} | null

// Plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const proofRef = makeFunctionReference<'query', { physiotherapistId: Id<'users'> }, Proof>('outcomes:getPublicProof')

/**
 * "Outcomes & patient feedback" on a physio's public pages: their typical pain change (only when
 * they chose to show it, from 5+ finished courses) and words patients agreed to share. Shows
 * nothing until there's something real.
 */
export function PublicProof({ physiotherapistId, className }: { physiotherapistId: Id<'users'>; className?: string }) {
  const proof = useQuery(proofRef, { physiotherapistId })
  if (!proof) return null
  const o = proof.outcomes
  return (
    <section className={cn('rounded-2xl border border-rh-ink/10 bg-white p-5 sm:p-6', className)}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-rh-ink">
        Outcomes & patient feedback
        <BadgeCheck className="h-4 w-4" />
      </h2>
      <p className="mt-1 text-sm text-rh-ink/60">From patients’ own scores and words, collected by Rehabify. Never edited.</p>

      {o && o.baselineMedian !== null && o.latestMedian !== null && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-rh-ink p-4 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Typical pain (0–10)</p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-semibold tabular-nums">
              {o.baselineMedian}
              <ArrowRight className="h-5 w-5 opacity-50" />
              <span className="text-rh-lime">{o.latestMedian}</span>
            </p>
          </div>
          {o.meaningfulPct !== null && (
            <div className="rounded-2xl bg-rh-canvas p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-ink/60">Clearly better</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-rh-ink">{o.meaningfulPct}%</p>
            </div>
          )}
          {o.ratingAverage !== null && (
            <div className="rounded-2xl bg-rh-canvas p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-ink/60">Patient rating</p>
              <p className="mt-1 flex items-center gap-1.5 text-3xl font-semibold tabular-nums text-rh-ink">
                {o.ratingAverage}
                <Star className="h-5 w-5" />
              </p>
            </div>
          )}
          <p className="text-xs text-rh-ink/50 sm:col-span-3">
            Based on {o.scored} finished courses of care. “Clearly better” means pain down 2 points or more.
          </p>
        </div>
      )}

      {proof.quotes.length > 0 && (
        <ul className="mt-5 space-y-3">
          {proof.quotes.map((q) => (
            <li key={q.id} className="rounded-2xl bg-rh-canvas p-4">
              <p className="flex gap-2 text-[15px] leading-relaxed text-rh-ink">
                <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-rh-ink/40" />
                {q.quote}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rh-ink/60">
                <span className="font-semibold text-rh-ink">{[q.firstName, q.area].filter(Boolean).join(', ')}</span>
                {q.painFrom !== null && q.painTo !== null && (
                  <span>
                    Pain {q.painFrom} → {q.painTo}
                  </span>
                )}
                {q.rating !== null && (
                  <span className="inline-flex items-center gap-0.5">
                    {q.rating}
                    <Star className="h-3 w-3" />
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck className="h-3 w-3" /> Verified patient
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
