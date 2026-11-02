'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ArrowRight, CheckCircle2, Dumbbell } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { IconChip, cardClass } from '@/components/patient/ui'
import { NAV } from '@/components/patient/shell/navItems'
import { useTodayCarePlan } from '@/components/dashboard/patient/treatment/carePlanToday'
import { cn } from '@/lib/utils'

/**
 * Home: how much of today's care plan is done, from the treatment plan and home programmes
 * together, with one tap to My care plan. Nothing shows until a physio has set a plan or sent a
 * programme. (Not "Your plan": that is the Basic/Flex plan, YourPlanCard.)
 */
export function TodayCarePlanCard() {
  const user = useQuery(api.users.getMyUser) as { role?: string } | null | undefined
  const today = useTodayCarePlan(user?.role === 'patient')
  if (!today || (!today.hasPlan && today.programmeCount === 0)) return null

  const { done, total } = today
  const allDone = total > 0 && done >= total
  const summary =
    total === 0
      ? 'No exercises set for today. See your goals and plan.'
      : allDone
        ? `All ${total} exercises done today. Nice work.`
        : `${done} of ${total} exercises done today`

  return (
    <Link
      href={`${NAV.carePlan.href}#today`}
      className={cn(
        cardClass,
        'group block p-5 transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50 sm:p-6'
      )}
    >
      <div className="flex items-center gap-4">
        <IconChip icon={allDone ? CheckCircle2 : Dumbbell} tone="green" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight text-pt-ink">Today’s care plan</p>
          <p className="text-sm text-pt-muted">{summary}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-pt-muted group-hover:text-pt-ink">
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
      {total > 0 && (
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-pt-sunken"
          role="progressbar"
          aria-label="Exercises done today"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div className="h-full rounded-full bg-pt-accent transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
    </Link>
  )
}
