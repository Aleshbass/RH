'use client'

import { useMemo } from 'react'
import { Video } from '@/components/icons'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { cn } from '@/lib/utils'
import { JoinVideoButton } from '@/components/physio/schedule/JoinVideoButton'
import { useNow, useTodaysVisits, videoJoin } from '@/components/physio/schedule/shared'

/**
 * The online session that's about to start (within 15 minutes) or in progress, with its live
 * Join link (rule: lib/videoJoin.ts). Reads today's visits with the same arguments as Home, so
 * the two share one subscription.
 */
function useJoinableSession(enabled: boolean) {
  const now = useNow(30_000)
  const today = useTodaysVisits(enabled)

  return useMemo(() => {
    const open = (today ?? [])
      .map((visit) => ({ visit, join: videoJoin(visit, now) }))
      .filter((row) => row.join.kind === 'open')
      .sort((a, b) => a.visit.startTime - b.visit.startTime)
    const first = open[0]
    return first && first.join.kind === 'open' ? { visit: first.visit, join: first.join } : null
  }, [today, now])
}

/**
 * A slim pill in the physio top bar while an online session is about to start or in progress:
 * "Session with Ada at 2:00 PM · Join". `inline` sits in the desktop top bar; `row` is a slim
 * full-width strip under the top bar on phones and tablets (part of the sticky header, so it
 * never covers the page).
 */
export function LiveSessionBanner({ enabled, layout, className }: { enabled: boolean; layout: 'inline' | 'row'; className?: string }) {
  const session = useJoinableSession(enabled)
  if (!session) return null

  const { visit, join } = session
  const first = visit.patient?.firstName || [visit.patient?.firstName, visit.patient?.lastName].filter(Boolean).join(' ') || 'your patient'
  const live = join.live
  const text = (
    <>
      {live && (
        <>
          <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rh-lime align-middle" />
          <span className="font-semibold">Now · </span>
        </>
      )}
      <span className={layout === 'row' ? 'hidden min-[400px]:inline' : undefined}>Session with </span>
      <span className="font-semibold">{first}</span> at {lagosTime(visit.startTime)}
    </>
  )

  if (layout === 'row') {
    return (
      <div className={cn('px-4 pb-2 sm:px-6', className)} role="status" aria-live="polite">
        <div className="flex items-center gap-2 rounded-2xl bg-rh-ink py-1.5 pl-3 pr-1.5 text-white dark:bg-white/[0.08] dark:ring-1 dark:ring-white/10">
          <Video className="h-3.5 w-3.5 shrink-0 text-white/70" />
          <p className="min-w-0 flex-1 truncate text-[13px]">{text}</p>
          <JoinVideoButton join={join} className="h-8 rounded-xl px-3" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-full bg-rh-ink py-1 pl-3.5 pr-1 text-white dark:bg-white/[0.08] dark:ring-1 dark:ring-white/10',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Video className="h-3.5 w-3.5 shrink-0 text-white/70" />
      <p className="min-w-0 truncate text-[13px]">{text}</p>
      <JoinVideoButton join={join} className="h-8 rounded-full px-3.5" />
    </div>
  )
}
