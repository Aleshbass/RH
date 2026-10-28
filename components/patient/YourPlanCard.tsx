'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { makeFunctionReference } from 'convex/server'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Check, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Panel, StatusBadge, accentButtonClass, formatNaira, secondaryButtonClass, softButtonClass } from '@/components/patient/ui'
import { FlexPaymentReturn } from '@/components/exercise-programs/FlexUpgradeCard'
import { useFlexCheckout, type PaidPlan } from '@/components/exercise-programs/flex'
import { programError } from '@/components/exercise-programs/errors'
import type { myRecoveryPlan } from '@/convex/exercisePrograms'
import type { QueryResult } from '@/lib/convexUntyped'
import { recoveryPlan } from '@/lib/recoveryPlans'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type MyPlan = QueryResult<typeof myRecoveryPlan>

const myPlanRef = makeFunctionReference<'query', Record<string, never>, MyPlan>('exercisePrograms:myRecoveryPlan')
const refundRef = makeFunctionReference<'mutation', { entitlementId: string }, { requested: boolean; amountKobo: number }>(
  'exercisePrograms:requestFlexRefund'
)

const PLAN_INFO =
  'Basic is always free: your exercises, doses, steps and your physio’s notes. Flex adds demonstrations and progress tracking; Flex Max adds Joy on WhatsApp. Each runs for 30 days from when your programme is ready, and never renews by itself.'

/**
 * "Your plan": Basic, Flex and Flex Max for an independent physio's own patients (everyone else
 * has it all included and never sees this). Shows what they have, lets them buy, renew or
 * switch, and ask for a refund under Payment Policy 4.8.
 */
export function YourPlanCard() {
  const data = useQuery(myPlanRef, {})
  const { checkout, busy } = useFlexCheckout({ from: 'dashboard' })
  const requestRefund = useMutation(refundRef)
  const [confirmRefund, setConfirmRefund] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const show = Boolean(
    data && (data.mustBuy || data.current || data.upcoming.length > 0 || data.refundRequested.length > 0 || data.refund)
  )

  // The renew link in the "ends soon" email points here (#your-plan)
  useEffect(() => {
    if (show && window.location.hash === '#your-plan') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [show])

  if (!data || !show) return <FlexPaymentReturn />

  const { current, upcoming, offer, refund } = data
  const next = upcoming[0] ?? null

  const askRefund = async () => {
    if (!refund) return
    setRefunding(true)
    try {
      await requestRefund({ entitlementId: refund.entitlementId })
      playSound('success')
      toast.success('Refund requested. We’ll confirm it within 3 business days.')
      setConfirmRefund(false)
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'We couldn’t request the refund. Please try again.'))
    } finally {
      setRefunding(false)
    }
  }

  const actionLabel = (plan: PaidPlan) => {
    if (!current) return `Get ${recoveryPlan(plan).name}`
    if (current.plan === plan) return 'Renew'
    return `Switch to ${recoveryPlan(plan).name}`
  }

  return (
    <div ref={ref} id="your-plan" className="scroll-mt-20">
    <Panel
      title={
        <span className="flex items-center gap-2">
          Your plan
          <StatusBadge tone={current ? 'green' : 'neutral'}>{current ? current.name : 'Basic'}</StatusBadge>
        </span>
      }
      info={PLAN_INFO}
      description={
        current
          ? `Until ${format(current.expiresAt ?? Date.now(), 'd MMMM')}. It doesn’t renew by itself.`
          : 'Your exercises and your physio’s instructions are always free.'
      }
    >
      <FlexPaymentReturn />
      <div className="space-y-4">
        {next && (
          <p className="rounded-2xl bg-pt-sunken px-4 py-3 text-sm text-pt-ink">
            {next.status === 'pending_activation'
              ? `${next.name} is paid for. Your 30 days start when your physiotherapist’s programme is ready.`
              : `Your next ${next.name} starts on ${format(next.activatedAt ?? Date.now(), 'd MMMM')}.`}
          </p>
        )}
        {data.refundRequested.map((row) => (
          <p key={row._id} className="rounded-2xl bg-pt-amber-bg px-4 py-3 text-sm text-pt-amber-fg">
            Refund requested for {row.name} ({formatNaira(row.amountKobo / 100)}). We’ll confirm it within 3 business days.
          </p>
        ))}

        {data.mustBuy && offer.length > 0 && (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-pt-line p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-pt-ink">Basic</p>
                <span className="text-sm font-semibold text-pt-ink">Free</span>
              </div>
              <p className="mt-1 text-[13px] text-pt-muted">{recoveryPlan('basic').description}</p>
              <p className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13px] font-medium text-pt-green-fg">
                <Check className="h-3.5 w-3.5" /> Always yours
              </p>
            </div>
            {offer.map((plan) => {
              const isCurrent = current?.plan === plan.id
              return (
                <div
                  key={plan.id}
                  className={cn('flex flex-col rounded-2xl p-4', isCurrent ? 'bg-rh-ink text-white' : 'border border-pt-line')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('font-semibold', isCurrent ? 'text-white' : 'text-pt-ink')}>{plan.name}</p>
                    <span className={cn('text-sm font-semibold tabular-nums', isCurrent ? 'text-rh-lime' : 'text-pt-ink')}>
                      {formatNaira(plan.priceKobo / 100)}
                    </span>
                  </div>
                  <ul className={cn('mt-2 space-y-1 text-[13px]', isCurrent ? 'text-white/80' : 'text-pt-muted')}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5">
                        <Check className={cn('mt-0.5 h-3 w-3 shrink-0', isCurrent ? 'text-rh-lime' : 'text-pt-green-fg')} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    disabled={!data.canPay || Boolean(busy)}
                    onClick={() => void checkout(plan.id)}
                    className={cn(
                      'mt-4 h-11 w-full',
                      isCurrent || plan.id === 'flex' ? accentButtonClass : secondaryButtonClass
                    )}
                  >
                    {busy === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {actionLabel(plan.id)}
                  </Button>
                  <p className={cn('mt-1.5 text-center text-[11px]', isCurrent ? 'text-white/55' : 'text-pt-faint')}>30 days · no auto-renewal</p>
                </div>
              )
            })}
          </div>
        )}

        {data.mustBuy && !data.canPay && (
          <p className="text-[13px] text-pt-muted">
            Add your email address in{' '}
            <Link href="/dashboard/patient/settings" className="font-medium text-pt-ink underline-offset-4 hover:underline">
              Settings
            </Link>{' '}
            first, so we can send your receipt.
          </p>
        )}

        {refund &&
          (confirmRefund ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-pt-sunken p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-pt-ink">
                Cancel {refund.name} and get {formatNaira(refund.amountKobo / 100)} back? Your exercises stay free on Basic.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button type="button" onClick={() => setConfirmRefund(false)} className={cn(softButtonClass, 'h-10')}>
                  Keep it
                </Button>
                <Button type="button" disabled={refunding} onClick={() => void askRefund()} className={cn(secondaryButtonClass, 'h-10')}>
                  {refunding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancel and refund
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRefund(true)}
              className="text-[13px] font-medium text-pt-muted underline-offset-4 hover:text-pt-ink hover:underline"
            >
              {refund.reason === 'flex_not_ready_7d'
                ? `Your programme isn’t ready yet. Cancel ${refund.name} for a full refund`
                : `Changed your mind? Cancel ${refund.name} for a full refund${refund.until ? ` until ${format(refund.until, 'd MMM, h:mm a')}` : ''}`}
            </button>
          ))}
      </div>
    </Panel>
    </div>
  )
}
