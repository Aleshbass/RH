'use client'

import { api } from '@/convex/_generated/api'
import { StatusBadge, cardClass } from '@/components/admin/ui'
import { JoyReadinessList, type JoyReadiness } from '@/components/physio/JoyReadinessCard'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

const root = api as unknown as Record<string, Record<string, unknown>>

/** Why Joy can or can't offer this physio to patients: the same checks Joy's matching makes. */
export function JoyMatching({ physioUserId }: { physioUserId: string }) {
  const readiness = useQueryUntyped(root.joyMatching.adminJoyMatchReadiness, { physioUserId }) as JoyReadiness | null | undefined
  if (!readiness) return null
  const missing = readiness.checks.filter((check) => check.required && !check.done)
  return (
    <section className={cn(cardClass, 'space-y-3 p-4')} aria-labelledby="joy-matching-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="joy-matching-title" className="text-sm font-semibold text-rh-ink dark:text-white">
          Joy matching
        </h3>
        {readiness.ready ? (
          <StatusBadge tone="green">Joy can offer them</StatusBadge>
        ) : (
          <StatusBadge tone="amber">Not offered by Joy: {missing.length} to fix</StatusBadge>
        )}
      </div>
      <JoyReadinessList readiness={readiness} linkFixes={false} />
    </section>
  )
}
