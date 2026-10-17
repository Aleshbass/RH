'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { Building2, ExternalLink, Inbox, Loader2, Search, Settings2, Stethoscope, UserCheck, X } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AdminPage, EmptyState, FilterChips, inputClass, PageHeader, Panel, softButtonClass, StatusBadge, tableWrapClass } from '@/components/admin/ui'
import { formatKobo, LoadingBlock, selectContentClass } from '@/components/admin/partners/shared'
import type { PartnerApplication } from '@/components/admin/partners/PartnerReview'
import { cn } from '@/lib/utils'
import { ReferralManageDialog, type ReferralRow, type ReferralStage, STAGES, STATUS_LABEL, statusTone } from './ReferralManageDialog'

const PAGE_SIZE = 100
const MAX_ROWS = 500
const BASE_PATH = '/dashboard/admin/referrals'

type StageFilter = 'all' | ReferralStage

const parseStage = (value: string | null): StageFilter => (STAGES.some((s) => s.value === value) ? (value as ReferralStage) : 'all')

function RoutedTo({ referral }: { referral: ReferralRow }) {
  if (referral.assignedClinicName) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rh-night dark:text-neutral-200">
        <Building2 className="h-3.5 w-3.5 text-rh-teal dark:text-rh-aqua" /> {referral.assignedClinicName}
      </span>
    )
  }
  if (referral.assignedPhysiotherapistName) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rh-night dark:text-neutral-200">
        <Stethoscope className="h-3.5 w-3.5 text-rh-teal dark:text-rh-aqua" /> {referral.assignedPhysiotherapistName}
      </span>
    )
  }
  if (referral.environment === 'sandbox' && referral.sandboxProviderAssigned) return <StatusBadge tone="neutral">Simulated provider</StatusBadge>
  return <StatusBadge tone="amber">Unassigned</StatusBadge>
}

function ReferralsContent() {
  const router = useRouter()
  const pathname = usePathname() ?? BASE_PATH
  const searchParams = useSearchParams()
  const urlPartner = searchParams?.get('partner') || 'all'
  const urlStage = parseStage(searchParams?.get('stage') ?? null)

  const [partner, setPartnerState] = useState(urlPartner)
  const [stage, setStageState] = useState<StageFilter>(urlStage)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [search, setSearch] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [managing, setManaging] = useState<ReferralRow | null>(null)

  // Follow the URL when it changes from outside (links from the partners page, back/forward)
  useEffect(() => setPartnerState(urlPartner), [urlPartner])
  useEffect(() => setStageState(urlStage), [urlStage])
  useEffect(() => setLimit(PAGE_SIZE), [partner, stage])

  const writeUrl = (next: { partner?: string; stage?: StageFilter }) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    const p = next.partner ?? partner
    const s = next.stage ?? stage
    if (p === 'all') params.delete('partner')
    else params.set('partner', p)
    if (s === 'all') params.delete('stage')
    else params.set('stage', s)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const setPartner = (value: string) => {
    setPartnerState(value)
    writeUrl({ partner: value })
  }
  const setStage = (value: StageFilter) => {
    setStageState(value)
    writeUrl({ stage: value })
  }

  const partnerId = partner === 'all' ? undefined : partner
  const page = useQuery(api.adminReferrals.getInboundReferrals, { stage: stage === 'all' ? undefined : stage, partnerId, limit })
  const stageCounts = useQuery(api.adminReferrals.getInboundReferralStageCounts, { partnerId })
  const partners = useQuery(api.adminPartnerships.getPartnerApplications, {})

  // Keep showing the current rows while "Load more" fetches a bigger page (same filters only)
  const filterKey = `${stage}|${partner}`
  const [lastPage, setLastPage] = useState<{ key: string; page: NonNullable<typeof page> } | null>(null)
  useEffect(() => {
    if (page !== undefined) setLastPage({ key: filterKey, page })
  }, [page, filterKey])
  const fallback = lastPage?.key === filterKey ? lastPage.page : undefined
  const shown = page ?? fallback
  const loadingMore = page === undefined && fallback !== undefined

  // Keep the open dialog in sync with live data
  const managingLive = managing ? (shown?.referrals.find((r: ReferralRow) => r._id === managing._id) ?? managing) : null

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (shown?.referrals ?? []).filter((r: ReferralRow) => {
      if (unassignedOnly && (r.assignedClinicId || r.assignedPhysiotherapistId)) return false
      if (!q) return true
      return [
        `${r.patientFirstName || ''} ${r.patientLastName || ''}`,
        r.patientPhone,
        r.patientEmail,
        r.trackingCode,
        r.partnerExternalId,
        r.partnerName,
        r.doctorName,
        r.condition,
      ].some((value) => (value || '').toLowerCase().includes(q))
    })
  }, [shown, search, unassignedOnly])

  const stageOptions = useMemo(() => {
    const label = (text: string, count: number | undefined, capped: boolean | undefined) =>
      capped ? { label: `${text} ${count}+`, count: undefined } : { label: text, count }
    const total = stageCounts ? STAGES.reduce((sum, s) => sum + stageCounts.counts[s.value], 0) : undefined
    const anyCapped = stageCounts ? STAGES.some((s) => stageCounts.capped[s.value]) : false
    return [
      { value: 'all' as StageFilter, ...label('All', total, anyCapped) },
      ...STAGES.map((s) => ({ value: s.value as StageFilter, ...label(s.label, stageCounts?.counts[s.value], stageCounts?.capped[s.value]) })),
    ]
  }, [stageCounts])

  const partnerName = partners?.find((p: PartnerApplication) => p.code === partner)?.name
  const hasFilters = search.trim() !== '' || partner !== 'all' || stage !== 'all' || unassignedOnly
  const clearFilters = () => {
    setSearch('')
    setUnassignedOnly(false)
    setPartnerState('all')
    setStageState('all')
    router.replace(pathname, { scroll: false })
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Patients & Care"
        title="Inbound referrals"
        description="Referrals from healthcare partners and referring doctors. Triage each one, then route it to a partner clinic or a Rehabify physiotherapist."
      />

      <div className="space-y-3">
        <FilterChips value={stage} onChange={setStage} options={stageOptions} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search patient, phone, tracking code, partner, condition"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, 'pl-9')}
            />
          </div>
          <Select value={partner} onValueChange={setPartner}>
            <SelectTrigger className={cn(inputClass, 'w-full sm:w-[240px]')} aria-label="Partner">
              <SelectValue placeholder="All partners" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              <SelectItem value="all">All partners and doctors</SelectItem>
              {partner !== 'all' && !partners?.some((p: PartnerApplication) => p.code === partner) && <SelectItem value={partner}>{partner}</SelectItem>}
              {partners?.map((p: PartnerApplication) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setUnassignedOnly((v) => !v)}
            aria-pressed={unassignedOnly}
            className={cn(
              'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium transition',
              unassignedOnly ? 'bg-rh-amber text-rh-night' : 'bg-white text-neutral-600 shadow-soft hover:text-rh-night dark:bg-rh-ink-2 dark:text-neutral-300 dark:hover:text-white'
            )}
          >
            <UserCheck className="h-3.5 w-3.5" /> Unassigned only
          </button>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 shrink-0 rounded-xl text-xs text-neutral-500 dark:text-neutral-400">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <Panel
        title="Intake queue"
        description={
          shown
            ? `${rows.length} shown of the ${shown.referrals.length} most recent${partnerName ? ` from ${partnerName}` : ''}${stage !== 'all' ? ` · ${STAGES.find((s) => s.value === stage)?.label}` : ''}`
            : undefined
        }
      >
        {shown === undefined ? (
          <LoadingBlock className="h-48" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={hasFilters ? 'No referrals match these filters' : 'No inbound referrals yet'}
            description={hasFilters ? 'Try another stage, partner or search.' : 'Referrals from partners and doctors appear here as they arrive.'}
            action={
              hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters} className={softButtonClass}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={cn(tableWrapClass, 'px-2 pb-2')}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Handled by</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: ReferralRow) => (
                  <TableRow key={r._id} className="cursor-pointer" onClick={() => setManaging(r)}>
                    <TableCell className="max-w-[220px]">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-rh-night dark:text-white">
                        <span>
                          {r.patientFirstName} {r.patientLastName}
                        </span>
                        {r.environment === 'sandbox' && <StatusBadge tone="neutral">Sandbox</StatusBadge>}
                        {(r.priority === 'urgent' || r.priority === 'high') && <StatusBadge tone="red">{r.priority === 'urgent' ? 'Urgent' : 'High'}</StatusBadge>}
                      </div>
                      {r.trackingCode && (
                        <a
                          href={`/track/${r.trackingCode}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[11px] text-rh-teal hover:underline dark:text-rh-aqua"
                          title="Open the live care tracking page"
                        >
                          {r.trackingCode} <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {r.partnerExternalId && <div className="font-mono text-[11px] text-neutral-400">Ref {r.partnerExternalId}</div>}
                      <div className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{r.condition || r.reason || 'General rehabilitation'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-rh-night dark:text-neutral-200">{r.patientPhone}</div>
                      {r.patientEmail && <div className="max-w-[180px] truncate text-xs text-neutral-500 dark:text-neutral-400">{r.patientEmail}</div>}
                      {(r.city || r.state) && <div className="text-[11px] text-neutral-400">{[r.city, r.state].filter(Boolean).join(', ')}</div>}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {r.partnerName || r.partnerCode ? (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-rh-night dark:text-neutral-200">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-rh-teal dark:text-rh-aqua" />
                          <span className="truncate">{r.partnerName || r.partnerCode}</span>
                          {r.partnerType && <span className="text-[10px] uppercase text-neutral-400">{r.partnerType}</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-rh-night dark:text-neutral-200">
                          <UserCheck className="h-3.5 w-3.5 text-neutral-400" /> {r.doctorName}
                        </div>
                      )}
                      {r.hospitalClinic && r.partnerName !== r.hospitalClinic && (
                        <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{r.hospitalClinic}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <RoutedTo referral={r} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">{format(r.createdAt, 'd MMM yyyy')}</TableCell>
                    <TableCell>
                      <StatusBadge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</StatusBadge>
                      {r.commissionEarned ? (
                        <div className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{formatKobo(r.commissionEarned)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setManaging(r)
                        }}
                        className={cn(softButtonClass, 'h-8 text-xs')}
                      >
                        <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {shown?.hasMore && (
          <div className="flex justify-center border-t border-black/[0.05] p-3 dark:border-white/[0.06]">
            {limit < MAX_ROWS ? (
              <Button variant="ghost" size="sm" disabled={loadingMore} onClick={() => setLimit((l) => Math.min(MAX_ROWS, l + PAGE_SIZE))} className={softButtonClass}>
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Load {PAGE_SIZE} more
              </Button>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Showing the {MAX_ROWS} most recent. Narrow by stage or partner to see older referrals.</p>
            )}
          </div>
        )}
      </Panel>

      <ReferralManageDialog referral={managingLive} onClose={() => setManaging(null)} />
    </AdminPage>
  )
}

export default function AdminReferralsPage() {
  return (
    <Suspense
      fallback={
        <AdminPage>
          <PageHeader eyebrow="Patients & Care" title="Inbound referrals" />
          <LoadingBlock className="h-48" />
        </AdminPage>
      }
    >
      <ReferralsContent />
    </Suspense>
  )
}
