'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { Check, Loader2, LogIn, PlayCircle } from '@/components/icons'
import { recoveryPlan } from '@/lib/recoveryPlans'
import { cn } from '@/lib/utils'
import { useFlexPaymentReturn, type PaidPlan, type PlanOffer } from './flex'

function PaymentReturnCheck() {
  useFlexPaymentReturn()
  return null
}

/** Put on any page Paystack returns to after a Flex payment (?reference=FLEX_…). */
export function FlexPaymentReturn() {
  return (
    <Suspense fallback={null}>
      <PaymentReturnCheck />
    </Suspense>
  )
}

/**
 * Shown in place of the demonstration (and the logging buttons) when an independent physio's
 * own patient doesn't have Flex. The steps below it stay free (Basic). Ink surface, lime action,
 * no glow.
 */
export function FlexUpgradeCard({
  offer,
  onChoose,
  busy,
  signInHref,
  className,
}: {
  offer: PlanOffer[]
  /** Starts the checkout. Leave out where paying isn't possible (then signInHref is shown). */
  onChoose?: (plan: PaidPlan) => void
  busy?: PaidPlan | null
  /** For the WhatsApp link page: sign in to buy from the dashboard. */
  signInHref?: string
  className?: string
}) {
  const flex = recoveryPlan('flex')
  return (
    <section className={cn('rounded-3xl bg-rh-ink p-5 text-white sm:p-6', className)} aria-label="Get Flex">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-rh-lime">
          <PlayCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-snug">See each exercise done, and track how you’re doing</h3>
          <p className="mt-0.5 text-sm text-white/70">Your steps are below and always free. Flex adds the rest.</p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {flex.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-white/85">
            <Check className="h-3.5 w-3.5 shrink-0 text-rh-lime" />
            {feature}
          </li>
        ))}
      </ul>

      {offer.length > 0 && (onChoose || !signInHref) ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {offer.map((plan, i) => (
            <button
              key={plan.id}
              type="button"
              disabled={!onChoose || Boolean(busy)}
              onClick={() => onChoose?.(plan.id)}
              className={cn(
                'flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60',
                i === 0 ? 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep' : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              <span>
                Get {plan.name}
                {plan.id === 'flex_max' && <span className="block text-xs font-medium opacity-75">Adds Joy on WhatsApp</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums opacity-90">
                {busy === plan.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {plan.priceLabel}
              </span>
            </button>
          ))}
        </div>
      ) : offer.length > 0 ? (
        <p className="mt-4 text-sm text-white/85">
          {offer.map((plan) => `${plan.name} ${plan.priceLabel}`).join(' · ')}
        </p>
      ) : null}

      {signInHref && (
        <Link
          href={signInHref}
          className={cn(
            'mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition sm:w-auto',
            onChoose ? 'text-white/80 underline-offset-4 hover:text-white hover:underline' : 'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep'
          )}
        >
          <LogIn className="h-4 w-4" />
          {onChoose ? 'Or sign in to your Rehabify account' : 'Sign in to get Flex'}
        </Link>
      )}

      <p className="mt-3 text-xs text-white/55">Paid to Rehabify. 30 days from when it starts, and it never renews by itself.</p>
    </section>
  )
}
