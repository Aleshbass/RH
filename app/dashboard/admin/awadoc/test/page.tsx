'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { ArrowLeft, Building2, CheckCircle2, Clock, FlaskConical, Loader2, MapPin, Monitor, Play, Star, User, XCircle, Zap } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { AdminPage, cardClass, EmptyState, PageHeader, Panel, primaryButtonClass, softButtonClass, StatusBadge } from '@/components/admin/ui'
import { devToolsEnabled } from '@/components/admin/shell/adminNav'
import { Callout, formatKobo, insetClass } from '@/components/admin/partners/shared'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────

type TestResult = {
  eventType: string
  status: 'idle' | 'running' | 'success' | 'error'
  response?: unknown
  error?: string
  duration?: number
}

type AvailablePhysio = {
  profileId: string
  firstName: string
  lastName: string
  location: string
  hourlyRate: number
  averageRating: number
  yearsOfExperience: number
  offersOnlineSessions: boolean
  offersInPersonSessions: boolean
}

const EVENT_TYPES = [
  {
    id: 'availability',
    label: 'Availability query',
    event: 'therapy.availability.query',
    description: 'AwaDoc searching for available therapy specialists in your system',
  },
  {
    id: 'request',
    label: 'Therapy request',
    event: 'therapy.request',
    description: 'A patient choosing a physio and requesting a therapy booking',
  },
  {
    id: 'confirmed',
    label: 'Payment confirmed',
    event: 'therapy.confirmed',
    description: 'AwaDoc confirming that payment was successful',
  },
] as const

// ── Test tool ───────────────────────────────────────────

function AwadocTestTool() {
  const physios = useQuery(api.awadoc.getAvailablePhysios, {}) as AvailablePhysio[] | undefined
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [therapyId, setTherapyId] = useState<string | null>(null)
  const [runAllInProgress, setRunAllInProgress] = useState(false)

  const updateResult = (id: string, update: Partial<TestResult>) => {
    setResults((prev) => ({ ...prev, [id]: { ...prev[id], ...update } as TestResult }))
  }

  const runTest = async (eventId: string, eventType: string, overrideTherapyId?: string) => {
    updateResult(eventId, { eventType, status: 'running' })
    const start = performance.now()
    // Use the override when given (avoids a stale closure in runAllTests)
    const activeTherapyId = overrideTherapyId ?? therapyId

    try {
      const res = await fetch('/api/awadoc/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, therapyId: activeTherapyId ?? undefined }),
      })
      const data = await res.json()
      const duration = Math.round(performance.now() - start)

      if (res.ok) {
        // Keep the therapy ID from the request event for the follow-up tests
        if (eventId === 'request' && data.response?.therapy?.id) setTherapyId(data.response.therapy.id)
        updateResult(eventId, { status: 'success', response: data.response, duration })
        return (data.response?.therapy?.id as string | undefined) ?? null
      }
      updateResult(eventId, { status: 'error', error: data.error ?? `HTTP ${res.status}`, response: data, duration })
      return null
    } catch (err) {
      updateResult(eventId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Network error',
        duration: Math.round(performance.now() - start),
      })
      return null
    }
  }

  const runAllTests = async () => {
    setRunAllInProgress(true)
    let chainedTherapyId: string | null = null
    try {
      for (const event of EVENT_TYPES) {
        // Pass the therapy ID from test 2 on to test 3
        const resultId = await runTest(event.id, event.event, chainedTherapyId ?? undefined)
        if (event.id === 'request' && resultId) chainedTherapyId = resultId
        // Short pause between tests so Convex mutations settle
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
    } finally {
      setRunAllInProgress(false)
    }
  }

  const isAnyRunning = runAllInProgress || Object.values(results).some((r) => r.status === 'running')

  return (
    <AdminPage className="max-w-5xl">
      <PageHeader
        eyebrow="Developer"
        title="AwaDoc integration test"
        description="Send signed test webhooks to your own endpoint, exactly as AwaDoc would, before a joint test session."
        actions={
          <>
            <Button asChild variant="ghost" className={softButtonClass}>
              <Link href="/dashboard/admin/awadoc">
                <ArrowLeft className="mr-2 h-4 w-4" /> AwaDoc
              </Link>
            </Button>
            <Button onClick={runAllTests} disabled={isAnyRunning} className={primaryButtonClass}>
              {isAnyRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Run all tests
            </Button>
          </>
        }
      />

      <Panel
        title={
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-rh-teal dark:text-rh-aqua" /> Available physiotherapists
          </span>
        }
        description="The physios AwaDoc sees when it queries your system."
        bodyClassName="px-5 pb-5 pt-3"
      >
        {!physios ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : physios.length === 0 ? (
          <Callout tone="danger" title="No marketplace physios available">
            AwaDoc tests will return empty results. Open a physiotherapist profile and turn on &quot;Available on Marketplace&quot;.
          </Callout>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {physios.map((p) => (
              <div key={p.profileId} className={cn(insetClass, 'space-y-2')}>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rh-mist text-xs font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                    {p.firstName?.[0]}
                    {p.lastName?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-rh-night dark:text-white">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                      <MapPin className="h-3 w-3" /> {p.location || 'No location'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge tone="teal">{formatKobo(p.hourlyRate)}/hr</StatusBadge>
                  {p.averageRating > 0 && (
                    <StatusBadge tone="amber" className="gap-1">
                      <Star className="h-3 w-3 fill-current" /> {p.averageRating.toFixed(1)}
                    </StatusBadge>
                  )}
                  {p.yearsOfExperience > 0 && (
                    <StatusBadge tone="neutral" className="gap-1">
                      <Clock className="h-3 w-3" /> {p.yearsOfExperience}y exp
                    </StatusBadge>
                  )}
                  {p.offersOnlineSessions && (
                    <StatusBadge tone="green" className="gap-1">
                      <Monitor className="h-3 w-3" /> Online
                    </StatusBadge>
                  )}
                  {p.offersInPersonSessions && (
                    <StatusBadge tone="neutral" className="gap-1">
                      <Building2 className="h-3 w-3" /> In person
                    </StatusBadge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-rh-night dark:text-white">Webhook event simulation</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Run them in order: availability, then request, then confirmed.</p>
        </div>

        {therapyId && (
          <p className={cn(insetClass, 'text-sm text-neutral-500 dark:text-neutral-400')}>
            Active therapy ID <code className="font-mono text-rh-teal dark:text-rh-aqua">{therapyId}</code> (used for the follow-up tests)
          </p>
        )}

        {EVENT_TYPES.map((event, idx) => {
          const result = results[event.id]
          return (
            <div key={event.id} className={cn(cardClass, 'space-y-3 p-4')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rh-mist text-sm font-semibold text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-rh-night dark:text-white">{event.label}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      <code>{event.event}</code> · {event.description}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {result?.status === 'success' && (
                    <StatusBadge tone="green" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {result.duration}ms
                    </StatusBadge>
                  )}
                  {result?.status === 'error' && (
                    <StatusBadge tone="red" className="gap-1">
                      <XCircle className="h-3 w-3" /> Failed
                    </StatusBadge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(softButtonClass, 'h-8 w-8 p-0')}
                    onClick={() => runTest(event.id, event.event)}
                    disabled={result?.status === 'running' || runAllInProgress}
                    aria-label={`Run ${event.label}`}
                  >
                    {result?.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {result?.error && <p className="text-sm text-rose-600 dark:text-rose-300">{result.error}</p>}
              {result?.response !== undefined && result?.response !== null && (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-rh-canvas p-3 font-mono text-xs text-rh-night dark:bg-white/[0.04] dark:text-neutral-200">
                  {JSON.stringify(result.response, null, 2)}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </AdminPage>
  )
}

// ── Page ────────────────────────────────────────────────

/** Developer tool: only available in development or when NEXT_PUBLIC_ADMIN_DEV_TOOLS=true. */
export default function AwadocTestPage() {
  if (!devToolsEnabled()) {
    return (
      <AdminPage className="max-w-3xl">
        <div className={cardClass}>
          <EmptyState
            icon={<FlaskConical />}
            title="Developer tools are turned off"
            description="The AwaDoc webhook test only runs in development, or when NEXT_PUBLIC_ADMIN_DEV_TOOLS is set to true."
            action={
              <Button asChild variant="ghost" className={softButtonClass}>
                <Link href="/dashboard/admin/awadoc">Back to AwaDoc</Link>
              </Button>
            }
          />
        </div>
      </AdminPage>
    )
  }
  return <AwadocTestTool />
}
