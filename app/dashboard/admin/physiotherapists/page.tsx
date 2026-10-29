'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Briefcase, Building2, ChevronRight, Download, HelpCircle, Layers, Search, Stethoscope, Store, Users, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminPage,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  Stagger,
  StaggerItem,
  StatusBadge,
  downloadCsv,
  inputClass,
  softButtonClass,
  type Tone,
} from '@/components/admin/ui'
import { PhysioSheet } from '@/components/admin/physios/PhysioSheet'
import {
  APPROVAL_LABEL,
  AccountBadges,
  MODE_LABEL,
  ModeChip,
  PersonAvatar,
  SOURCE_LABEL,
  SourceBar,
  SourceLegend,
  compact,
  physioDirectoryRef,
  sessionWhen,
  splitLabel,
  timeAgo,
  type ApprovalStatus,
  type DirectoryRow,
  type PhysioMode,
} from '@/components/admin/physios/shared'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { cn } from '@/lib/utils'

const BASE_PATH = '/dashboard/admin/physiotherapists'
const PAGE_SIZE = 100

type ModeFilter = 'all' | PhysioMode
type StatusFilter = 'all' | ApprovalStatus | 'suspended'
type SortKey = 'patients' | 'newest' | 'name'

const MODE_FILTERS: readonly ModeFilter[] = ['all', 'network', 'independent', 'both', 'clinic', 'unset']
const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'approved', 'pending_review', 'declined', 'not_submitted', 'suspended']
const SORTS: readonly SortKey[] = ['patients', 'newest', 'name']
const SORT_LABEL: Record<SortKey, string> = { patients: 'Most patients', newest: 'Newest', name: 'Name' }

// Wide screens: one row per physio in columns. Narrower: a stacked card (see PhysioRow).
const ROW_GRID =
  'xl:grid xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_16px] xl:items-center xl:gap-4'

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function PhysiotherapistsDirectory() {
  const router = useRouter()
  const pathname = usePathname() ?? BASE_PATH
  const searchParams = useSearchParams()

  // Every filter lives in the URL, so a view can be shared or bookmarked
  const mode = pick(searchParams?.get('mode'), MODE_FILTERS, 'all')
  const status = pick(searchParams?.get('status'), STATUS_FILTERS, 'all')
  const sort = pick(searchParams?.get('sort'), SORTS, 'patients')
  const hasPatients = searchParams?.get('patients') === '1'
  const urlSearch = searchParams?.get('q') ?? ''
  const openId = searchParams?.get('physio') ?? null

  /** This page's URL with some filters changed (null removes one). */
  const hrefWith = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams?.toString())
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      const query = params.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [pathname, searchParams]
  )
  const setParams = useCallback(
    (changes: Record<string, string | null>) => router.replace(hrefWith(changes), { scroll: false }),
    [hrefWith, router]
  )

  // Filter as you type; write the search to the URL once typing pauses
  const [search, setSearch] = useState(urlSearch)
  useEffect(() => {
    const term = search.trim()
    if (term === urlSearch) return
    const timer = setTimeout(() => setParams({ q: term || null }), 300)
    return () => clearTimeout(timer)
  }, [search, urlSearch, setParams])

  const [limit, setLimit] = useState(PAGE_SIZE)
  useEffect(() => setLimit(PAGE_SIZE), [mode, status, sort, hasPatients, search])

  const data = useQuery(physioDirectoryRef, {})
  const rows = useMemo(() => data?.rows ?? [], [data])

  const counts = useMemo(() => {
    const count = (test: (row: DirectoryRow) => boolean) => rows.filter(test).length
    return {
      all: rows.length,
      network: count((r) => r.mode === 'network'),
      independent: count((r) => r.mode === 'independent'),
      both: count((r) => r.mode === 'both'),
      clinic: count((r) => r.mode === 'clinic'),
      unset: count((r) => r.mode === 'unset'),
      approved: count((r) => r.approvalStatus === 'approved'),
      pending_review: count((r) => r.approvalStatus === 'pending_review'),
      declined: count((r) => r.approvalStatus === 'declined'),
      not_submitted: count((r) => r.approvalStatus === 'not_submitted'),
      suspended: count((r) => r.suspended || r.clinicSuspended),
    }
  }, [rows])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const termCompact = compact(term)
    const matches = rows.filter((row) => {
      if (mode !== 'all' && row.mode !== mode) return false
      if (status === 'suspended' ? !(row.suspended || row.clinicSuspended) : status !== 'all' && row.approvalStatus !== status) {
        return false
      }
      if (hasPatients && row.patients.total === 0) return false
      if (!term) return true
      return (
        row.name.toLowerCase().includes(term) ||
        (row.email ?? '').toLowerCase().includes(term) ||
        (row.phone ?? '').replace(/\s/g, '').includes(term.replace(/\s/g, '')) ||
        (termCompact.length > 0 && compact(row.rehabifyId ?? '').includes(termCompact))
      )
    })
    const byName = (a: DirectoryRow, b: DirectoryRow) => a.name.localeCompare(b.name)
    return matches.sort((a, b) => {
      if (sort === 'name') return byName(a, b)
      if (sort === 'newest') return b.joinedAt - a.joinedAt
      return (
        b.patients.total - a.patients.total ||
        (a.nextSessionAt ?? Infinity) - (b.nextSessionAt ?? Infinity) ||
        byName(a, b)
      )
    })
  }, [rows, mode, status, hasPatients, search, sort])

  const shown = visible.slice(0, limit)
  const filtered = mode !== 'all' || status !== 'all' || hasPatients || search.trim() !== ''
  const preview = openId ? (rows.find((row) => row.userId === openId) ?? null) : null

  const clearFilters = () => {
    setSearch('')
    setParams({ mode: null, status: null, patients: null, q: null })
  }

  const exportCsv = () =>
    downloadCsv(
      `rehabify-physiotherapists-${format(new Date(), 'yyyy-MM-dd')}`,
      visible.map((row) => ({
        Name: row.name,
        'Rehabify ID': row.rehabifyId ?? '',
        Email: row.email ?? '',
        Phone: row.phone ?? '',
        Mode: MODE_LABEL[row.mode],
        Clinic: row.clinicName ?? '',
        Location: row.location ?? '',
        Approval: APPROVAL_LABEL[row.approvalStatus],
        Suspended: row.suspended ? 'Yes' : 'No',
        Listed: row.marketplaceListed ? 'Yes' : 'No',
        'Current patients': row.patients.total,
        [SOURCE_LABEL.rehabify]: row.patients.rehabify,
        [`${SOURCE_LABEL.own} patients`]: row.patients.own,
        [`${SOURCE_LABEL.clinic} patients`]: row.patients.clinic,
        'Sessions next 7 days': row.sessionsNext7Days,
        'Next session': row.nextSessionAt ? new Date(row.nextSessionAt) : '',
        'Last activity': row.lastActiveAt ? new Date(row.lastActiveAt) : '',
        Joined: new Date(row.joinedAt),
      }))
    )

  const tiles: { key: ModeFilter | 'patients'; label: string; value?: number; icon: ComponentType<{ className?: string }>; tone: Tone; hint?: string }[] = [
    { key: 'all', label: 'Physiotherapists', value: data ? counts.all : undefined, icon: Stethoscope, tone: 'teal', hint: data?.capped ? `Newest ${data.cap} shown` : undefined },
    { key: 'network', label: 'Rehabify physios', value: data ? counts.network : undefined, icon: Store, tone: 'mint' },
    { key: 'independent', label: 'Independent', value: data ? counts.independent : undefined, icon: Briefcase, tone: 'neutral' },
    // Chosen before it was one or the other; served as Rehabify physios
    ...(counts.both > 0
      ? [{ key: 'both' as const, label: 'Both', value: counts.both, icon: Layers, tone: 'mint' as Tone, hint: 'Chosen before it was one or the other' }]
      : []),
    { key: 'clinic', label: 'Clinic', value: data ? counts.clinic : undefined, icon: Building2, tone: 'peach' },
    // Older accounts that haven't answered Rehabify vs independent yet (asked on their dashboard)
    ...(counts.unset > 0
      ? [{ key: 'unset' as const, label: 'Not chosen', value: counts.unset, icon: HelpCircle, tone: 'neutral' as Tone, hint: 'Rehabify or independent' }]
      : []),
    {
      key: 'patients',
      label: 'Patients being handled',
      value: data?.patientsHandled,
      icon: Users,
      tone: 'teal',
      hint: data ? `Active care, booked or seen in ${data.windowDays} days` : undefined,
    },
  ]

  return (
    <AdminPage>
      <PageHeader
        title="Physiotherapists"
        description="How each physio works and the patients they're seeing now."
        actions={
          <Button variant="outline" className={softButtonClass} onClick={exportCsv} disabled={visible.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Stagger
        // "Both" and "Not chosen" only appear while someone is in them: one row on wide screens either way
        className={cn(
          'grid grid-cols-2 gap-3',
          tiles.length > 6 ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
          tiles.length > 6 ? 'xl:grid-cols-7' : tiles.length === 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
        )}
      >
        {tiles.map((tile) => (
          <StaggerItem key={tile.key} className="h-full">
            <StatTile
              label={tile.label}
              value={tile.value === undefined ? <Skeleton className="h-8 w-14 rounded-lg" /> : tile.value.toLocaleString('en-NG')}
              icon={tile.icon}
              tone={tile.tone}
              hint={tile.hint}
              // Mode tiles link to that filter
              href={tile.key === 'patients' ? undefined : hrefWith({ mode: tile.key === 'all' ? null : tile.key })}
            />
          </StaggerItem>
        ))}
      </Stagger>

      <Panel>
        <div className="space-y-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email or ID"
                aria-label="Search physiotherapists"
                className={cn(inputClass, 'h-10 pl-9 pr-9')}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:text-rh-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Select value={sort} onValueChange={(value) => setParams({ sort: value === 'patients' ? null : value })}>
                <SelectTrigger className={cn(inputClass, 'h-10 flex-1 sm:w-44 sm:flex-none')} aria-label="Sort by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {SORT_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => setParams({ patients: hasPatients ? null : '1' })}
                aria-pressed={hasPatients}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rh-ink-2',
                  hasPatients
                    ? 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep'
                    : 'border border-black/10 bg-white text-neutral-600 hover:text-rh-ink dark:border-white/10 dark:bg-rh-ink-3 dark:text-neutral-300 dark:hover:text-white'
                )}
              >
                <Users className="h-4 w-4" />
                Has patients
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div role="group" aria-label="How they work">
              <FilterChips<ModeFilter>
                value={mode}
                onChange={(value) => setParams({ mode: value === 'all' ? null : value })}
                options={MODE_FILTERS.map((value) => ({
                  value,
                  label: value === 'all' ? 'All' : MODE_LABEL[value],
                  count: data ? counts[value] : undefined,
                }))}
              />
            </div>
            <div role="group" aria-label="Account status">
              <FilterChips<StatusFilter>
                value={status}
                onChange={(value) => setParams({ status: value === 'all' ? null : value })}
                options={STATUS_FILTERS.map((value) => ({
                  value,
                  label: value === 'all' ? 'Any status' : value === 'suspended' ? 'Suspended' : APPROVAL_LABEL[value],
                  count: data ? counts[value === 'all' ? 'all' : value] : undefined,
                }))}
              />
            </div>
          </div>
        </div>

        {data === undefined ? (
          <div className="space-y-3 p-4 sm:p-5" aria-busy="true" aria-label="Loading physiotherapists">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3 rounded-md" />
                  <Skeleton className="h-3 w-1/2 rounded-md" />
                </div>
                <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Stethoscope />}
            title="No physiotherapists yet"
            description="Physios appear here once they sign up and choose the physiotherapist role."
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Search />}
            title="No one matches"
            description="Try another search, or clear the filters."
            action={
              <Button variant="outline" className={softButtonClass} onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {visible.length.toLocaleString('en-NG')} {visible.length === 1 ? 'physiotherapist' : 'physiotherapists'}
                {filtered && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="font-medium text-rh-ink underline-offset-4 hover:underline focus:outline-none focus-visible:underline dark:text-white"
                    >
                      Clear filters
                    </button>
                  </>
                )}
              </p>
              <SourceLegend />
            </div>
            <div
              className={cn(
                ROW_GRID,
                'hidden border-y border-black/[0.05] px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400'
              )}
              aria-hidden
            >
              <span>Physiotherapist</span>
              <span>Mode</span>
              <span>Location</span>
              <span>Current patients</span>
              <span>Next session</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y divide-black/[0.04] border-t border-black/[0.05] dark:divide-white/[0.05] dark:border-white/[0.06] xl:border-t-0">
              {shown.map((row) => (
                <li key={row.userId}>
                  <PhysioRow row={row} active={row.userId === openId} onOpen={() => setParams({ physio: row.userId })} />
                </li>
              ))}
            </ul>
            {visible.length > shown.length && (
              <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
                <span>
                  Showing {shown.length} of {visible.length.toLocaleString('en-NG')}
                </span>
                <Button size="sm" variant="outline" className={softButtonClass} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>

      <PhysioSheet physioId={openId} preview={preview} onClose={() => setParams({ physio: null })} />
    </AdminPage>
  )
}

function PatientsCell({ row }: { row: DirectoryRow }) {
  const total = `${row.patients.total.toLocaleString('en-NG')}${row.patientsCapped ? '+' : ''}`
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="w-9 shrink-0 text-sm font-semibold tabular-nums text-rh-ink dark:text-white">{total}</span>
      <SourceBar split={row.patients} className="w-full max-w-[120px] flex-1" />
      <span className="sr-only">{row.patients.total > 0 ? splitLabel(row.patients) : 'No current patients'}</span>
    </span>
  )
}

function NextSessionCell({ row }: { row: DirectoryRow }) {
  if (!row.nextSessionAt) return <span className="text-sm text-neutral-400 dark:text-neutral-500">None booked</span>
  return (
    <span className="block min-w-0">
      <span className="block truncate text-sm text-rh-ink dark:text-white">{sessionWhen(row.nextSessionAt)}</span>
      <span className="block text-xs text-neutral-500 dark:text-neutral-400">
        {row.sessionsNext7Days} this week
      </span>
    </span>
  )
}

function StatusCell({ row }: { row: DirectoryRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <AccountBadges approvalStatus={row.approvalStatus} suspended={row.suspended} clinicSuspended={row.clinicSuspended} />
      {row.marketplaceListed && <StatusBadge tone="teal">Listed</StatusBadge>}
    </span>
  )
}

/** One physio. A button that opens the drawer; the layout stacks below xl. */
function PhysioRow({ row, active, onOpen }: { row: DirectoryRow; active: boolean; onOpen: () => void }) {
  const place = row.mode === 'clinic' && row.clinicName ? row.clinicName : null
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={active}
      className={cn(
        ROW_GRID,
        'group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-rh-canvas focus:outline-none focus-visible:bg-rh-canvas focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rh-lime dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.03] sm:px-5',
        active && 'bg-rh-canvas dark:bg-white/[0.03]'
      )}
    >
      {/* Physio: always shown */}
      <span className="flex min-w-0 flex-1 items-start gap-3 xl:items-center">
        <PersonAvatar id={row.userId} name={row.name} imageUrl={row.imageUrl} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-sm font-semibold text-rh-ink dark:text-white">{row.name}</span>
            <RehabifyId value={row.rehabifyId} copyable={false} />
          </span>
          <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
            {row.email ?? row.phone ?? 'No contact details'}
          </span>

          {/* Below xl: mode, place, patients, next session and status stacked under the name */}
          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 xl:hidden">
            <ModeChip mode={row.mode} />
            {(place || row.location) && (
              <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">{place ?? row.location}</span>
            )}
          </span>
          <span className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 xl:hidden">
            <PatientsCell row={row} />
            <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="shrink-0">Next:</span>
              <span className="min-w-0 truncate text-rh-ink dark:text-white">
                {row.nextSessionAt ? sessionWhen(row.nextSessionAt) : 'None booked'}
              </span>
            </span>
          </span>
          <span className="mt-2 block xl:hidden">
            <StatusCell row={row} />
          </span>
        </span>
      </span>

      {/* xl and up: the remaining columns */}
      <span className="hidden min-w-0 xl:block">
        <ModeChip mode={row.mode} />
        {place && <span className="mt-1 block truncate text-xs text-neutral-500 dark:text-neutral-400">{place}</span>}
      </span>
      <span className="hidden min-w-0 truncate text-sm text-rh-ink dark:text-white xl:block">
        {row.location ?? <span className="text-neutral-400 dark:text-neutral-500">Not set</span>}
      </span>
      <span className="hidden min-w-0 xl:block">
        <PatientsCell row={row} />
        <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
          {row.lastActiveAt ? `Active ${timeAgo(row.lastActiveAt)}` : 'No activity yet'}
        </span>
      </span>
      <span className="hidden min-w-0 xl:block">
        <NextSessionCell row={row} />
      </span>
      <span className="hidden min-w-0 xl:block">
        <StatusCell row={row} />
      </span>
      <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600 xl:mt-0" />
    </button>
  )
}

export default function AdminPhysiotherapistsPage() {
  // The filters are read with useSearchParams, which needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <PhysiotherapistsDirectory />
    </Suspense>
  )
}
