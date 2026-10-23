'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpRight, CheckCircle2, Eye, Flag, Loader2, Save, Search, ShieldAlert, XCircle } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  AdminPage,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  PageHeader,
  Panel,
  StatTile,
  StatusBadge,
  Stagger,
  StaggerItem,
  inputClass,
  listRowClass,
  primaryButtonClass,
  softButtonClass,
} from '@/components/admin/ui'
import { errorText } from '@/components/admin/finance/format'

const reportsApi = api.marketplace.reports

type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed'
type Severity = 'low' | 'medium' | 'high' | 'critical'
type StatusFilter = ReportStatus | 'all'
type SeverityFilter = Severity | 'all'

type Report = {
  _id: Id<'physiotherapistReports'>
  physiotherapistId: Id<'users'>
  reporterId: Id<'users'>
  reporterRole?: string
  reason: string
  description: string
  severity: Severity
  status: ReportStatus
  adminNotes?: string
  actionTaken?: string
  reviewedAt?: number
  createdAt: number
  updatedAt: number
  physiotherapist: { id: Id<'users'>; name: string; email?: string; imageUrl?: string } | null
  reporter: { id: Id<'users'>; name: string; email?: string; role?: string } | null
  reviewer?: { id: Id<'users'>; name: string } | null
  appointment: { _id: string; startTime?: number; status?: string } | null
  booking: { _id: string; bookingCode?: string; sessionDate?: number; sessionType?: string } | null
}

type ReportsResult = { reports: Report[]; total: number; hasMore: boolean; capped?: boolean }
type Counts = Record<ReportStatus, number> & { cap: number }
type PhysioHistory = {
  reports: { _id: Id<'physiotherapistReports'>; reason: string; severity: Severity; status: ReportStatus; createdAt: number }[]
  totalReports: number
  statusCounts: Record<ReportStatus, number>
  severityCounts: Record<Severity, number>
}

const PAGE = 50

const REASON_LABELS: Record<string, string> = {
  unprofessional_behavior: 'Unprofessional behaviour',
  poor_treatment_quality: 'Poor treatment quality',
  safety_concern: 'Safety concern',
  billing_issue: 'Billing issue',
  harassment: 'Harassment',
  breach_of_confidentiality: 'Breach of confidentiality',
  other: 'Other',
}

const STATUS_META: Record<ReportStatus, { label: string; tone: 'neutral' | 'teal' | 'green' | 'amber' | 'red' }> = {
  pending: { label: 'New', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'teal' },
  resolved: { label: 'Resolved', tone: 'green' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
}

const SEVERITY_META: Record<Severity, { label: string; tone: 'neutral' | 'teal' | 'green' | 'amber' | 'red'; dot: string }> = {
  low: { label: 'Low', tone: 'neutral', dot: 'bg-neutral-400' },
  medium: { label: 'Medium', tone: 'teal', dot: 'bg-rh-teal dark:bg-rh-aqua' },
  high: { label: 'High', tone: 'amber', dot: 'bg-amber-500' },
  critical: { label: 'Critical', tone: 'red', dot: 'bg-rose-500' },
}

const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason.replace(/_/g, ' ')

export default function AdminMarketplaceReportsPage() {
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [severity, setSeverity] = useState<SeverityFilter>('all')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selectedId, setSelectedId] = useState<Id<'physiotherapistReports'> | null>(null)

  const result = useQuery(api.marketplace.reports.getAllReports, {
    status: status === 'all' ? undefined : status,
    severity: severity === 'all' ? undefined : severity,
    limit,
  }) as unknown as ReportsResult | undefined
  const counts = useQueryUntyped(reportsApi.getReportCounts, {}) as Counts | undefined

  // Keep the last loaded page on screen while a new filter loads
  const [lastResult, setLastResult] = useState<ReportsResult | undefined>(undefined)
  useEffect(() => {
    if (result) setLastResult(result)
  }, [result])
  const data = result ?? lastResult
  const loading = result === undefined

  useEffect(() => setLimit(PAGE), [status, severity])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = data?.reports ?? []
    if (!term) return list
    return list.filter((r) =>
      [r.physiotherapist?.name, r.physiotherapist?.email, r.reporter?.name, r.reporter?.email, r.description, reasonLabel(r.reason)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    )
  }, [data, search])

  // A report can leave the filtered list once its status changes; keep showing the
  // last copy so the sheet doesn't vanish mid-review.
  const [snapshot, setSnapshot] = useState<Report | null>(null)
  const selected = useMemo(
    () => data?.reports.find((r) => r._id === selectedId) ?? (snapshot && snapshot._id === selectedId ? snapshot : null),
    [data, selectedId, snapshot]
  )
  const openReport = (r: Report) => {
    setSnapshot(r)
    setSelectedId(r._id)
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Marketplace"
        title="Reports"
        description="Concerns patients have raised about physiotherapists. Review each one, write down what you did, then resolve or dismiss it. The patient is told when the outcome changes."
      />

      <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatTile label="New" value={counts ? counts.pending : '–'} hint="waiting for a first look" icon={Flag} tone={counts && counts.pending > 0 ? 'attention' : 'teal'} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Under review" value={counts ? counts.under_review : '–'} hint="being looked into" icon={Eye} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Resolved" value={counts ? counts.resolved : '–'} icon={CheckCircle2} tone="mint" />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Dismissed" value={counts ? counts.dismissed : '–'} icon={XCircle} tone="neutral" />
        </StaggerItem>
      </Stagger>

      <Panel>
        <div className="space-y-3 border-b border-black/[0.05] p-4 dark:border-white/[0.06] sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips
              value={status}
              onChange={setStatus}
              options={[
                { value: 'pending', label: 'New', count: counts?.pending },
                { value: 'under_review', label: 'Under review', count: counts?.under_review },
                { value: 'resolved', label: 'Resolved', count: counts?.resolved },
                { value: 'dismissed', label: 'Dismissed', count: counts?.dismissed },
                { value: 'all', label: 'All' },
              ]}
            />
            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search physio, reporter, details"
                aria-label="Search reports"
                className={cn(inputClass, 'pl-9')}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Severity</span>
            <SeverityChips value={severity} onChange={setSeverity} />
          </div>
        </div>

        {data === undefined ? (
          <div className="space-y-3 p-4 sm:px-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Flag />}
            title={data.reports.length === 0 ? (status === 'pending' ? 'No new reports' : 'No reports here') : 'No reports match'}
            description={data.reports.length === 0 ? 'Reports patients file against a physiotherapist land here.' : 'Try a different search.'}
          />
        ) : (
          <ul className={cn('divide-y divide-black/[0.05] transition-opacity dark:divide-white/[0.06]', loading && 'opacity-60')}>
            {visible.map((r) => (
              <li key={r._id}>
                <button type="button" onClick={() => openReport(r)} className={cn(listRowClass, 'w-full items-start text-left')}>
                  <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_META[r.severity].dot)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-rh-night dark:text-white">{reasonLabel(r.reason)}</span>
                      <StatusBadge tone={SEVERITY_META[r.severity].tone}>{SEVERITY_META[r.severity].label}</StatusBadge>
                      <StatusBadge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</StatusBadge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-neutral-600 dark:text-neutral-300">
                      Against <span className="font-medium">{r.physiotherapist?.name ?? 'Unknown physio'}</span> · by {r.reporter?.name ?? 'Unknown'}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs text-neutral-500 dark:text-neutral-400">{r.description}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400" title={format(r.createdAt, 'd MMM yyyy, HH:mm')}>
                    {formatDistanceToNowStrict(r.createdAt, { addSuffix: true })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {data && (data.hasMore || data.capped) && (
          <div className="flex items-center justify-between gap-3 border-t border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing {data.reports.length} of {data.total}
              {data.capped ? '+' : ''}
            </p>
            {data.hasMore && limit < 200 && (
              <Button size="sm" className={softButtonClass} onClick={() => setLimit((l) => Math.min(l + PAGE, 200))} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Show more
              </Button>
            )}
          </div>
        )}
      </Panel>

      <ReportSheet
        report={selected}
        onClose={() => setSelectedId(null)}
        onSaved={(patch) => setSnapshot((prev) => (prev && selected && prev._id === selected._id ? { ...selected, ...patch } : prev))}
      />
    </AdminPage>
  )
}

function SeverityChips({ value, onChange }: { value: SeverityFilter; onChange: (v: SeverityFilter) => void }) {
  const options: SeverityFilter[] = ['all', 'critical', 'high', 'medium', 'low']
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              active
                ? 'border-rh-teal bg-rh-mist text-rh-teal dark:border-rh-aqua dark:bg-rh-aqua/10 dark:text-rh-aqua'
                : 'border-black/10 text-neutral-600 hover:text-rh-night dark:border-white/10 dark:text-neutral-300 dark:hover:text-white'
            )}
          >
            {o !== 'all' && <span className={cn('h-2 w-2 rounded-full', SEVERITY_META[o].dot)} aria-hidden />}
            {o === 'all' ? 'Any' : SEVERITY_META[o].label}
          </button>
        )
      })}
    </div>
  )
}

function ReportSheet({
  report,
  onClose,
  onSaved,
}: {
  report: Report | null
  onClose: () => void
  onSaved: (patch: Pick<Report, 'status' | 'adminNotes' | 'actionTaken' | 'reviewedAt'>) => void
}) {
  const updateStatus = useMutation(api.marketplace.reports.updateReportStatus)
  const history = useQuery(
    api.marketplace.reports.getPhysiotherapistReports,
    report ? { physiotherapistId: report.physiotherapistId } : 'skip'
  ) as unknown as PhysioHistory | undefined

  const [notes, setNotes] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'resolved' | 'dismissed' | null>(null)

  const reportId = report?._id
  useEffect(() => {
    setNotes(report?.adminNotes ?? '')
    setActionTaken(report?.actionTaken ?? '')
    setConfirm(null)
    // Reset only when a different report opens, not on every reactive update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  /** Throws on failure so ConfirmDialog stays open (it plays the error sound). */
  const save = async (status: ReportStatus, label: string) => {
    if (!report) return
    setBusy(label)
    try {
      await updateStatus({ reportId: report._id, status, adminNotes: notes, actionTaken })
      onSaved({ status, adminNotes: notes.trim() || undefined, actionTaken: actionTaken.trim() || undefined, reviewedAt: Date.now() })
      if (status === 'resolved') playSound('approve')
      else if (status === 'dismissed') playSound('reject')
      else playSound('success')
      toast.success(label)
    } catch (error) {
      toast.error('Couldn’t update the report', { description: errorText(error) })
      throw error
    } finally {
      setBusy(null)
    }
  }
  // Buttons that save straight away (no confirm dialog) play the error sound themselves
  const saveNow = (status: ReportStatus, label: string) => {
    save(status, label).catch(() => playSound('error'))
  }

  const dirty = report ? notes !== (report.adminNotes ?? '') || actionTaken !== (report.actionTaken ?? '') : false
  const closed = report?.status === 'resolved' || report?.status === 'dismissed'
  const others = (history?.reports ?? []).filter((r) => r._id !== report?._id)

  return (
    <Sheet open={Boolean(report)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-xl">
        {report && (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="space-y-2 border-b border-black/[0.05] bg-white px-5 py-4 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <StatusBadge tone={SEVERITY_META[report.severity].tone}>{SEVERITY_META[report.severity].label} severity</StatusBadge>
                <StatusBadge tone={STATUS_META[report.status].tone}>{STATUS_META[report.status].label}</StatusBadge>
              </div>
              <SheetTitle className="text-lg text-rh-night dark:text-white">{reasonLabel(report.reason)}</SheetTitle>
              <SheetDescription className="text-xs">
                Filed {format(report.createdAt, 'd MMM yyyy, HH:mm')}
                {report.reviewedAt && report.reviewer ? ` · last updated by ${report.reviewer.name} ${formatDistanceToNowStrict(report.reviewedAt, { addSuffix: true })}` : ''}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-4 px-5 py-4">
              <section className="rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">What the patient said</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-rh-night dark:text-neutral-100">{report.description}</p>
              </section>

              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Physiotherapist</p>
                  <p className="mt-1 text-sm font-medium text-rh-night dark:text-white">{report.physiotherapist?.name ?? 'Unknown'}</p>
                  {report.physiotherapist?.email && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{report.physiotherapist.email}</p>}
                  <Link
                    href={`/dashboard/admin/users/${report.physiotherapistId}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rh-teal hover:underline dark:text-rh-aqua"
                  >
                    Open profile <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Reported by</p>
                  <p className="mt-1 text-sm font-medium text-rh-night dark:text-white">{report.reporter?.name ?? 'Unknown'}</p>
                  {report.reporter?.email && <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{report.reporter.email}</p>}
                  {report.reporter && (
                    <Link
                      href={`/dashboard/admin/users/${report.reporter.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rh-teal hover:underline dark:text-rh-aqua"
                    >
                      Open profile <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </section>

              {(report.booking || report.appointment) && (
                <section className="rounded-2xl bg-white p-4 text-sm shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Linked session</p>
                  {report.booking && (
                    <p className="mt-1 text-rh-night dark:text-white">
                      Booking {report.booking.bookingCode ?? ''}
                      {report.booking.sessionDate ? ` · ${format(report.booking.sessionDate, 'd MMM yyyy, HH:mm')}` : ''}
                      {report.booking.sessionType ? ` · ${report.booking.sessionType.replace(/_/g, ' ')}` : ''}
                    </p>
                  )}
                  {report.appointment && (
                    <p className="mt-1 text-rh-night dark:text-white">
                      Appointment
                      {report.appointment.startTime ? ` · ${format(report.appointment.startTime, 'd MMM yyyy, HH:mm')}` : ''}
                      {report.appointment.status ? ` · ${report.appointment.status.replace(/_/g, ' ')}` : ''}
                    </p>
                  )}
                </section>
              )}

              <section className="space-y-3 rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
                <div className="space-y-1.5">
                  <Label htmlFor="report-notes">Admin notes</Label>
                  <Textarea
                    id="report-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder="What you found, who you spoke to. Only admins see this."
                    className={inputClass}
                    maxLength={4000}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="report-action">Action taken</Label>
                  <Textarea
                    id="report-action"
                    value={actionTaken}
                    onChange={(e) => setActionTaken(e.target.value)}
                    rows={2}
                    placeholder="e.g. Spoke to the physio, issued a warning, refunded the patient"
                    className={inputClass}
                    maxLength={2000}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {!closed && report.status !== 'under_review' && (
                    <Button className={softButtonClass} disabled={busy !== null} onClick={() => saveNow('under_review', 'Marked under review')}>
                      {busy === 'Marked under review' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                      Mark under review
                    </Button>
                  )}
                  {!closed && (
                    <>
                      <Button className={primaryButtonClass} disabled={busy !== null} onClick={() => setConfirm('resolved')}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Resolve
                      </Button>
                      <Button variant="outline" className="rounded-xl dark:border-white/10 dark:bg-transparent dark:text-white" disabled={busy !== null} onClick={() => setConfirm('dismissed')}>
                        <XCircle className="mr-2 h-4 w-4" />
                        Dismiss
                      </Button>
                    </>
                  )}
                  {closed && (
                    <Button className={softButtonClass} disabled={busy !== null} onClick={() => saveNow('under_review', 'Report reopened')}>
                      {busy === 'Report reopened' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                      Reopen
                    </Button>
                  )}
                  {dirty && (
                    <Button variant="ghost" className="rounded-xl dark:text-neutral-200" disabled={busy !== null} onClick={() => saveNow(report.status, 'Notes saved')}>
                      {busy === 'Notes saved' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save notes
                    </Button>
                  )}
                </div>
              </section>

              <section className="rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2 dark:shadow-none">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Report history for {report.physiotherapist?.name ?? 'this physio'}
                  </p>
                  {history && history.totalReports > 1 && (history.severityCounts.critical > 0 || history.severityCounts.high > 0) && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {history.severityCounts.critical + history.severityCounts.high} serious
                    </span>
                  )}
                </div>
                {history === undefined ? (
                  <Skeleton className="mt-3 h-10 rounded-xl" />
                ) : (
                  <>
                    <p className="mt-1 text-sm text-rh-night dark:text-white">
                      {history.totalReports} {history.totalReports === 1 ? 'report' : 'reports'} in total · {history.statusCounts.pending + history.statusCounts.under_review} open ·{' '}
                      {history.statusCounts.resolved} resolved · {history.statusCounts.dismissed} dismissed
                    </p>
                    {others.length === 0 ? (
                      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">This is the only report against them.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {others.slice(0, 12).map((r) => (
                          <li key={r._id} className="flex items-center gap-2 text-xs">
                            <span className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_META[r.severity].dot)} aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-rh-night dark:text-neutral-100">{reasonLabel(r.reason)}</span>
                            <StatusBadge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</StatusBadge>
                            <span className="shrink-0 text-neutral-500 dark:text-neutral-400">{format(r.createdAt, 'd MMM yyyy')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            </div>
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === 'resolved' ? 'Resolve this report?' : 'Dismiss this report?'}
        description={
          confirm === 'resolved'
            ? 'Use this when the concern has been dealt with. Your notes and action are saved, and the patient is told their report was resolved.'
            : 'Use this when the report doesn’t need action. The patient is told it was dismissed.'
        }
        confirmLabel={confirm === 'resolved' ? 'Resolve' : 'Dismiss'}
        destructive={confirm === 'dismissed'}
        onConfirm={() => (confirm ? save(confirm, confirm === 'resolved' ? 'Report resolved' : 'Report dismissed') : undefined)}
      />
    </Sheet>
  )
}
