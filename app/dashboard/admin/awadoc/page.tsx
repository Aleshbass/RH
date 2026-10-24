'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { Activity, AlertTriangle, ArrowUpRight, Banknote, CheckCircle2, Clock, ExternalLink, FlaskConical } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AdminPage,
  EmptyState,
  inputClass,
  PageHeader,
  Panel,
  softButtonClass,
  Stagger,
  StaggerItem,
  StatTile,
  StatusBadge,
} from '@/components/admin/ui'
import { devToolsEnabled } from '@/components/admin/shell/adminNav'
import { formatKobo, linkClass } from '@/components/admin/partners/shared'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────

interface WebhookEvent {
  eventId: string
  eventType: string
  direction: 'inbound' | 'outbound'
  status: 'success' | 'error'
  processedAt: number
  errorMessage?: string
  payload?: { diagnostics?: SignatureDiagnostics | { error: string } | null }
}

/** Mirrors SignatureDiagnostics in lib/awadoc/awadoc.ts (TEMPORARY, Oct 2026) */
interface SignatureDiagnostics {
  receivedAt: string
  serverUnixSeconds: number
  timestampHeader: string | null
  timestampSkewSeconds: number | null
  receivedSignature: string
  headers: Array<{ name: string; value: string }>
  rawBodyLength: number
  rawBody: string
  rawBodyTruncated: boolean
  bodySha256: string
  compactJsonSha256: string | null
  prettyJsonSha256: string | null
  keys: Array<{ label: string; fingerprint: string }>
  matchingVariants: string[]
  variantsTried: number
}

/**
 * AwaDoc's own service fee, charged to the patient on top of the session price. It is
 * informational only: nothing on our side deducts it, so it is not part of the stats.
 */
const AWADOC_PATIENT_FEE_PERCENT = 4

const dateFormatter = new Intl.DateTimeFormat('en-NG', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

// ── TEMPORARY: signature diagnostics panel ─────────────
// Remove with diagnoseInboundSignature once AwaDoc signatures verify (Oct 2026).

function DiagRow({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-black/[0.05] py-1.5 last:border-0 dark:border-white/[0.06] sm:grid-cols-[180px_1fr]">
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={cn('break-all text-xs text-rh-ink dark:text-neutral-200', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function SignatureDiagnosticsPanel({ diagnostics }: { diagnostics: SignatureDiagnostics | { error: string } }) {
  const [theirHash, setTheirHash] = useState('')
  const [copied, setCopied] = useState(false)

  if ('error' in diagnostics) {
    return <p className="text-xs text-rose-600 dark:text-rose-300">Diagnostics failed: {diagnostics.error}</p>
  }
  const d = diagnostics
  const cleaned = theirHash.trim().toLowerCase()
  const hashVerdict = !cleaned
    ? null
    : cleaned === d.bodySha256
      ? { ok: true, text: 'Matches the raw body we received. Same bytes: the secret or the string being signed differs.' }
      : cleaned === d.compactJsonSha256
        ? { ok: false, text: 'Matches the compact JSON, not the raw bytes we received. AwaDoc signs a different serialisation than they send.' }
        : cleaned === d.prettyJsonSha256
          ? { ok: false, text: 'Matches pretty-printed JSON, not the raw bytes we received. AwaDoc signs a different serialisation than they send.' }
          : { ok: false, text: 'No match. AwaDoc hashed a different body than the one that reached us.' }

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(d.rawBody)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the body is still selectable below
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold text-rh-ink dark:text-white">Compare with AwaDoc</p>
        <Input
          value={theirHash}
          onChange={(e) => setTheirHash(e.target.value)}
          placeholder="Paste AwaDoc's SHA-256 of the signed body"
          className={cn(inputClass, 'h-8 font-mono text-xs')}
        />
        {hashVerdict && (
          <p className={cn('mt-1 text-xs', hashVerdict.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300')}>{hashVerdict.text}</p>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-rh-ink dark:text-white">Signature</p>
        <DiagRow label="Received x-signature" value={d.receivedSignature || '(empty)'} />
        <DiagRow label="x-timestamp" value={d.timestampHeader ?? '(missing)'} />
        <DiagRow label="Clock skew" value={d.timestampSkewSeconds === null ? 'n/a' : `${d.timestampSkewSeconds}s (limit ±300s)`} />
        <DiagRow label="Our SHA-256 of raw body" value={d.bodySha256} />
        <DiagRow label="SHA-256 compact JSON" value={d.compactJsonSha256 ?? 'n/a'} />
        <DiagRow label="SHA-256 pretty JSON" value={d.prettyJsonSha256 ?? 'n/a'} />
        <DiagRow label="Our keys" value={d.keys.length ? d.keys.map((k) => `${k.label}: ${k.fingerprint}`).join(' · ') : 'none configured'} />
        <DiagRow
          label={`Schemes tried (${d.variantsTried})`}
          mono={false}
          value={
            d.matchingVariants.length ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-300">Reproduced with: {d.matchingVariants.join(', ')}</span>
            ) : (
              <span className="text-rose-600 dark:text-rose-300">
                None reproduced AwaDoc&apos;s signature with our keys. The key they sign with is not one we have.
              </span>
            )
          }
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-rh-ink dark:text-white">Headers received</p>
        {d.headers.map((h) => (
          <DiagRow key={h.name} label={h.name} value={h.value} />
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-rh-ink dark:text-white">
            Raw body ({d.rawBodyLength} chars{d.rawBodyTruncated ? ', truncated' : ''})
          </p>
          <Button variant="ghost" size="sm" className={cn(softButtonClass, 'h-6 text-xs')} onClick={copyBody}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-rh-canvas p-2 font-mono text-xs text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">
          {d.rawBody}
        </pre>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────

export default function AwadocDashboardPage() {
  const stats = useQuery(api.awadoc.getDashboardStats)
  const showDevTools = devToolsEnabled()

  const header = (
    <PageHeader
      eyebrow="Partners"
      title="AwaDoc"
      description="Bookings that come in from the AwaDoc marketplace, revenue after AwaDoc's commission, and the webhook audit trail."
      actions={
        showDevTools ? (
          <Button asChild variant="ghost" className={softButtonClass}>
            <Link href="/dashboard/admin/awadoc/test">
              <FlaskConical className="mr-2 h-4 w-4" /> Test integration
            </Link>
          </Button>
        ) : undefined
      }
    />
  )

  if (stats === undefined) {
    return (
      <AdminPage>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </AdminPage>
    )
  }

  // Commission rate comes from convex/awadoc.ts (AWADOC_COMMISSION_RATE)
  const commissionPercent = Math.round(stats.commissionRate * 1000) / 10
  const netPercent = Math.round((100 - commissionPercent) * 10) / 10
  const events = stats.recentEvents as WebhookEvent[]

  return (
    <AdminPage>
      {header}

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatTile label="Total sessions" value={stats.totalSessions} hint="From the AwaDoc marketplace" icon={Activity} />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Confirmed" value={stats.confirmed} hint={`${stats.completed} completed`} icon={CheckCircle2} tone="mint" />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Gross revenue"
            value={formatKobo(stats.totalGross)}
            hint={`-${formatKobo(stats.totalCommission)} AwaDoc commission (${commissionPercent}%)`}
            icon={Banknote}
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile label="Net earnings" value={formatKobo(stats.totalNet)} hint={`After the ${commissionPercent}% AwaDoc commission`} icon={ArrowUpRight} tone="mint" />
        </StaggerItem>
      </Stagger>

      <Panel
        title="Revenue split"
        description={`AwaDoc keeps ${commissionPercent}% of each session. AwaDoc also charges the patient a ${AWADOC_PATIENT_FEE_PERCENT}% service fee, which is not taken from Rehabify's earnings.`}
        bodyClassName="space-y-3 px-5 pb-5 pt-3"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-rh-ink dark:text-white">Rehabify earnings ({netPercent}%)</span>
          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{formatKobo(stats.totalNet)}</span>
        </div>
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
          <div className="h-full bg-rh-lime transition-all dark:bg-rh-lime" style={{ width: stats.totalGross > 0 ? `${netPercent}%` : '0%' }} />
          <div className="h-full bg-rh-amber transition-all" style={{ width: stats.totalGross > 0 ? `${commissionPercent}%` : '0%' }} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">AwaDoc commission ({commissionPercent}%)</span>
          <span className="tabular-nums text-amber-700 dark:text-amber-300">{formatKobo(stats.totalCommission)}</span>
        </div>
      </Panel>

      <Panel title="Recent events" description="Webhook audit trail (latest 20)" bodyClassName="px-3 pb-3 pt-2">
        {events.length === 0 ? (
          <EmptyState
            icon={<Clock />}
            title="No events yet"
            description="Events appear here once AwaDoc starts sending webhook requests to your endpoint."
          />
        ) : (
          <div className="space-y-1.5">
            {events.map((event, idx) => (
              <div key={`${event.eventId}-${idx}`} className="rounded-xl border border-black/[0.05] dark:border-white/[0.06]">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', event.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500')} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-rh-ink dark:text-white">{event.eventType}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{dateFormatter.format(new Date(event.processedAt))}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge tone={event.direction === 'inbound' ? 'teal' : 'neutral'}>{event.direction === 'inbound' ? '← In' : '→ Out'}</StatusBadge>
                    {event.status === 'error' && (
                      <StatusBadge tone="red" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Error
                      </StatusBadge>
                    )}
                  </div>
                </div>
                {(event.errorMessage || event.payload?.diagnostics) && (
                  <details className="px-3 pb-3">
                    <summary className={cn(linkClass, 'cursor-pointer select-none text-xs')}>
                      {event.payload?.diagnostics ? 'Signature diagnostics' : 'Details'}
                    </summary>
                    <div className="mt-2 space-y-2">
                      <DiagRow label="Event ID" value={event.eventId} />
                      {event.errorMessage && <DiagRow label="Error" value={event.errorMessage} />}
                      {event.payload?.diagnostics && <SignatureDiagnosticsPanel diagnostics={event.payload.diagnostics} />}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Integration details" bodyClassName="grid gap-4 px-5 pb-5 pt-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Webhook URL</p>
          <code className="block break-all rounded-lg bg-rh-canvas p-2 text-sm text-rh-ink dark:bg-white/[0.04] dark:text-neutral-200">/api/awadoc/webhook</code>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Environment</p>
          <p className="text-sm text-rh-ink dark:text-neutral-200">
            Set on the server by <code className="font-mono text-xs">AWADOC_ENVIRONMENT</code> and <code className="font-mono text-xs">AWADOC_BASE_URL</code>
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Commission rate</p>
          <p className="text-sm text-rh-ink dark:text-neutral-200">{commissionPercent}% (AwaDoc merchant commission)</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">AwaDoc docs</p>
          <a
            href="https://partners-staging.awadoc.com/api-doc"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkClass, 'inline-flex items-center gap-1 text-sm')}
          >
            API documentation (staging) <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Panel>
    </AdminPage>
  )
}
