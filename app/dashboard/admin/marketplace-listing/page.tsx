'use client'

import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { Search, Stethoscope } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { AdminPage, EmptyState, FilterChips, PageHeader, Panel, StatTile, StatusBadge, inputClass } from '@/components/admin/ui'
import { PhysioSheet } from '@/components/admin/physios/PhysioSheet'
import { TestAccountsPanel } from '@/components/admin/physios/TestAccountsPanel'

type ListingRow = {
  userId: string
  name: string
  email: string
  approvalStatus: string | null
  isLive: boolean
  reasons: string[]
}

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const listingHealthRef = makeFunctionReference<'query', Record<string, never>, ListingRow[]>(
  'physioSetup:getMarketplaceListingHealth'
)

type Filter = 'hidden' | 'live' | 'all'

export default function MarketplaceListingPage() {
  const rows = useQuery(listingHealthRef, {})
  // Who patients can book right now comes first
  const [filter, setFilter] = useState<Filter>('live')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const live = rows?.filter((row) => row.isLive).length ?? 0
  const hidden = (rows?.length ?? 0) - live

  // Most common blockers among approved physios who aren't live: what to chase first
  const blockers = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows ?? []) {
      if (row.isLive || row.approvalStatus !== 'approved') continue
      for (const reason of row.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (rows ?? []).filter((row) => {
      if (filter === 'live' && !row.isLive) return false
      if (filter === 'hidden' && row.isLive) return false
      return !term || row.name.toLowerCase().includes(term) || row.email.toLowerCase().includes(term)
    })
  }, [rows, filter, search])

  return (
    <AdminPage>
      <PageHeader
        title="Marketplace listing"
        description="Who patients can find on Find a Physio, and what's holding back everyone else. Open a physio to see their hours, areas and patients."
      />

      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Live on Find a Physio" value={live} />
            <StatTile label="Not listed" value={hidden} />
            <StatTile
              label="Approved but not live"
              value={rows.filter((row) => !row.isLive && row.approvalStatus === 'approved').length}
              hint="Usually unfinished setup"
            />
          </div>

          {blockers.length > 0 && (
            <Panel title="What approved physios are missing" description="Each physio can be missing more than one thing.">
              <ul className="divide-y divide-black/[0.05] px-5 pb-2 dark:divide-white/[0.06]">
                {blockers.map(([reason, count]) => (
                  <li key={reason} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-rh-ink dark:text-white">{reason}</span>
                    <span className="font-semibold tabular-nums text-rh-ink dark:text-white">{count}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <TestAccountsPanel />

          <Panel
            title="Physiotherapists"
            actions={
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or email"
                  className={`${inputClass} pl-9`}
                />
              </div>
            }
          >
            <div className="px-5 pb-3 pt-2">
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'live', label: 'Live', count: live },
                  { value: 'hidden', label: 'Not listed', count: hidden },
                  { value: 'all', label: 'All', count: rows.length },
                ]}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={<Stethoscope />} title="No physiotherapists here" />
            ) : (
              <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {visible.map((row) => (
                  <li key={row.userId}>
                    <button
                      type="button"
                      onClick={() => setOpenId(row.userId)}
                      className="flex w-full flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-rh-canvas sm:flex-row sm:items-start sm:justify-between sm:gap-6 dark:hover:bg-white/[0.03]"
                    >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-rh-ink underline-offset-2 hover:underline dark:text-white">{row.name}</p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{row.email}</p>
                    </div>
                    {row.isLive ? (
                      <StatusBadge tone="green">Live</StatusBadge>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5 sm:max-w-[60%] sm:justify-end">
                        {row.reasons.map((reason) => (
                          <li key={reason}>
                            <StatusBadge tone="amber">{reason}</StatusBadge>
                          </li>
                        ))}
                      </ul>
                    )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
      <PhysioSheet physioId={openId} preview={null} onClose={() => setOpenId(null)} />
    </AdminPage>
  )
}
