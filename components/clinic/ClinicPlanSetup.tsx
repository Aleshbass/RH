'use client'

/**
 * Choose your plan and save a card (convex/clinicSelfServe.ts). Shown on the clinic's plan page:
 * the two plans when the clinic isn't on one, otherwise the saved card, switching before the
 * first charge, and cancelling.
 */
import { useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Check, CreditCard, Loader2, Lock } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Panel, primaryButtonClass } from '@/components/clinic/ui'
import { formatKobo } from '@/lib/clinicSubscriptions'
import { cn } from '@/lib/utils'
import { playSound } from '@/lib/sounds'

type PlanId = 'starter' | 'growth'
type PlanSetup = {
  plans: { id: PlanId; name: string; monthlyFeeKobo: number; programmeAllowance: number }[]
  current: {
    plan: string
    planName: string
    started: boolean
    custom: boolean
    cancelAtPeriodEnd: boolean
    endsAt: number | null
  } | null
  firstChargeAt: number
  firstChargeIsToday: boolean
  nextChargeAt: number
  card: { brand: string; last4: string | null; expiry: string | null; bank: string | null; addedAt: number } | null
  cardCheckKobo: number
} | null

const setupRef = makeFunctionReference<'query', Record<string, never>, PlanSetup>('clinicSelfServe:getMyPlanSetup')
const chooseRef = makeFunctionReference<'mutation', { plan: PlanId }, { startsAt: number; chargeNow: boolean }>(
  'clinicSelfServe:chooseClinicPlan'
)
const cardRef = makeFunctionReference<'action', Record<string, never>, { authorizationUrl: string }>('clinicSelfServe:startCardSetup')
const removeCardRef = makeFunctionReference<'mutation', Record<string, never>, null>('clinicSelfServe:removeClinicCard')
const cancelRef = makeFunctionReference<'mutation', Record<string, never>, { endsAt: number; immediate: boolean }>(
  'clinicSelfServe:cancelClinicPlan'
)
const keepRef = makeFunctionReference<'mutation', Record<string, never>, null>('clinicSelfServe:keepClinicPlan')

const errorText = (err: unknown, fallback: string) =>
  err instanceof ConvexError && typeof err.data === 'string' ? err.data : fallback
const day = (ms: number) => format(new Date(ms), 'd MMMM yyyy')

const INCLUDED = ['Unlimited clinicians', 'Team communication', 'Inventory', 'Clinical records, scheduling and invoicing']

/** "We'll charge it on 1 December 2026, then on the 1st of each month." */
function chargeLine(setup: NonNullable<PlanSetup>) {
  if (setup.firstChargeIsToday && !setup.current?.started) return 'Your first payment is today, then on this date each month.'
  const at = setup.current?.started ? setup.nextChargeAt : setup.firstChargeAt
  const date = new Date(at)
  const monthly = date.getDate() === 1 ? 'the 1st of each month' : 'that date each month'
  return `You won't pay anything until ${day(at)}. After that, on ${monthly}.`
}

export default function ClinicPlanSetup() {
  const setup = useQuery(setupRef, {})
  const choose = useMutation(chooseRef)
  const startCard = useAction(cardRef)
  const removeCard = useMutation(removeCardRef)
  const cancel = useMutation(cancelRef)
  const keep = useMutation(keepRef)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  if (!setup) return null

  const run = async (key: string, task: () => Promise<void>, fallback: string) => {
    setBusy(key)
    try {
      await task()
    } catch (err) {
      toast.error(errorText(err, fallback))
    } finally {
      setBusy(null)
    }
  }

  const openCard = () =>
    run(
      'card',
      async () => {
        const { authorizationUrl } = await startCard({})
        window.location.href = authorizationUrl
      },
      "We couldn't open the card page. Please try again."
    )

  const pick = (plan: PlanId) =>
    run(
      plan,
      async () => {
        const { chargeNow } = await choose({ plan })
        playSound('success')
        toast.success(chargeNow ? 'Your plan is set. Add a card to pay for your first month.' : 'Your plan is set. Add a card so it renews by itself.')
      },
      "We couldn't save your plan. Please try again."
    )

  const current = setup.current
  const canSwitch = current && !current.started && !current.custom && !current.cancelAtPeriodEnd

  // ── Not on a plan: choose one ──
  if (!current) {
    return (
      <Panel title="Choose your plan" description={chargeLine(setup)}>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          {setup.plans.map((plan) => (
            <div key={plan.id} className={cn('flex min-w-0 flex-col rounded-2xl border p-5', plan.id === 'growth' ? 'border-pt-primary' : 'border-pt-line')}>
              <p className="text-base font-semibold text-pt-ink">{plan.name}</p>
              <p className="mt-1 text-sm text-pt-muted">
                <span className="text-2xl font-semibold tabular-nums text-pt-ink">{formatKobo(plan.monthlyFeeKobo)}</span> a month
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-pt-ink">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-pt-primary" />
                  Joy recovery support for up to {plan.programmeAllowance} of your patients
                </li>
                {INCLUDED.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-pt-primary" />
                    {line}
                  </li>
                ))}
              </ul>
              <button type="button" className={cn(primaryButtonClass, 'mt-5 w-full justify-center')} disabled={busy !== null} onClick={() => pick(plan.id)}>
                {busy === plan.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Choose {plan.name.replace('Clinic ', '')}
              </button>
            </div>
          ))}
        </div>
        <p className="px-5 pb-5 text-xs text-pt-muted sm:px-6">
          Prices exclude VAT. Payments are handled securely by Paystack, and you can cancel at any time.
        </p>
      </Panel>
    )
  }

  // ── On a plan: the card, switching before the first charge, cancelling ──
  return (
    <Panel title="Payment" description={current.cancelAtPeriodEnd ? undefined : chargeLine(setup)}>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {current.cancelAtPeriodEnd && current.endsAt && (
          <div className="rounded-xl bg-pt-sunken px-4 py-3 text-sm text-pt-ink">
            You cancelled {current.planName}. It ends on {day(current.endsAt)}, and your card won&apos;t be charged again.
            <Button size="sm" variant="outline" className="ml-0 mt-2 block sm:ml-3 sm:mt-0 sm:inline-flex" disabled={busy !== null} onClick={() => run('keep', async () => { await keep({}); toast.success('Your plan carries on.') }, 'Please try again.')}>
              Keep my plan
            </Button>
          </div>
        )}

        {setup.card ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pt-sunken">
                <CreditCard className="h-5 w-5 text-pt-ink" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-pt-ink">
                  {setup.card.brand}
                  {setup.card.last4 ? ` ending ${setup.card.last4}` : ''}
                </p>
                <p className="text-xs text-pt-muted">
                  {setup.card.expiry ? `Expires ${setup.card.expiry}` : 'Saved'}
                  {setup.card.bank ? ` · ${setup.card.bank}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={openCard}>
                {busy === 'card' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Change card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => run('remove', async () => { await removeCard({}); toast.success('Card removed. You can pay each invoice from this page instead.') }, 'Please try again.')}
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-pt-line p-4">
            <p className="text-sm font-semibold text-pt-ink">Add a card so your plan renews by itself</p>
            <p className="mt-1 text-sm text-pt-muted">
              {setup.current?.started || setup.firstChargeIsToday
                ? 'You pay your open invoice now, and we keep the card for next time.'
                : `To check the card, Paystack takes ${formatKobo(setup.cardCheckKobo)} and we refund it straight away. Nothing else is charged before ${day(setup.firstChargeAt)}.`}
            </p>
            <button type="button" className={cn(primaryButtonClass, 'mt-3')} disabled={busy !== null} onClick={openCard}>
              {busy === 'card' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CreditCard className="mr-1.5 h-4 w-4" />}
              Add a card
            </button>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-pt-muted">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Paystack keeps your card. Rehabify only sees its brand and last 4 digits, and you get a receipt for every payment.
        </p>

        {(canSwitch || (!current.custom && !current.cancelAtPeriodEnd)) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-pt-line pt-4">
            {canSwitch &&
              setup.plans
                .filter((plan) => plan.id !== current.plan)
                .map((plan) => (
                  <Button key={plan.id} size="sm" variant="outline" disabled={busy !== null} onClick={() => pick(plan.id)}>
                    {busy === plan.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Switch to {plan.name.replace('Clinic ', '')} ({formatKobo(plan.monthlyFeeKobo)})
                  </Button>
                ))}
            {!confirmCancel ? (
              <Button size="sm" variant="ghost" className="text-pt-muted" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
                Cancel plan
              </Button>
            ) : (
              <span className="flex flex-wrap items-center gap-2 text-sm text-pt-ink">
                {current.started ? 'It ends when your paid month ends.' : 'Nothing will be charged.'}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      'cancel',
                      async () => {
                        const { immediate, endsAt } = await cancel({})
                        setConfirmCancel(false)
                        toast.success(immediate ? 'Your plan is cancelled.' : `Your plan ends on ${day(endsAt)}.`)
                      },
                      'Please try again.'
                    )
                  }
                >
                  {busy === 'cancel' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Yes, cancel
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </Button>
              </span>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
