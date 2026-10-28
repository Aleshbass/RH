'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { makeFunctionReference } from 'convex/server'
import { useAction, useQuery } from 'convex/react'
import { toast } from 'sonner'
import type { PaidPlan, PlanOffer } from '@/convex/helpers/patientPlans'
import type { FlexVerifyResult } from '@/convex/exercisePrograms'
import { withLiveState, type RecoveryPlansLive } from '@/lib/recoveryPlans'
import { playSound } from '@/lib/sounds'
import { programError } from './errors'

// Flex and Flex Max on the client. References are built by name (not `api.x.y`) to keep the app's
// type check under TypeScript's depth limit. Rules: convex/helpers/patientPlans.ts.

export type { PaidPlan, PlanOffer }

type Share = { code: string; session: string }
type CheckoutArgs = { plan: PaidPlan; share?: Share; from?: 'dashboard' | 'exercises'; returnOrigin?: string }

const livePlansRef = makeFunctionReference<'query', Record<string, never>, RecoveryPlansLive>('exercisePrograms:recoveryPlansLive')
const startCheckoutRef = makeFunctionReference<'action', CheckoutArgs, { authorizationUrl: string; reference: string }>(
  'exercisePrograms:startFlexCheckout'
)
const verifyRef = makeFunctionReference<'action', { reference: string }, FlexVerifyResult>('exercisePrograms:verifyFlexPayment')

/** Basic, Flex and Flex Max with `available` from the admin's launch switch. */
export function useRecoveryPlans() {
  const live = useQuery(livePlansRef, {})
  return { plans: withLiveState(live), live, loading: live === undefined }
}

/** Starts a Paystack checkout and leaves for the payment page. */
export function useFlexCheckout(options: { share?: Share; from?: 'dashboard' | 'exercises' } = {}) {
  const start = useAction(startCheckoutRef)
  const [busy, setBusy] = useState<PaidPlan | null>(null)
  const { share, from } = options
  const checkout = useCallback(
    async (plan: PaidPlan) => {
      setBusy(plan)
      try {
        const { authorizationUrl } = await start({ plan, share, from, returnOrigin: window.location.origin })
        window.location.assign(authorizationUrl)
      } catch (error) {
        playSound('error')
        toast.error(programError(error, 'We couldn’t start the payment. Please try again.'))
        setBusy(null)
      }
    },
    [start, share, from]
  )
  return { checkout, busy }
}

const PLAN_NAMES: Record<PaidPlan, string> = { flex: 'Flex', flex_max: 'Flex Max' }

/**
 * When Paystack sends the payer back (?reference=FLEX_…), checks the payment with Paystack
 * through Convex and says how it went. The webhook completes it too if the page is closed.
 */
export function useFlexPaymentReturn() {
  const params = useSearchParams()
  const verify = useAction(verifyRef)
  const reference = params?.get('reference') ?? params?.get('trxref') ?? null
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!reference || !reference.startsWith('FLEX_') || handled.current === reference) return
    handled.current = reference
    const clean = () => {
      const url = new URL(window.location.href)
      url.searchParams.delete('reference')
      url.searchParams.delete('trxref')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    void verify({ reference })
      .then((result) => {
        if (result.status === 'paid') {
          playSound('success')
          const name = PLAN_NAMES[result.plan]
          toast.success(
            result.activation === 'pending_activation'
              ? `${name} is paid for. Your 30 days start when your physio’s programme is ready.`
              : `${name} is on. Your receipt is on its way by email.`
          )
        } else if (result.status === 'pending') {
          toast.info('Your payment is still being confirmed. It will show here in a few minutes.')
        } else if (result.status === 'needs_review') {
          toast.error('We received your payment but need to check it. Our team will be in touch.')
        } else if (result.status === 'failed' || result.status === 'abandoned') {
          toast.error('The payment didn’t go through. You haven’t been charged.')
        }
      })
      .catch(() => toast.info('We’re confirming your payment. It will show here shortly.'))
      .finally(clean)
  }, [reference, verify])
}
