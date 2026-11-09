'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { ChevronRight } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Panel, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import { SUBSCRIPTION_STATUS_LABEL, formatKobo, type MyClinicPlan } from '@/lib/clinicSubscriptions'
import { cn } from '@/lib/utils'

const planRef = makeFunctionReference<'query', Record<string, never>, MyClinicPlan>('clinicBilling:getMyClinicPlan')

export const CLINIC_PLAN_HREF = '/dashboard/clinic/billing/plan'

const day = (ms: number) => format(new Date(ms), 'd MMM yyyy')

function MiniMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const full = limit > 0 && used >= limit
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-pt-muted">{label}</span>
        <span className="tabular-nums text-pt-ink">
          <span className="font-semibold text-pt-ink">{used}</span> / {limit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pt-sunken">
        <div className={cn('h-full rounded-full', full ? 'bg-pt-primary' : 'bg-pt-accent')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * The clinic's Rehabify plan at a glance on Home: plan, status, when it renews, seats and
 * programmes used, and a way to pay when something is owed. Owner and Billing-page members only
 * (getMyClinicPlan returns null for everyone else, and then nothing shows).
 */
export function PlanStatusCard() {
  const data = useQuery(planRef, {})

  if (data === undefined) return <Skeleton className="h-40 rounded-xl" />
  if (data === null) return null

  const sub = data.subscription
  const manage = (
    <Link href={CLINIC_PLAN_HREF} className="flex items-center gap-0.5 text-sm text-pt-muted hover:text-pt-ink">
      Manage
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  )

  // Billing not switched on yet: a pilot with full access
  if (!sub) {
    return (
      <Panel title="Your plan" actions={<StatusBadge tone="teal">Pilot</StatusBadge>}>
        <div className="space-y-1 px-5 py-4 sm:px-6">
          <p className="text-sm font-medium text-pt-ink">No plan yet</p>
          <p className="text-sm text-pt-muted">
            Your clinic has full access during the pilot. We&apos;ll email you before billing starts.
          </p>
        </div>
      </Panel>
    )
  }

  const tone = sub.status === 'active' ? 'green' : sub.status === 'read_only' ? 'red' : sub.status === 'cancelled' ? 'neutral' : 'amber'
  const billingOn = sub.status === 'active' || sub.status === 'past_due' || sub.status === 'read_only'
  const status =
    sub.status === 'read_only'
      ? 'Read-only until the overdue invoice is paid. Records stay available.'
      : sub.status === 'past_due'
        ? 'An invoice is overdue. Pay it to keep full access.'
        : sub.status === 'cancelled'
          ? 'Billing has stopped. No new invoices will be issued.'
          : sub.launchWeekFree
            ? `Free for launch week · billing starts ${day(sub.billingStartsAt)}`
            : billingOn && sub.nextInvoiceAt
              ? `Renews ${day(sub.nextInvoiceAt)} · ${formatKobo(sub.monthlyFeeKobo)} a month`
              : null

  return (
    <Panel title="Your plan" actions={manage}>
      <div className="space-y-4 px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight text-pt-ink">{sub.planName}</p>
            {status && <p className="mt-0.5 text-sm text-pt-muted">{status}</p>}
          </div>
          <StatusBadge tone={tone}>{SUBSCRIPTION_STATUS_LABEL[sub.status]}</StatusBadge>
        </div>

        {data.usage && billingOn && (
          <div className="grid gap-3">
            <MiniMeter label="Clinician seats" used={data.usage.seatsUsed} limit={sub.seatLimit} />
            <MiniMeter label="Patient programmes (30 days)" used={data.usage.activeProgrammes} limit={sub.programmeAllowance} />
          </div>
        )}

        {data.owedKobo > 0 && (
          <Button asChild size="sm" className={cn(primaryButtonClass, 'w-full')}>
            <Link href={CLINIC_PLAN_HREF}>Pay {formatKobo(data.owedKobo)}</Link>
          </Button>
        )}
      </div>
    </Panel>
  )
}
