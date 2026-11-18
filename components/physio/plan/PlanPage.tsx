'use client'

/**
 * Settings › Plan & billing (owner spec 17 Nov 2026; Paul: "they know the plan they're on, and it
 * updates smoothly when they pay"). The plan, this month's usage, Free vs Pro, the card and
 * payments. Everything comes from one live query, so a payment shows up the moment it lands.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, Building2, Check, CreditCard, Crown, Globe, Loader2, Lock, Mic, Users } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI'
import { dayLabel, naira, planFeatures } from '@/lib/physioPlans'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { planApi, type MyPlan, type Purpose } from './planApi'

const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })
const dayYear = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })
const errorText = (err: unknown, fallback: string) => {
  const data = (err as { data?: unknown })?.data
  return typeof data === 'string' && data ? data : fallback
}

const primary =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-rh-lime px-6 text-sm font-semibold text-rh-ink transition hover:brightness-95 active:scale-[0.98] disabled:opacity-60'
const ghostLight = 'inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:bg-white/10'
const outline =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/10 px-4 text-sm font-semibold text-rh-ink transition hover:bg-black/[0.03] disabled:opacity-60 dark:border-white/15 dark:text-white dark:hover:bg-white/[0.06]'

/** What to call the plan, and the one line under it. */
function describe(p: MyPlan) {
  const sub = p.subscription
  const card = p.card ? `${p.card.brand}${p.card.last4 ? ` ending ${p.card.last4}` : ''}` : null
  switch (p.plan.kind) {
    case 'clinic':
      return {
        name: `Covered by ${p.plan.clinicName}`,
        line: sub?.status === 'paused' ? 'Your own Pro is paused while your clinic covers you. It can start again if you leave.' : 'Your clinic’s plan covers everything you do here.',
        icon: Building2,
      }
    case 'granted':
      return { name: 'Individual Pro', line: `Given by Rehabify until ${dayYear(p.plan.grantUntil!)}.`, icon: Crown }
    case 'tester':
      return { name: 'Individual Pro', line: `Free while Rehabify launches in ${p.plan.country ?? 'your country'}. Thank you for testing with us.`, icon: Globe }
    case 'pro': {
      const name = sub?.founding ? 'Individual Pro · founding' : 'Individual Pro'
      if (sub?.status === 'past_due')
        return { name, line: `Your last payment didn’t go through. Pro stays on until ${day(sub.graceUntil ?? Date.now())} while we retry.`, icon: Crown, warn: true }
      if (sub?.cancelAtPeriodEnd && sub.periodEnd) return { name, line: `Ends ${day(sub.periodEnd)}. You’ll move to Free then.`, icon: Crown }
      if (sub?.periodEnd)
        return {
          name,
          line: card
            ? `Renews ${day(sub.periodEnd)} for ${naira(sub.nextPriceKobo)} on your ${card}.`
            : `Paid to ${day(sub.periodEnd - 1)}. Renew by card or bank transfer before then.`,
          icon: Crown,
        }
      return { name, line: 'You’re on Pro.', icon: Crown }
    }
    default:
      if (sub?.status === 'scheduled')
        return {
          name: 'Free',
          line: card
            ? `Pro is locked in${sub.founding ? ' at the founding price' : ''}. It starts ${day(sub.nextChargeAt ?? Date.now())} for ${naira(sub.nextPriceKobo)}.`
            : `Pro is chosen. Pay to start it.`,
          icon: Lock,
        }
      return { name: 'Free', line: 'Everything you need to get going, with monthly limits.', icon: Users }
  }
}

function Meter({ icon: Icon, label, used, limit, hint }: { icon: typeof Users; label: string; used: number; limit: number | null; hint: string }) {
  const reduce = useReducedMotion()
  const pct = limit ? Math.min(100, Math.round((used / Math.max(1, limit)) * 100)) : 0
  const full = limit !== null && used >= limit
  return (
    <div className="rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
          <Icon className="h-4 w-4 text-neutral-500" /> {label}
        </span>
        <span className="text-sm tabular-nums text-neutral-500">
          <motion.span key={used} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="inline-block font-semibold text-rh-ink dark:text-white">
            {used}
          </motion.span>
          {limit !== null ? ` of ${limit}` : ' · unlimited'}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <motion.div
          className={cn('h-full rounded-full', full ? 'bg-amber-500' : 'bg-rh-lime')}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: limit === null ? '100%' : `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={limit === null ? { opacity: 0.35 } : undefined}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">{hint}</p>
    </div>
  )
}

function PlanColumn({
  title,
  price,
  priceNote,
  strike,
  features,
  current,
  highlight,
  action,
}: {
  title: string
  price: string
  priceNote: string
  strike?: string
  features: string[]
  current: boolean
  highlight?: boolean
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-3xl border p-5 sm:p-6',
        highlight ? 'border-rh-ink bg-rh-ink text-white dark:border-white/15' : 'border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-white/[0.02]'
      )}
    >
      {current && (
        <span className={cn('absolute right-4 top-4 rounded-full px-2.5 py-1 text-[11px] font-semibold', highlight ? 'bg-rh-lime text-rh-ink' : 'bg-rh-ink text-white dark:bg-white dark:text-rh-ink')}>
          Your plan
        </span>
      )}
      <p className={cn('text-sm font-semibold', highlight ? 'text-rh-lime' : 'text-neutral-500')}>{title}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className={cn('text-3xl font-semibold tracking-tight tabular-nums', !highlight && 'text-rh-ink dark:text-white')}>{price}</span>
        {strike && <span className={cn('text-sm tabular-nums line-through', highlight ? 'text-white/45' : 'text-neutral-400')}>{strike}</span>}
      </p>
      <p className={cn('mt-1 text-xs', highlight ? 'text-white/60' : 'text-neutral-500')}>{priceNote}</p>
      <ul className="mt-5 flex-1 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check className={cn('mt-0.5 h-4 w-4 shrink-0', highlight ? 'text-rh-lime' : 'text-rh-ink dark:text-white')} />
            <span className={highlight ? 'text-white/85' : 'text-neutral-700 dark:text-neutral-300'}>{f}</span>
          </li>
        ))}
      </ul>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function PlanPage() {
  const data = useQuery(planApi.mine, {})
  const start = useAction(planApi.start)
  const verify = useAction(planApi.verify)
  const cancel = useMutation(planApi.cancel)
  const keep = useMutation(planApi.keep)
  const removeCard = useMutation(planApi.removeCard)
  const router = useRouter()
  const params = useSearchParams()
  const reduce = useReducedMotion()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const prevKind = useRef<string | null>(null)

  // Back from Paystack: confirm the payment, then let the live query move the page along
  useEffect(() => {
    const reference = params.get('reference') ?? params.get('trxref')
    if (params.get('pro') !== 'return' || !reference) return
    setConfirming(true)
    verify({ reference })
      .then((res) => {
        if (!res.ok && res.reason === 'card_unusable') toast.error('That card can’t be charged again later. Try another card.')
        else if (!res.ok && res.reason !== 'unverified') toast.error('We couldn’t confirm that payment. If money left your account, it will show here shortly.')
        else if (res.kind === 'card_check') {
          playSound('success')
          toast.success('Card saved. We refunded the check.')
        } else if (res.kind === 'topup') {
          playSound('success')
          toast.success('Scribe top-up added. Those sessions never expire.')
        } else if (res.kind === 'joy') {
          playSound('success')
          toast.success('Joy is back on for that patient this month.')
        }
      })
      .catch(() => toast.error('We couldn’t confirm that payment yet. It will show here when it lands.'))
      .finally(() => {
        setConfirming(false)
        router.replace('/dashboard/physiotherapist/settings/plan', { scroll: false })
      })
    // run once per return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The moment the plan changes (a payment landed), celebrate once
  useEffect(() => {
    if (!data) return
    const kind = data.plan.kind
    if (prevKind.current && prevKind.current !== kind && kind === 'pro') {
      playSound('success')
      toast.success('You’re on Individual Pro')
    }
    prevKind.current = kind
  }, [data])

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <SettingsPageHeader title="Plan & billing" />
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-32 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    )
  }
  if (data === null) return null

  const s = data.settings
  const sub = data.subscription
  const kind = data.plan.kind
  const onPro = kind !== 'free'
  const d = describe(data)
  const features = planFeatures(s)
  const founding = data.offer.founding
  const launched = data.offer.launched

  const go = async (purpose: Purpose, patientId?: string) => {
    setBusy(patientId ? `${purpose}-${patientId}` : purpose)
    try {
      const { authorizationUrl } = await start({ purpose, ...(patientId ? { patientId } : {}) })
      window.location.href = authorizationUrl
    } catch (err) {
      toast.error(errorText(err, 'We couldn’t open the payment page. Please try again.'))
      setBusy(null)
    }
  }

  const upgradeLabel = !launched
    ? founding
      ? `Lock in ${naira(s.foundingPriceKobo)} a month`
      : 'Lock in Pro'
    : sub?.status === 'scheduled'
      ? `Pay ${naira(sub.nextPriceKobo)} and start Pro`
      : `Upgrade for ${naira(data.offer.priceKobo)} a month`

  const heroAction = (() => {
    if (kind === 'clinic' || kind === 'granted' || kind === 'tester') return null
    if (kind === 'pro' && sub?.status === 'past_due')
      return (
        <button type="button" className={primary} disabled={busy !== null} onClick={() => go('renew')}>
          {busy === 'renew' && <Loader2 className="h-4 w-4 animate-spin" />} Pay {naira(sub.nextPriceKobo)} now
        </button>
      )
    if (kind === 'pro' && sub?.cancelAtPeriodEnd)
      return (
        <button
          type="button"
          className={primary}
          disabled={busy !== null}
          onClick={async () => {
            setBusy('keep')
            try {
              await keep({})
              toast.success('Pro carries on')
            } finally {
              setBusy(null)
            }
          }}
        >
          Keep Pro
        </button>
      )
    if (kind === 'pro' && !data.card)
      return (
        <button type="button" className={ghostLight} disabled={busy !== null} onClick={() => go('renew')}>
          {busy === 'renew' && <Loader2 className="h-4 w-4 animate-spin" />} Renew now
        </button>
      )
    if (kind === 'free' && !(sub?.status === 'scheduled' && data.card && !launched))
      return (
        <button type="button" className={primary} disabled={busy !== null} onClick={() => go('upgrade')}>
          {busy === 'upgrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />} {upgradeLabel}
        </button>
      )
    return null
  })()

  return (
    <div className="space-y-6">
      <SettingsPageHeader title="Plan & billing" description="Your plan, what you’ve used this month, and your payments." />

      {/* The plan */}
      <motion.section layout className="relative overflow-hidden rounded-3xl bg-rh-ink p-6 text-white ring-1 ring-white/[0.06] sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Your plan</p>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${kind}-${sub?.status ?? ''}-${sub?.cancelAtPeriodEnd ? 1 : 0}`}
                initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <h2 className="mt-2 flex items-center gap-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', onPro ? 'bg-rh-lime text-rh-ink' : 'bg-white/10 text-white')}>
                    <d.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">{d.name}</span>
                </h2>
                <p className={cn('mt-3 max-w-xl text-sm leading-6', d.warn ? 'text-amber-300' : 'text-white/70')}>{d.line}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          {heroAction && <div className="shrink-0">{heroAction}</div>}
        </div>
        <AnimatePresence>
          {(confirming || data.confirming) && kind === 'free' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center gap-3 bg-rh-ink/90 text-sm font-semibold backdrop-blur-sm"
            >
              <Loader2 className="h-5 w-5 animate-spin text-rh-lime" /> Confirming your payment…
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* This month */}
      <SettingsSection
        title={`This month (${data.usage.monthLabel})`}
        description={
          data.usage.limitsActive
            ? onPro
              ? 'Pro covers every patient you see.'
              : 'Free limits reset on the 1st of each month.'
            : onPro
              ? 'Pro covers every patient you see.'
              : `Staying on Free? Nothing is limited until ${dayYear(data.usage.limitsFrom)}.`
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter
            icon={Users}
            label="Patients on programmes you cover"
            used={data.usage.patients.used}
            limit={data.usage.patients.limit}
            hint={onPro ? 'Fair use. Clinic patients and patients paying Flex never count.' : 'Different patients this month. Patients paying Flex themselves never count.'}
          />
          <Meter
            icon={Mic}
            label="Rehabify Scribe sessions"
            used={data.usage.scribe.used}
            limit={data.usage.scribe.limit}
            hint={
              data.usage.scribe.credits > 0
                ? `Plus ${data.usage.scribe.credits} top-up session${data.usage.scribe.credits === 1 ? '' : 's'}, used after these. A session is one visit up to 30 minutes.`
                : 'A session is one visit up to 30 minutes; longer ones count as 2. Scribe never stops mid-session.'
            }
          />
        </div>
        {kind !== 'clinic' && (
          <div className="mt-4 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-rh-ink dark:text-white">
                <Users className="h-4 w-4 text-neutral-500" /> Joy on WhatsApp
              </span>
              <span className="text-sm tabular-nums text-neutral-500">
                <span className="font-semibold text-rh-ink dark:text-white">{data.usage.joy.patients}</span> patient{data.usage.joy.patients === 1 ? '' : 's'} this month
                {onPro && data.usage.joy.included ? ` · ${data.usage.joy.usedIncluded} of ${data.usage.joy.included} included` : ''}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              {onPro
                ? `Pro includes Joy for ${s.proJoyPatients} patients a month; each one after that is ${naira(s.joyPerPatientKobo)} for their month.`
                : `On Free, Joy is ${naira(s.joyPerPatientKobo)} per patient a month: the patient pays with Flex Max, or you pay here.`}{' '}
              A patient counts the first time Joy messages them about their care that month. Joy always answers when they message first.
              {!data.usage.limitsActive ? ' Nothing is charged before the limits start.' : ''}
            </p>
            {data.usage.joy.waiting.length > 0 && (
              <ul className="mt-3 divide-y divide-black/[0.05] rounded-xl bg-white dark:divide-white/[0.06] dark:bg-white/[0.03]">
                {data.usage.joy.waiting.map((p) => (
                  <li key={p.patientId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-rh-ink dark:text-white">{p.name}</span>
                      <span className="text-neutral-500"> · Joy is waiting this month</span>
                    </span>
                    <button type="button" className={outline} disabled={busy !== null} onClick={() => go('joy', p.patientId)}>
                      {busy === `joy-${p.patientId}` && <Loader2 className="h-4 w-4 animate-spin" />} Pay {naira(s.joyPerPatientKobo)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* Top-ups only matter once the limits apply (1 Jan, or from joining for new physios) */}
        {kind !== 'clinic' && data.usage.limitsActive && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-black/10 px-4 py-3 dark:border-white/15">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Need more Scribe? {s.scribeTopUpSessions} sessions for {naira(s.scribeTopUpKobo)}. They never expire.
            </p>
            <button type="button" className={outline} disabled={busy !== null} onClick={() => go('topup')}>
              {busy === 'topup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />} Buy {s.scribeTopUpSessions} sessions
            </button>
          </div>
        )}
      </SettingsSection>

      {/* Free vs Pro */}
      {kind !== 'clinic' && (
        <SettingsSection
          title="Plans"
          description={
            founding
              ? `You joined early, so Pro is ${naira(s.foundingPriceKobo)} a month for your first ${s.foundingMonths} months.`
              : 'Upgrade when you need more. Cancel any time; Pro runs to the end of the month you paid for.'
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <PlanColumn title="Free" price="₦0" priceNote="Always free" features={features.free} current={kind === 'free'} />
            <PlanColumn
              title="Individual Pro"
              price={naira(founding ? s.foundingPriceKobo : s.proPriceKobo)}
              strike={founding ? naira(s.proPriceKobo) : undefined}
              priceNote={founding ? `a month · founding price for ${s.foundingMonths} months, then ${naira(s.proPriceKobo)}` : 'a month'}
              features={features.pro}
              current={onPro}
              highlight
              action={
                kind === 'free' && heroAction ? (
                  <button type="button" className={cn(primary, 'w-full')} disabled={busy !== null} onClick={() => go('upgrade')}>
                    {busy === 'upgrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {upgradeLabel} <ArrowRight className="h-4 w-4" />
                  </button>
                ) : undefined
              }
            />
          </div>
          {!launched && (
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-neutral-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-semibold text-neutral-700 dark:text-neutral-300">Pro starts {dayLabel(s.launchDate, false)}.</strong> Choose it now and your
                first month is charged on {dayLabel(s.launchDate, false)}: we only check your card today ({naira(data.offer.cardCheckKobo)}, refunded straight away).
                Staying on Free? Nothing is limited until {dayYear(data.usage.limitsFrom)}.
              </span>
            </p>
          )}
        </SettingsSection>
      )}

      {/* Payment method */}
      {sub && kind !== 'clinic' && ['scheduled', 'active', 'past_due'].includes(sub.status) && (
        <SettingsSection title="Payment method">
          {data.card ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rh-canvas dark:bg-white/[0.05]">
                  <CreditCard className="h-5 w-5 text-rh-ink dark:text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-rh-ink dark:text-white">
                    {data.card.brand}
                    {data.card.last4 ? ` ending ${data.card.last4}` : ''}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {data.card.expiry ? `Expires ${data.card.expiry}` : 'Saved'}
                    {data.card.bank ? ` · ${data.card.bank}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className={outline} disabled={busy !== null} onClick={() => go('card')}>
                  {busy === 'card' && <Loader2 className="h-4 w-4 animate-spin" />} Change card
                </button>
                <button
                  type="button"
                  className="h-10 rounded-full px-3 text-sm font-semibold text-neutral-500 hover:text-rh-ink dark:hover:text-white"
                  disabled={busy !== null}
                  onClick={async () => {
                    await removeCard({})
                    toast.success('Card removed. You can renew by hand from this page.')
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">No card saved. Add one so Pro renews by itself, or renew here each month by bank transfer.</p>
              <button type="button" className={outline} disabled={busy !== null} onClick={() => go('card')}>
                {busy === 'card' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Add a card
              </button>
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 text-xs text-neutral-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Paystack keeps your card. Rehabify only sees its brand and last 4 digits, and you get a receipt for every payment.
          </p>
        </SettingsSection>
      )}

      {/* Payments */}
      {data.payments.some((p) => p.status === 'paid' && p.kind !== 'card_check') && (
        <SettingsSection title="Payments" description="Receipts are emailed to you.">
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {data.payments
              .filter((p) => p.status === 'paid' && p.kind !== 'card_check')
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium text-rh-ink dark:text-white">Individual Pro</span>
                    <span className="block text-xs text-neutral-500">
                      {p.periodStart && p.periodEnd ? `${day(p.periodStart)} to ${day(p.periodEnd - 1)}` : p.paidAt ? dayYear(p.paidAt) : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-rh-ink dark:text-white">{naira(p.amountKobo)}</span>
                </li>
              ))}
          </ul>
        </SettingsSection>
      )}

      {/* Cancel */}
      {sub && kind === 'pro' && !sub.cancelAtPeriodEnd && ['active', 'past_due'].includes(sub.status) && (
        <div className="flex flex-wrap items-center gap-3 px-1 text-sm">
          {!confirmCancel ? (
            <button type="button" className="text-neutral-500 underline-offset-4 hover:text-rh-ink hover:underline dark:hover:text-white" onClick={() => setConfirmCancel(true)}>
              Cancel Pro
            </button>
          ) : (
            <>
              <span className="text-neutral-600 dark:text-neutral-300">
                {sub.status === 'active' && sub.periodEnd ? `Pro stays on until ${day(sub.periodEnd)}, then you move to Free. No part-month refunds.` : 'You’ll move to Free now.'}
              </span>
              <button
                type="button"
                className="h-9 rounded-full bg-rose-600 px-4 font-semibold text-white"
                onClick={async () => {
                  try {
                    const res = await cancel({})
                    setConfirmCancel(false)
                    toast.success(res.endsAt ? `Pro ends ${day(res.endsAt)}` : 'You’re on Free now')
                  } catch (err) {
                    toast.error(errorText(err, 'Please try again.'))
                  }
                }}
              >
                Yes, cancel
              </button>
              <button type="button" className="text-neutral-500 hover:text-rh-ink" onClick={() => setConfirmCancel(false)}>
                Keep it
              </button>
            </>
          )}
        </div>
      )}
      {sub?.status === 'scheduled' && kind === 'free' && (
        <div className="px-1 text-sm">
          <button
            type="button"
            className="text-neutral-500 underline-offset-4 hover:text-rh-ink hover:underline"
            onClick={async () => {
              await cancel({})
              toast.success('Pro is no longer locked in')
            }}
          >
            Don’t start Pro
          </button>
        </div>
      )}
    </div>
  )
}

/** The small plan pill in the physio sidebar: "Free · 2 of 3 patients" or "Pro". */
export function PlanBadge({ className }: { className?: string }) {
  const data = useQuery(planApi.mine, {})
  if (!data || data.plan.kind === 'clinic') return null
  const onPro = data.plan.kind !== 'free'
  const patients = data.usage.patients
  return (
    <a
      href="/dashboard/physiotherapist/settings/plan"
      className={cn(
        'flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition',
        onPro ? 'bg-rh-ink text-white ring-1 ring-white/10' : 'bg-pt-sunken text-pt-ink hover:brightness-[0.97]',
        className
      )}
    >
      <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', onPro ? 'bg-rh-lime text-rh-ink' : 'bg-pt-surface text-pt-ink')}>
        {onPro ? <Crown className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {onPro ? 'Individual Pro' : patients.limit !== null ? `Free · ${patients.used} of ${patients.limit} patients` : 'Free'}
      </span>
      {!onPro && <span className="shrink-0 text-[11px] text-pt-muted">Upgrade</span>}
    </a>
  )
}
