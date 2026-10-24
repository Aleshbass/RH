'use client'

import { useMemo, useState } from 'react'
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import { Download, KeyRound, Search, Settings, ShieldAlert, ShieldCheck, Clock } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AdminPage,
  EmptyState,
  FilterChips,
  IconChip,
  PageHeader,
  Panel,
  StatTile,
  Stagger,
  StaggerItem,
  StatusBadge,
  downloadCsv,
  inputClass,
  softButtonClass,
} from '@/components/admin/ui'
import {
  ACTIVITY_META,
  activityMeta,
  roleLabel,
  type ActivityCategory,
  type ActivityLogsResult,
  type SecuritySummaryItem,
} from '@/components/admin/activityMeta'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

type CategoryFilter = 'all' | Exclude<ActivityCategory, 'other'>
type WindowKey = '1h' | '24h' | '7d' | '30d' | 'all'

const WINDOWS: { value: WindowKey; label: string; ms: number | null }[] = [
  { value: '1h', label: 'Last hour', ms: 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: 'all', label: 'All time', ms: null },
]

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(['security', 'admin', 'account', 'appointments', 'payments', 'notifications', 'errors'] as const).map((c) => ({
    value: c,
    label: ACTIVITY_META[c].label,
  })),
]

const PAGE = 100
const MAX_LIMIT = 1000

const SUMMARY_ICONS = {
  signIns: KeyRound,
  failedSignIns: ShieldAlert,
  roleChanges: ShieldCheck,
  adminChanges: Settings,
} as const

function statusTone(status: string | null) {
  if (!status) return null
  const s = status.toLowerCase()
  if (['success', 'completed', 'delivered', 'paid'].includes(s)) return 'green' as const
  if (['failed', 'error', 'declined'].includes(s)) return 'red' as const
  if (['pending', 'processing', 'retrying'].includes(s)) return 'amber' as const
  return 'neutral' as const
}

function dayLabel(ts: number) {
  if (isToday(ts)) return 'Today'
  if (isYesterday(ts)) return 'Yesterday'
  return format(ts, 'EEEE d MMMM yyyy')
}

export default function AdminActivityPage() {
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [windowKey, setWindowKey] = useState<WindowKey>('24h')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)

  // Fixed when the window changes, so the live query isn't re-created every render
  const sinceMs = useMemo(() => {
    const ms = WINDOWS.find((w) => w.value === windowKey)?.ms
    return ms ? Date.now() - ms : 0
  }, [windowKey])
  const windowLabel = WINDOWS.find((w) => w.value === windowKey)?.label ?? ''

  // Untyped reads: the generated api types sit at TypeScript's depth limit
  const adminApi = (api as unknown as { admin: Record<string, unknown> }).admin
  const logs = useQueryUntyped(adminApi.getUserActivityLogs, { limit, sinceMs, category }) as ActivityLogsResult | undefined
  const security = useQueryUntyped(adminApi.getSecurityEvents, { sinceMs }) as SecuritySummaryItem[] | undefined

  const term = search.trim().toLowerCase()
  const items = useMemo(() => {
    const all = logs?.items ?? []
    if (!term) return all
    return all.filter((i) =>
      [i.activity, i.userName, i.userEmail ?? '', i.summary, i.type, i.userRole].some((f) => f.toLowerCase().includes(term))
    )
  }, [logs, term])

  const groups = useMemo(() => {
    const out: { day: string; rows: typeof items }[] = []
    for (const item of items) {
      const day = dayLabel(item.timestamp)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(item)
      else out.push({ day, rows: [item] })
    }
    return out
  }, [items])

  const resetPaging = () => setLimit(PAGE)

  const exportCsv = () =>
    downloadCsv(
      `rehabify-activity-${windowKey}-${category}-${format(new Date(), 'yyyy-MM-dd-HHmm')}`,
      items.map((i) => ({
        time: new Date(i.timestamp).toISOString(),
        category: activityMeta(i.category).label,
        event: i.activity,
        event_type: i.type,
        user: i.userName,
        role: roleLabel(i.userRole),
        email: i.userEmail ?? '',
        status: i.status ?? '',
        details: i.summary,
      }))
    )

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Platform"
        title="Activity & audit log"
        description="Events the platform records, newest first. The list updates live."
        actions={
          <Button size="sm" className={cn(softButtonClass, 'h-9')} onClick={exportCsv} disabled={items.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {(security ?? []).map((s) => (
          <StaggerItem key={s.key}>
            <StatTile
              label={s.label}
              value={s.tracked ? `${s.count.toLocaleString()}${s.capped ? '+' : ''}` : '—'}
              hint={s.tracked ? windowLabel : 'None recorded yet'}
              icon={SUMMARY_ICONS[s.key as keyof typeof SUMMARY_ICONS] ?? ShieldCheck}
              tone={s.key === 'failedSignIns' && s.count > 0 ? 'attention' : s.key === 'failedSignIns' ? 'rose' : 'teal'}
            />
          </StaggerItem>
        ))}
        {!security &&
          [0, 1, 2, 3].map((i) => (
            <StaggerItem key={i}>
              <Skeleton className="h-[108px] w-full rounded-2xl" />
            </StaggerItem>
          ))}
      </Stagger>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips<CategoryFilter>
          value={category}
          onChange={(v) => {
            setCategory(v)
            resetPaging()
          }}
          options={CATEGORY_OPTIONS}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search loaded events"
              aria-label="Search loaded events"
              className={cn(inputClass, 'h-9 pl-9')}
            />
          </div>
          <Select
            value={windowKey}
            onValueChange={(v) => {
              setWindowKey(v as WindowKey)
              resetPaging()
            }}
          >
            <SelectTrigger className={cn(inputClass, 'h-9 sm:w-44')} aria-label="Time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Panel
        title={
          logs
            ? `${items.length.toLocaleString()}${!term && logs.hasMore ? '+' : ''} event${items.length === 1 ? '' : 's'}`
            : 'Events'
        }
        description={
          term
            ? `Matching “${search.trim()}” among ${logs?.items.length ?? 0} loaded events`
            : `${windowLabel}${category !== 'all' ? ` · ${ACTIVITY_META[category].label}` : ''}`
        }
        actions={
          <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rh-lime" />
            </span>
            Live
          </span>
        }
        bodyClassName="pb-2 pt-1"
      >
        {!logs ? (
          <div className="space-y-2 px-5 py-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Clock />}
            title={term ? 'No matching events' : 'No events in this window'}
            description={term ? 'Try another search, or load more events first.' : 'Try a longer time window or another category.'}
          />
        ) : (
          <div>
            {groups.map((group) => (
              <section key={group.day}>
                <h3 className="sticky top-16 z-10 bg-white/90 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 backdrop-blur dark:bg-rh-ink-2/90 dark:text-neutral-400">
                  {group.day}
                </h3>
                <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                  {group.rows.map((item) => {
                    const meta = activityMeta(item.category)
                    const tone = statusTone(item.status)
                    return (
                      <li key={item._id} className="flex items-start gap-3 px-5 py-3">
                        <IconChip icon={meta.icon} tone={meta.tone} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium text-rh-ink dark:text-white">{item.activity}</span>
                            <StatusBadge tone="neutral">{meta.label}</StatusBadge>
                            {tone && item.status && <StatusBadge tone={tone}>{item.status}</StatusBadge>}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {item.userName}
                            {item.userRole !== 'system' ? ` · ${roleLabel(item.userRole)}` : ''}
                            {item.userEmail ? ` · ${item.userEmail}` : ''}
                          </p>
                          {item.summary && (
                            <p className="mt-0.5 line-clamp-2 break-words text-xs text-neutral-600 dark:text-neutral-300">{item.summary}</p>
                          )}
                        </div>
                        <time
                          className="shrink-0 text-right text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
                          dateTime={new Date(item.timestamp).toISOString()}
                          title={formatDistanceToNow(item.timestamp, { addSuffix: true })}
                        >
                          {format(item.timestamp, 'HH:mm')}
                        </time>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {logs?.hasMore && (
          <div className="flex justify-center border-t border-black/[0.04] px-5 py-3 dark:border-white/[0.06]">
            {limit < MAX_LIMIT ? (
              <Button size="sm" className={softButtonClass} onClick={() => setLimit((l) => Math.min(l + PAGE, MAX_LIMIT))}>
                Load {PAGE} more
              </Button>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Showing the newest {MAX_LIMIT.toLocaleString()}. Narrow the time window or category to see older events.
              </p>
            )}
          </div>
        )}
      </Panel>
    </AdminPage>
  )
}
