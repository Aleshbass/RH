'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Building2, ChevronRight, Clock, Download, Percent, Search, ShieldOff, ShieldCheck } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  downloadCsv,
  inputClass,
  softButtonClass,
} from '@/components/admin/ui'
import {
  ApprovalBadge,
  ClinicAvatar,
  ClinicStatusBadge,
  CLINICS_BASE,
  countLabel,
} from '@/components/admin/clinics/shared'
import type { ClinicsListResult } from '@/components/admin/clinics/types'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'active' | 'suspended' | 'pending'

const PAGE_SIZE = 50
const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_72px_80px_112px_16px] md:gap-4'

export default function AdminClinicsPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [limit, setLimit] = useState(PAGE_SIZE)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // A new search or filter starts from the first page again
  useEffect(() => setLimit(PAGE_SIZE), [debounced, status])

  const result = useQuery(api.adminClinics.listClinics, { search: debounced || undefined, status, limit }) as
    | ClinicsListResult
    | undefined
  // Keep showing the last results while a new search loads, so the page doesn't flash
  const [last, setLast] = useState(result)
  useEffect(() => {
    if (result !== undefined) setLast(result)
  }, [result])
  const data = result ?? last
  const refreshing = result === undefined && last !== undefined

  const totals = data?.totals
  const rows = data?.rows ?? []

  const exportCsv = () =>
    downloadCsv(
      `rehabify-clinics-${format(new Date(), 'yyyy-MM-dd')}`,
      rows.map((r) => ({
        Clinic: r.name,
        City: r.city ?? '',
        State: r.state ?? '',
        Owner: r.owner?.name ?? '',
        'Owner email': r.owner?.email ?? '',
        Staff: countLabel(r.staffCount, r.staffCapped),
        Patients: countLabel(r.patientCount, r.patientsCapped),
        Status: r.status,
        Approval: r.approvalStatus,
        'Payout account': r.payoutConnected ? 'Connected' : 'Not connected',
        Joined: new Date(r.createdAt),
      }))
    )

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Clinics"
        title="All clinics"
        description="Every clinic on Rehabify, with its owner, team and patients. Open a clinic to see its details or suspend it."
        actions={
          <>
            <Button asChild variant="outline" className={softButtonClass}>
              <Link href="/dashboard/admin/clinic-fees">
                <Percent className="mr-2 h-4 w-4" />
                Clinic fees
              </Link>
            </Button>
            <Button variant="outline" className={softButtonClass} onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </>
        }
      />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Clinics', value: totals?.total, icon: Building2, tone: 'teal' as const, hint: data?.scanCapped ? 'Newest 500 shown' : undefined },
          { label: 'Active', value: totals?.active, icon: ShieldCheck, tone: 'mint' as const },
          { label: 'Suspended', value: totals?.suspended, icon: ShieldOff, tone: (totals?.suspended ? 'rose' : 'neutral') as 'rose' | 'neutral' },
          {
            label: 'Not yet approved',
            value: totals?.pending,
            icon: Clock,
            tone: (totals?.pending ? 'attention' : 'neutral') as 'attention' | 'neutral',
            href: totals?.pending ? '/dashboard/admin/approvals' : undefined,
            hint: totals?.pending ? 'Review in Approvals' : undefined,
          },
        ].map((tile) => (
          <StaggerItem key={tile.label}>
            <StatTile
              label={tile.label}
              value={tile.value === undefined ? <Skeleton className="h-8 w-14 rounded-lg" /> : tile.value.toLocaleString('en-NG')}
              icon={tile.icon}
              tone={tile.tone}
              href={tile.href}
              hint={tile.hint}
            />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: totals?.total },
            { value: 'active', label: 'Active', count: totals?.active },
            { value: 'suspended', label: 'Suspended', count: totals?.suspended },
            { value: 'pending', label: 'Not approved', count: totals?.pending },
          ]}
        />
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city, owner or clinic ID"
            aria-label="Search clinics"
            className={cn(inputClass, 'h-10 pl-9')}
          />
        </div>
      </div>

      <Panel className={cn('transition-opacity', refreshing && 'opacity-60')}>
        {data === undefined ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title={debounced || status !== 'all' ? 'No clinics match' : 'No clinics yet'}
            description={
              debounced || status !== 'all'
                ? 'Try another search or filter.'
                : 'Clinics appear here once a clinic owner signs up and registers their clinic.'
            }
          />
        ) : (
          <>
            <div
              className={cn(
                ROW_GRID,
                'hidden border-b border-black/[0.05] px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400'
              )}
            >
              <span>Clinic</span>
              <span>Owner</span>
              <span className="text-right">Staff</span>
              <span className="text-right">Patients</span>
              <span>Status</span>
              <span />
            </div>
            <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {rows.map((row) => (
                <li key={row._id}>
                  <Link
                    href={`${CLINICS_BASE}/${row._id}`}
                    className={cn(
                      ROW_GRID,
                      'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-rh-canvas focus:outline-none focus-visible:bg-rh-canvas dark:hover:bg-white/[0.03] dark:focus-visible:bg-white/[0.03] md:px-5'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ClinicAvatar id={row._id} name={row.name} logoUrl={row.logoUrl} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold text-rh-night dark:text-white">{row.name}</p>
                          <RehabifyId value={row.clinicNumber} copyable={false} />
                        </div>
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                          {[row.city, row.state].filter(Boolean).join(', ') || 'No city'} · Joined {format(row.createdAt, 'd MMM yyyy')}
                        </p>
                        {/* Phones: owner and counts under the name */}
                        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400 md:hidden">
                          {row.owner?.name ?? 'No owner'} · {countLabel(row.staffCount, row.staffCapped)} staff ·{' '}
                          {countLabel(row.patientCount, row.patientsCapped)} patients
                        </p>
                      </div>
                    </div>
                    <div className="hidden min-w-0 md:block">
                      <p className="truncate text-sm text-rh-night dark:text-white">{row.owner?.name ?? 'No owner'}</p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{row.owner?.email ?? ''}</p>
                    </div>
                    <p className="hidden text-right text-sm tabular-nums text-rh-night dark:text-white md:block">
                      {countLabel(row.staffCount, row.staffCapped)}
                    </p>
                    <p className="hidden text-right text-sm tabular-nums text-rh-night dark:text-white md:block">
                      {countLabel(row.patientCount, row.patientsCapped)}
                    </p>
                    <div className="flex shrink-0 flex-col items-end gap-1 md:items-start">
                      <ClinicStatusBadge status={row.status} />
                      <ApprovalBadge status={row.approvalStatus} hideApproved />
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 dark:text-neutral-600" />
                  </Link>
                </li>
              ))}
            </ul>
            {data.hasMore && (
              <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-5 py-3 text-xs text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
                <span>
                  Showing {rows.length} of {data.matched.toLocaleString('en-NG')}
                </span>
                <Button size="sm" variant="outline" className={softButtonClass} onClick={() => setLimit((n) => Math.min(n + PAGE_SIZE, 200))} disabled={limit >= 200}>
                  {limit >= 200 ? 'Search to narrow down' : 'Show more'}
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>
    </AdminPage>
  )
}
