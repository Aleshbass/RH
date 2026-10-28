'use client'

/**
 * The progress report for the patient's referrer (convex/progressReports.ts):
 * - ReportSummary: a card on the Care plan tab, with when it was last shared.
 * - ProgressReportScreen: /dashboard/physiotherapist/patients/<id>/report. Edit the impression,
 *   summary and next steps, choose the measures, see the report as the referrer will, print it,
 *   or share a private link (the patient must have agreed). Shared links can be withdrawn.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { Check, Copy, FileText, Loader2, Printer, Send, ShieldCheck, Users, WhatsApp } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import type { getReportDraft, listProgressReports } from '@/convex/progressReports'
import { REPORT_TEXT_LIMITS, type ReportSnapshot } from '@/convex/helpers/progressReport'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  EmptyState,
  fieldClass,
  PageContainer,
  PageHeader,
  Panel,
  PhysioDrawer,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from '@/components/physio/ui'
import { ProgressReportDocument } from '@/components/reports/ProgressReportDocument'
import { ReportPrintPortal } from '@/components/reports/ReportPrintPortal'
import { programError } from '@/components/exercise-programs/errors'
import type { QueryResult } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
type ReportDraft = QueryResult<typeof getReportDraft>
type SharedReport = QueryResult<typeof listProgressReports>[number]
type SendArgs = {
  patientId: Id<'users'>
  impression?: string
  summary?: string
  nextSteps?: string
  measureKeys?: string[]
  recipientName?: string
  recipientEmail?: string
  patientAgreed: boolean
}
type SendResult = { reportId: Id<'progressReports'>; url: string; expiresAt: number; emailed: boolean }

const reportApi = {
  draft: makeFunctionReference<'query', { patientId: Id<'users'> }, ReportDraft>('progressReports:getReportDraft'),
  list: makeFunctionReference<'query', { patientId: Id<'users'> }, SharedReport[]>('progressReports:listProgressReports'),
  send: makeFunctionReference<'mutation', SendArgs, SendResult>('progressReports:sendProgressReport'),
  revoke: makeFunctionReference<'mutation', { reportId: Id<'progressReports'> }, null>('progressReports:revokeProgressReport'),
}

const reportHref = (patientId: string) => `/dashboard/physiotherapist/patients/${patientId}/report`

function stateBadge(report: SharedReport) {
  if (report.state === 'open') return <StatusBadge tone="green">Open until {format(report.expiresAt, 'd MMM')}</StatusBadge>
  if (report.state === 'withdrawn') return <StatusBadge tone="neutral">Withdrawn</StatusBadge>
  return <StatusBadge tone="neutral">Expired</StatusBadge>
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Link copied')
  } catch {
    toast.error('Couldn’t copy. Select the link and copy it yourself.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// On the Care plan tab
// ─────────────────────────────────────────────────────────────────────────────

export function ReportSummary({ patientId, firstName }: { patientId: Id<'users'>; firstName?: string }) {
  const reports = useQuery(reportApi.list, { patientId })
  const latest = reports?.[0]
  return (
    <Panel
      title="Progress report"
      description={`For the doctor or partner who referred ${firstName || 'this patient'}`}
      info="Goals, key measures with how much they changed, attendance, and your summary. Print it, or share a private link once the patient agrees. Links open for 30 days and you can withdraw them."
      actions={
        <Button asChild size="sm" className={cn(secondaryButtonClass, 'h-9')}>
          <Link href={reportHref(patientId)}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Open report
          </Link>
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 px-5 pb-5 pt-2 text-sm text-pt-muted sm:px-6">
        {reports === undefined ? (
          <Skeleton className="h-4 w-48 bg-pt-sunken" />
        ) : latest ? (
          <>
            <span>
              Last shared {format(latest.sentAt, 'd MMM yyyy')}
              {latest.recipientName ? ` with ${latest.recipientName}` : ''}
            </span>
            {stateBadge(latest)}
          </>
        ) : (
          <span>Not shared yet.</span>
        )}
      </div>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The report screen
// ─────────────────────────────────────────────────────────────────────────────

type Texts = { impression: string; summary: string; nextSteps: string }

const TEXT_FIELDS: { key: keyof Texts; label: string; placeholder: string; rows: number }[] = [
  { key: 'impression', label: 'Working impression', placeholder: 'e.g. Right patellofemoral pain, load-related', rows: 2 },
  { key: 'summary', label: 'Progress summary', placeholder: 'How they’ve responded to treatment, in a few sentences', rows: 4 },
  { key: 'nextSteps', label: 'Plan and next steps', placeholder: 'e.g. Continue weekly for 4 weeks, then discharge to home programme', rows: 3 },
]

const orUndefined = (text: string) => text.trim() || undefined

export function ProgressReportScreen({ patientId }: { patientId: Id<'users'> }) {
  const draft = useQuery(reportApi.draft, { patientId })
  const reports = useQuery(reportApi.list, { patientId })
  const [texts, setTexts] = useState<Texts | null>(null)
  const [keys, setKeys] = useState<Set<string> | null>(null)
  const [sharing, setSharing] = useState(false)

  // Start from the latest note once; the draft stays live, the physio's edits stay theirs
  useEffect(() => {
    if (!draft || texts !== null) return
    setTexts(draft.defaults)
    setKeys(new Set(draft.defaultMeasureKeys))
  }, [draft, texts])

  const preview = useMemo<ReportSnapshot | null>(() => {
    if (!draft || !texts || !keys) return null
    return {
      ...draft.snapshot,
      impression: orUndefined(texts.impression),
      summary: orUndefined(texts.summary),
      nextSteps: orUndefined(texts.nextSteps),
      measures: draft.snapshot.measures.filter((m) => keys.has(m.seriesKey)),
    }
  }, [draft, texts, keys])

  if (draft === undefined || (draft && !preview)) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64 rounded-xl bg-pt-sunken" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-3xl bg-pt-sunken" />
          <Skeleton className="h-[32rem] rounded-3xl bg-pt-sunken" />
        </div>
      </PageContainer>
    )
  }

  if (draft === null || !preview || !texts || !keys) {
    return (
      <PageContainer>
        <Panel>
          <EmptyState
            icon={<Users />}
            title="Patient not found"
            description="This patient isn’t on your list."
            action={
              <Button asChild className={secondaryButtonClass}>
                <Link href="/dashboard/physiotherapist/patients">Back to patients</Link>
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const toggleKey = (key: string, on: boolean) =>
    setKeys((current) => {
      const next = new Set(current)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  return (
    <PageContainer>
      <ReportPrintPortal>
        <ProgressReportDocument report={preview} />
      </ReportPrintPortal>
      <div className="print:hidden">
        <PageHeader
          back={{ href: `/dashboard/physiotherapist/patients/${patientId}?tab=plan`, label: draft.snapshot.patient.name }}
          title="Progress report"
          description={
            draft.referrer
              ? `For ${draft.referrer.name}${draft.referrer.organisation ? `, ${draft.referrer.organisation}` : ''}, who referred ${draft.snapshot.patient.name.split(' ')[0]}.`
              : 'For the doctor or partner who referred this patient.'
          }
          info="What you see on the right is what the referrer gets. Sharing keeps this version: later notes don’t change a report you’ve sent."
          actions={
            <>
              <Button className={cn(secondaryButtonClass, 'h-11')} onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              <Button className={cn(primaryButtonClass, 'h-11')} onClick={() => setSharing(true)}>
                <Send className="mr-2 h-4 w-4" />
                Share with referrer
              </Button>
            </>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-5 print:hidden">
          <Panel title="Your words" description="Started from your latest note. Changing them here doesn’t change the note." bodyClassName="space-y-4 px-5 pb-5 pt-3 sm:px-6">
            {TEXT_FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`report-${field.key}`} className="mb-1.5 block text-sm font-medium text-pt-ink">
                  {field.label}
                </label>
                <Textarea
                  id={`report-${field.key}`}
                  className={cn(fieldClass, 'resize-y')}
                  rows={field.rows}
                  maxLength={REPORT_TEXT_LIMITS[field.key]}
                  value={texts[field.key]}
                  onChange={(e) => setTexts({ ...texts, [field.key]: e.target.value })}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </Panel>

          <Panel
            title="Measures"
            description="First and latest value in this course of care"
            info="Measures recorded at least twice, and any a goal tracks. Goal measures come first. Untick any the referrer doesn’t need."
          >
            {draft.snapshot.measures.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-pt-muted sm:px-6">No measure has been recorded twice yet. Record measures in your notes to show change here.</p>
            ) : (
              <ul className="divide-y divide-pt-line pb-2 pt-1">
                {draft.snapshot.measures.map((m) => (
                  <li key={m.seriesKey}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 px-5 py-3 sm:px-6">
                      <Checkbox checked={keys.has(m.seriesKey)} onCheckedChange={(checked) => toggleKey(m.seriesKey, Boolean(checked))} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-pt-ink">{m.name}</span>
                        <span className="block text-xs text-pt-muted">
                          {m.visits > 1 ? `${m.baseline} → ${m.latest}` : `${m.baseline}, measured once`}
                          {m.change && m.visits > 1 ? ` · ${m.change}` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <SharedReports reports={reports} />
        </div>

        <div className="min-w-0">
          <ProgressReportDocument report={preview} className="border border-pt-line shadow-pt dark:border-transparent" />
        </div>
      </div>

      <ShareReportDrawer
        open={sharing}
        onOpenChange={setSharing}
        patientId={patientId}
        draft={draft}
        texts={texts}
        measureKeys={draft.snapshot.measures.filter((m) => keys.has(m.seriesKey)).map((m) => m.seriesKey)}
      />
    </PageContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared links
// ─────────────────────────────────────────────────────────────────────────────

function SharedReports({ reports }: { reports: SharedReport[] | undefined }) {
  const revoke = useMutation(reportApi.revoke)
  const [confirming, setConfirming] = useState<Id<'progressReports'> | null>(null)
  const [busy, setBusy] = useState<Id<'progressReports'> | null>(null)
  if (!reports || reports.length === 0) return null

  const withdraw = async (id: Id<'progressReports'>) => {
    setBusy(id)
    try {
      await revoke({ reportId: id })
      toast.success('Link withdrawn', { description: 'It no longer opens. The report stays on record.' })
      setConfirming(null)
    } catch (error) {
      toast.error(programError(error, 'Couldn’t withdraw the link. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel title="Shared" description="Each link shows the report as it was when you shared it">
      <ul className="divide-y divide-pt-line pb-2 pt-1">
        {reports.map((report) => (
          <li key={report._id} className="space-y-2 px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-pt-ink">{report.recipientName || report.recipientEmail || 'Link only'}</p>
                <p className="text-xs text-pt-muted">
                  {format(report.sentAt, 'd MMM yyyy, h:mm a')}
                  {report.emailed && report.recipientEmail ? ` · emailed to ${report.recipientEmail}` : ''}
                </p>
              </div>
              {stateBadge(report)}
            </div>
            {report.state === 'open' && report.url && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className={cn(secondaryButtonClass, 'h-9')} onClick={() => void copyText(report.url!)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy link
                </Button>
                {confirming === report._id ? (
                  <>
                    <Button size="sm" className="h-9 rounded-xl bg-pt-rose-bg text-pt-rose-fg hover:bg-pt-rose-bg/80" disabled={busy === report._id} onClick={() => void withdraw(report._id)}>
                      {busy === report._id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Withdraw link
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 rounded-xl text-pt-muted hover:bg-pt-hover" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" className="h-9 rounded-xl text-pt-muted hover:bg-pt-hover hover:text-pt-ink" onClick={() => setConfirming(report._id)}>
                    Withdraw
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Share drawer
// ─────────────────────────────────────────────────────────────────────────────

function ShareReportDrawer({
  open,
  onOpenChange,
  patientId,
  draft,
  texts,
  measureKeys,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patientId: Id<'users'>
  draft: NonNullable<ReportDraft>
  texts: Texts
  measureKeys: string[]
}) {
  const send = useMutation(reportApi.send)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const firstName = draft.snapshot.patient.name.split(' ')[0] || 'The patient'

  // Each opening starts over, with the referrer filled in when we know them
  useEffect(() => {
    if (!open) return
    setName(draft.referrer?.name ?? '')
    setEmail(draft.referrer?.email ?? '')
    setAgreed(false)
    setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    if (!agreed) return toast.error(`Confirm ${firstName} agreed to share this report.`)
    setSaving(true)
    try {
      const sent = await send({
        patientId,
        impression: orUndefined(texts.impression),
        summary: orUndefined(texts.summary),
        nextSteps: orUndefined(texts.nextSteps),
        measureKeys,
        recipientName: orUndefined(name),
        recipientEmail: orUndefined(email),
        patientAgreed: true,
      })
      playSound('success')
      setResult(sent)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t share the report. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const shareText = (url: string) => `Physiotherapy progress report from ${draft.snapshot.physio.name}: ${url}`

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title={result ? 'Report shared' : 'Share with the referrer'}
      description={result ? undefined : 'A private link to the report exactly as you see it now.'}
      footer={
        result ? (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => onOpenChange(false)}>
            Done
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button className={cn(secondaryButtonClass, 'h-11 flex-1')} disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className={cn(primaryButtonClass, 'h-11 flex-1')} disabled={saving || !agreed} onClick={() => void submit()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {email.trim() ? 'Share and email' : 'Share'}
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-2xl bg-pt-green-bg p-3 text-sm text-pt-ink">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-pt-accent-ink" />
            <span>
              {result.emailed ? `Emailed to ${email.trim()}. ` : 'Send them the link. '}
              It opens until {format(result.expiresAt, 'd MMMM yyyy')}, and you can withdraw it from this page.
            </span>
          </p>
          <Input readOnly value={result.url} className={cn(fieldClass, 'h-11 font-mono text-xs')} aria-label="Report link" onFocus={(e) => e.currentTarget.select()} />
          <div className="grid grid-cols-2 gap-2">
            <Button className={cn(secondaryButtonClass, 'h-11')} onClick={() => void copyText(result.url)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
            <Button
              className={cn(secondaryButtonClass, 'h-11')}
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText(result.url))}`, '_blank', 'noopener,noreferrer')}
            >
              <WhatsApp className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="report-recipient" className="mb-1.5 block text-sm font-medium text-pt-ink">
              Who it’s for
            </label>
            <Input id="report-recipient" className={cn(fieldClass, 'h-11')} value={name} maxLength={REPORT_TEXT_LIMITS.recipientName} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr Bello" />
          </div>
          <div>
            <label htmlFor="report-email" className="mb-1.5 block text-sm font-medium text-pt-ink">
              Their email (optional)
            </label>
            <Input id="report-email" type="email" inputMode="email" autoComplete="off" className={cn(fieldClass, 'h-11')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="doctor@hospital.ng" />
            <p className="mt-1 text-xs text-pt-muted">We email them the link. Leave it blank to copy the link and send it yourself.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-pt-sunken p-3">
            <Checkbox checked={agreed} onCheckedChange={(checked) => setAgreed(Boolean(checked))} className="mt-0.5" />
            <span className="text-sm text-pt-ink">
              {firstName} agreed to share this report with {name.trim() || 'them'}
              <span className="block text-xs text-pt-muted">Recorded with the report, with your name and the time.</span>
            </span>
          </label>

          <div className="flex items-start gap-2 text-xs text-pt-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pt-ink" />
            <p>
              The link opens without signing in for {draft.linkDays} days. They see this version only: later notes don’t change it. You can withdraw it at
              any time.
            </p>
          </div>
        </div>
      )}
    </PhysioDrawer>
  )
}
