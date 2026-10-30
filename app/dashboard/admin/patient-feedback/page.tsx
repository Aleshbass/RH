'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Quote, Star } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge } from '@/components/admin/ui'
import type { Id } from '@/convex/_generated/dataModel'

type Row = {
  checkId: Id<'outcomeChecks'>
  quote: string
  firstName: string
  area: string | null
  physioName: string
  rating: number | null
  featured: boolean
  at: number
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, Row[]>('outcomes:adminShareableFeedback')
const featureRef = makeFunctionReference<'mutation', { checkId: Id<'outcomeChecks'>; featured: boolean }, { featured: boolean }>(
  'outcomes:adminSetFeatured'
)

/**
 * Patients' words they agreed Rehabify may share (first name and area only), from their final
 * scores at discharge. Featured ones appear on the home page. A patient who takes their consent
 * back disappears from here and from the site.
 */
export default function AdminPatientFeedbackPage() {
  const rows = useQuery(listRef, {})
  const setFeatured = useMutation(featureRef)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(row: Row, featured: boolean) {
    setBusy(row.checkId)
    try {
      await setFeatured({ checkId: row.checkId, featured })
      toast.success(featured ? 'Featured on the home page' : 'Removed from the home page')
    } catch {
      toast.error('Couldn’t change that.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Patients & Care"
        title="Patient feedback"
        description="Words patients agreed to share at the end of care. Feature the best on the home page; keep quotes short."
      />
      <Panel>
        {rows === undefined ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Quote />} title="Nothing to share yet" description="When patients finish care and agree to share their words, they appear here." />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {rows.map((r) => (
              <li key={r.checkId} className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[15px] leading-relaxed text-rh-ink dark:text-white">“{r.quote}”</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <span className="font-semibold">{[r.firstName, r.area].filter(Boolean).join(', ')}</span>
                    <span>Treated by {r.physioName}</span>
                    {r.rating !== null && (
                      <span className="inline-flex items-center gap-0.5">
                        {r.rating}
                        <Star className="h-3 w-3" />
                      </span>
                    )}
                    <span>{format(r.at, 'd MMM yyyy')}</span>
                    {r.quote.length > 180 && <StatusBadge tone="amber">Long for the home page</StatusBadge>}
                  </p>
                </div>
                <Switch
                  checked={r.featured}
                  disabled={busy === r.checkId}
                  onCheckedChange={(v) => void toggle(r, v)}
                  aria-label="Feature on the home page"
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  )
}
