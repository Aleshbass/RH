'use client'

/**
 * Admin › Learn › Leaderboard: each month's top 10 learners with how to reach them. The current
 * month is live; a closed month (frozen on the 1st) can be ticked off as contacted. Prizes are
 * agreed privately with winners, only if and when approved, so nothing about them is shown to
 * learners.
 */

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Crown, Loader2 } from '@/components/icons'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge } from '@/components/admin/ui'
import { pointsApi } from '@/components/learn/points/pointsApi'
import { cn } from '@/lib/utils'

export function LeaderboardAdmin() {
  const [month, setMonth] = useState<string | undefined>(undefined)
  const data = useQuery(pointsApi.adminMonthTop, month ? { month } : {})
  const mark = useMutation(pointsApi.adminMarkContacted)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Rehabify Learn"
        title="Leaderboard"
        description="Each month's top 10 learners and how to reach them. The current month updates live; on the 1st it closes and the top 10 get the Top 10 badge. Prize details stay private: agree them directly with winners, only if approved."
      />
      {data === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {data.months.map((m) => (
              <button
                key={m.month}
                type="button"
                onClick={() => setMonth(m.month)}
                className={cn(
                  'h-9 rounded-full border px-4 text-sm font-medium transition',
                  m.month === data.month
                    ? 'border-rh-ink bg-rh-ink text-white dark:border-white dark:bg-white dark:text-rh-ink'
                    : 'border-black/10 text-neutral-600 hover:border-black/25 dark:border-white/15 dark:text-neutral-300'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Panel
            title={`Top learners: ${data.monthLabel}`}
            description={data.closed ? 'Closed: these are the final standings.' : 'This month is still open: standings change as learners earn points.'}
            actions={data.closed ? <StatusBadge tone="green">Closed</StatusBadge> : <StatusBadge tone="amber">Live</StatusBadge>}
          >
            {data.top.length === 0 ? (
              <EmptyState icon={<Crown className="h-5 w-5" />} title="No points yet" description="Nobody has earned points in this month." />
            ) : (
              <ol className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {data.top.map((t) => (
                  <li key={t.userId} className="flex flex-wrap items-center gap-3 py-3">
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                        t.rank === 1 ? 'bg-[#f5c542] text-[#3d2c00]' : t.rank === 2 ? 'bg-[#d6dde3] text-[#29323a]' : t.rank === 3 ? 'bg-[#e0a46b] text-[#3b2410]' : 'bg-rh-canvas text-rh-ink dark:bg-white/10 dark:text-white'
                      )}
                    >
                      {t.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-rh-ink dark:text-white">{t.name}</p>
                      <p className="truncate text-xs text-neutral-500">
                        {t.tag}
                        {t.email ? ` · ${t.email}` : ''}
                        {t.phone ? ` · ${t.phone}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{t.points.toLocaleString('en-NG')} pts</span>
                    {data.closed && (
                      <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          checked={t.contacted}
                          onChange={async (e) => {
                            try {
                              await mark({ month: data.month, userId: t.userId, contacted: e.target.checked })
                            } catch {
                              toast.error('That didn’t save.')
                            }
                          }}
                          className="h-4 w-4 accent-[#00cd0f]"
                        />
                        Contacted
                      </label>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </>
      )}
    </AdminPage>
  )
}
