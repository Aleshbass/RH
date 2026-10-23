'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAction } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock3,
  Hourglass,
  Loader2,
  MonitorPlay,
  Receipt,
  RefreshCw,
  SearchX,
  Users,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { VerifyResult } from '@/convex/learn'
import { cn } from '@/lib/utils'
import { Fact, naira, pillOutline, pillTeal, pillWhite, PROGRAM } from './shared'

const DRAFT_KEY = 'rh-learn-register-draft'
const PENDING_RETRIES = 8
const PENDING_DELAY_MS = 4000

type Paid = Extract<VerifyResult, { status: 'paid' }>

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-rh-cream px-4 pb-20 pt-24 sm:px-6 sm:pt-28">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  )
}

function StateCard({
  icon: Icon,
  tone,
  title,
  children,
  actions,
  spin = false,
}: {
  icon: typeof AlertCircle
  tone: 'teal' | 'jasmine' | 'rose' | 'bone'
  title: string
  children: ReactNode
  actions?: ReactNode
  spin?: boolean
}) {
  const chip = {
    teal: 'bg-rh-honeydew text-rh-teal',
    jasmine: 'bg-rh-jasmine text-rh-night',
    rose: 'bg-rh-rose text-rh-night',
    bone: 'bg-rh-bone text-rh-night',
  }[tone]
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center shadow-soft sm:p-12">
      <span className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem]', chip)}>
        <Icon className={cn('h-7 w-7', spin && 'animate-spin')} />
      </span>
      <h1 className="mt-6 text-[28px] leading-tight tracking-tight text-rh-night sm:text-[34px]">{title}</h1>
      <div className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-rh-night/65">{children}</div>
      {actions && <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>}
    </div>
  )
}

/** A short burst of brand-coloured squares behind the success badge. */
function Celebration() {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.4
        const distance = 120 + (i % 5) * 34
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance * 0.7,
          size: 8 + (i % 4) * 4,
          rotate: (i % 2 ? 1 : -1) * (90 + i * 12),
          color: ['bg-rh-lime', 'bg-rh-mint', 'bg-rh-jasmine', 'bg-rh-rose', 'bg-rh-honeydew'][i % 5],
          delay: (i % 6) * 0.03,
        }
      }),
    []
  )
  if (reduce) return null
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-[88px] sm:top-[104px]">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className={cn('absolute rounded-[30%]', p.color)}
          style={{ width: p.size, height: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, scale: 1, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: 1.5, delay: 0.25 + p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  )
}

function Success({ result, reference }: { result: Paid; reference: string }) {
  const reduce = useReducedMotion()
  const summary = result.registration
  return (
    <Frame>
      <div className="relative overflow-hidden rounded-[2rem] bg-white px-6 py-12 text-center shadow-soft sm:rounded-[2.5rem] sm:px-12 sm:py-14">
        <Celebration />
        <motion.span
          className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-rh-lime text-rh-night"
          initial={reduce ? false : { scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        >
          <Check className="h-9 w-9" />
        </motion.span>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative"
        >
          <h1 className="mt-7 text-[34px] leading-tight tracking-tight text-rh-night sm:text-[44px]">
            You&apos;re in{summary?.firstName ? `, ${summary.firstName}` : ''}!
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[17px] leading-7 text-rh-night/70">
            Your place in the {summary?.cohort.cohortLabel ?? PROGRAM.shortTitle} is confirmed.
            {summary?.email ? ` We've emailed your confirmation to ${summary.email}.` : ' Your confirmation email is on its way.'}
          </p>
          {summary?.cohort.communityLink && (
            <a href={summary.cohort.communityLink} target="_blank" rel="noopener noreferrer" className={cn(pillTeal, 'mt-8 h-12 px-7')}>
              <Users className="h-4 w-4" /> Join the cohort group
            </a>
          )}
        </motion.div>
      </div>

      {summary && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="mt-4 rounded-[2rem] bg-white p-6 shadow-soft sm:p-9"
        >
          <h2 className="text-[22px] leading-tight text-rh-night">Your program</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Fact icon={CalendarDays} label="Dates" value={summary.cohort.dateRange} />
            <Fact icon={Video} label="Live sessions" value={summary.cohort.liveSessions} />
            <Fact icon={Clock3} label="Duration" value={summary.cohort.duration} />
            <Fact icon={MonitorPlay} label="Format" value={summary.cohort.format} />
            <Fact icon={BadgeCheck} label="Registration" value={summary.trackLabel} />
            <Fact icon={Receipt} label="Paid" value={summary.amountPaid !== null ? naira(summary.amountPaid) : '—'} />
          </div>
          <div className="mt-7 rounded-2xl bg-rh-honeydew p-5 text-sm leading-6 text-rh-night/75">
            <p className="font-semibold text-rh-night">What happens next</p>
            <p className="mt-1">
              Joining details for the live sessions come by email before the program starts. Every session is recorded, so you can catch
              up any time.
            </p>
          </div>
          <p className="mt-5 break-all text-xs text-rh-night/45">Payment reference: {reference}</p>
        </motion.div>
      )}

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/learn" className={cn(pillOutline, 'h-12')}>
          Program details
        </Link>
        <Link href="/" className={cn(pillTeal, 'h-12')}>
          Back to Rehabify <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </Frame>
  )
}

export function ConfirmationSkeleton() {
  return (
    <Frame>
      <StateCard icon={Loader2} spin tone="teal" title="Confirming your payment…">
        This usually takes a few seconds. Please keep this page open.
      </StateCard>
    </Frame>
  )
}

export function ConfirmationFlow() {
  const params = useSearchParams()
  const reference = (params.get('reference') || params.get('trxref') || '').trim()
  const verify = useAction(api.learn.verifyRegistrationPayment)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [failedToCheck, setFailedToCheck] = useState(false)
  const [run, setRun] = useState(0)

  const checkAgain = useCallback(() => {
    setResult(null)
    setFailedToCheck(false)
    setRun((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!reference) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const attempt = async (n: number) => {
      try {
        const next = (await verify({ reference })) as VerifyResult
        if (cancelled) return
        setResult(next)
        if (next.status === 'paid') {
          try {
            window.sessionStorage.removeItem(DRAFT_KEY)
          } catch {
            // ignore
          }
        }
        // Bank transfers and USSD can take a little while to settle
        if (next.status === 'pending' && n < PENDING_RETRIES) timer = setTimeout(() => attempt(n + 1), PENDING_DELAY_MS)
      } catch {
        if (cancelled) return
        if (n < 2) timer = setTimeout(() => attempt(n + 1), 2500)
        else setFailedToCheck(true)
      }
    }
    attempt(0)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [reference, verify, run])

  const support = (
    <a
      href={`mailto:${PROGRAM.supportEmail}?subject=${encodeURIComponent(`${PROGRAM.title} payment ${reference}`)}`}
      className="font-semibold text-rh-teal underline-offset-4 hover:underline"
    >
      {PROGRAM.supportEmail}
    </a>
  )

  if (!reference) {
    return (
      <Frame>
        <StateCard
          icon={SearchX}
          tone="bone"
          title="No payment to confirm"
          actions={
            <Link href="/learn" className={cn(pillTeal, 'h-12')}>
              Go to the program
            </Link>
          }
        >
          This page confirms a payment when you come back from Paystack. If you&apos;ve paid and landed here, check your email or contact{' '}
          {support}.
        </StateCard>
      </Frame>
    )
  }

  if (failedToCheck) {
    return (
      <Frame>
        <StateCard
          icon={AlertCircle}
          tone="jasmine"
          title="We couldn't check your payment just now"
          actions={
            <button type="button" onClick={checkAgain} className={cn(pillTeal, 'h-12')}>
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          }
        >
          Your connection may have dropped. If you were charged, you&apos;re covered: we confirm payments automatically and will email you.
        </StateCard>
      </Frame>
    )
  }

  if (!result) return <ConfirmationSkeleton />

  switch (result.status) {
    case 'paid':
      return <Success result={result} reference={reference} />
    case 'pending':
      return (
        <Frame>
          <StateCard
            icon={Hourglass}
            tone="jasmine"
            title="Your payment is still processing"
            actions={
              <button type="button" onClick={checkAgain} className={cn(pillTeal, 'h-12')}>
                <RefreshCw className="h-4 w-4" /> Check again
              </button>
            }
          >
            Bank transfers can take a few minutes. You don&apos;t need to pay again: we&apos;ll email your confirmation as soon as Paystack
            confirms it.
          </StateCard>
        </Frame>
      )
    case 'failed':
    case 'abandoned':
      return (
        <Frame>
          <StateCard
            icon={AlertCircle}
            tone="rose"
            title={result.status === 'failed' ? "Your payment didn't go through" : 'Payment not completed'}
            actions={
              <>
                <Link href="/learn/register" className={cn(pillTeal, 'h-12')}>
                  Try again <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/learn" className={cn(pillOutline, 'h-12')}>
                  Program details
                </Link>
              </>
            }
          >
            No money was taken for this attempt. Your details are saved, so trying again only takes a moment.
          </StateCard>
        </Frame>
      )
    case 'needs_review':
      return (
        <Frame>
          <StateCard icon={Receipt} tone="jasmine" title="We've received your payment">
            <p>
              We need to check one thing before confirming your place. Our team will be in touch by email, or you can contact {support} and
              quote this reference:
            </p>
            <p className="mt-3 break-all rounded-xl bg-rh-canvas px-3 py-2 font-mono text-xs text-rh-night">{reference}</p>
          </StateCard>
        </Frame>
      )
    default:
      return (
        <Frame>
          <StateCard
            icon={SearchX}
            tone="bone"
            title="We couldn't find this payment"
            actions={
              <>
                <button type="button" onClick={checkAgain} className={cn(pillWhite, 'h-12 ring-1 ring-inset ring-rh-night/15')}>
                  <RefreshCw className="h-4 w-4" /> Check again
                </button>
                <Link href="/learn/register" className={cn(pillTeal, 'h-12')}>
                  Register
                </Link>
              </>
            }
          >
            If you were charged, contact {support} with your payment reference and we&apos;ll sort it out quickly.
          </StateCard>
        </Frame>
      )
  }
}
