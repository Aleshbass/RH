'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Clock3,
  Info,
  Loader2,
  Lock,
  LogIn,
  MonitorPlay,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { errorMessage } from '@/components/partners/portal/shared'
import { cn } from '@/lib/utils'
import {
  CLOSED_COPY,
  displayFont,
  fieldClass,
  InterestForm,
  naira,
  pillOutline,
  pillInk,
  PROGRAM,
  TRACKS,
  usePublicCohort,
  YEARS_OF_PRACTICE,
  type PublicCohort,
  type Track,
} from './shared'

type Context = {
  signedIn: boolean
  isRehabifyPhysio: boolean
  profile: { firstName: string; lastName: string; email: string; phone: string } | null
  registration: { status: string; track: Track } | null
}

type Fields = {
  firstName: string
  lastName: string
  email: string
  phone: string
  licenseNumber: string
  workplace: string
  city: string
  yearsOfPractice: string
}

const EMPTY: Fields = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  licenseNumber: '',
  workplace: '',
  city: '',
  yearsOfPractice: '',
}

// Kept for the session so a cancelled or failed checkout comes back with the form filled in
const DRAFT_KEY = 'rh-learn-register-draft'

function readDraft(): Partial<Fields> | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Partial<Fields>) : null
  } catch {
    return null
  }
}

function writeDraft(fields: Fields) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(fields))
  } catch {
    // Storage unavailable (private mode): the form simply starts empty next time
  }
}

const isTrack = (value: string | null): value is Track => value === 'rehabify' || value === 'external'

function validate(fields: Fields, track: Track, confirmedLicensed: boolean) {
  const errors: Partial<Record<keyof Fields | 'confirm', string>> = {}
  if (!fields.firstName.trim()) errors.firstName = 'Enter your first name'
  if (!fields.lastName.trim()) errors.lastName = 'Enter your last name'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email.trim())) errors.email = 'Enter a valid email address'
  const digits = fields.phone.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) errors.phone = 'Enter a valid phone number'
  if (track === 'external') {
    if (fields.licenseNumber.trim().length < 3) errors.licenseNumber = 'Enter your licence number'
    if (!confirmedLicensed) errors.confirm = 'Please confirm you are a licensed physiotherapist'
  }
  return errors
}

function Field({
  label,
  htmlFor,
  optional,
  error,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor: string
  optional?: boolean
  error?: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-rh-ink">
        {label}
        {optional && <span className="text-xs font-normal text-rh-ink/45">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-rh-ink/50">{hint}</p>
      ) : null}
    </div>
  )
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-rh-lime">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{label}</dt>
        <dd className="text-sm font-semibold leading-snug text-white">{value}</dd>
      </div>
    </div>
  )
}

function OrderSummary({ cohort, track }: { cohort: PublicCohort; track: Track }) {
  const price = cohort.prices[track]
  return (
    <aside className="relative overflow-hidden rounded-[2rem] bg-rh-ink p-6 text-white shadow-lift sm:p-8 lg:sticky lg:top-28">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-[2rem] bg-rh-ink/40" />
      <div aria-hidden className="pointer-events-none absolute -right-2 top-12 h-12 w-12 rounded-2xl bg-rh-lime" />
      <p className="relative text-xs font-semibold uppercase tracking-[0.14em] text-rh-lime">Your registration</p>
      <h2 className="relative mt-2 max-w-[15rem] text-[24px] leading-tight text-white">{PROGRAM.title}</h2>
      <p className="relative mt-1 text-sm text-white/65">{cohort.cohortLabel}</p>

      <dl className="relative mt-7 space-y-4">
        <SummaryRow icon={CalendarDays} label="Dates" value={cohort.dateRange} />
        <SummaryRow icon={Video} label="Live sessions" value={cohort.liveSessions} />
        <SummaryRow icon={Clock3} label="Duration" value={cohort.duration} />
        <SummaryRow icon={MonitorPlay} label="Format" value={cohort.format} />
      </dl>

      <div className="relative my-6 h-px bg-white/15" />

      <div className="relative flex items-center justify-between gap-4 text-sm">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={track}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="text-white/80"
          >
            {TRACKS[track].label}
          </motion.span>
        </AnimatePresence>
        <span className="font-semibold">{naira(price)}</span>
      </div>
      <div className="relative mt-4 flex items-end justify-between gap-4">
        <span className="pb-1 text-sm text-white/65">Total</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={price}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className={cn('text-[40px] leading-none tracking-tight', displayFont)}
          >
            {naira(price)}
          </motion.span>
        </AnimatePresence>
      </div>
      <p className="relative mt-6 flex items-start gap-2 text-xs leading-5 text-white/65">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Secure payment by Paystack. Card, bank transfer or USSD.
      </p>
    </aside>
  )
}

function TrackOption({
  track,
  selected,
  price,
  onSelect,
}: {
  track: Track
  selected: boolean
  price: number
  onSelect: () => void
}) {
  return (
    <label
      className={cn(
        'relative flex cursor-pointer flex-col rounded-2xl border-2 p-4 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-rh-ink/15 sm:p-5',
        selected ? 'border-rh-ink bg-rh-cream' : 'border-rh-ink/10 bg-white hover:border-rh-ink/25'
      )}
    >
      <input type="radio" name="track" value={track} checked={selected} onChange={onSelect} className="sr-only" />
      <span className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-semibold leading-snug text-rh-ink">{TRACKS[track].label}</span>
        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition',
            selected ? 'border-rh-ink bg-rh-ink' : 'border-rh-ink/20'
          )}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
      </span>
      <span className={cn('mt-2 text-[28px] leading-none text-rh-ink', displayFont)}>{naira(price)}</span>
      <span className="mt-2 text-xs leading-5 text-rh-ink/60">{TRACKS[track].audience}</span>
    </label>
  )
}

function Panel({ tone, icon: Icon, title, children }: { tone: 'calm' | 'jasmine' | 'rose'; icon: typeof Info; title: string; children: ReactNode }) {
  const tones = { calm: 'bg-rh-honeydew', jasmine: 'bg-rh-jasmine/45', rose: 'bg-rh-rose/45' }
  return (
    <div className={cn('rounded-2xl p-5', tones[tone])}>
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rh-ink">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-rh-ink">{title}</p>
          <div className="mt-1 text-sm leading-6 text-rh-ink/70">{children}</div>
        </div>
      </div>
    </div>
  )
}

function PageFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="min-h-screen bg-rh-cream px-4 pb-20 pt-24 sm:px-6 sm:pt-28">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-rh-ink underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Program details
        </Link>
        <div className={cn('mt-6 grid gap-6', aside && 'lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start')}>
          <div className="rounded-[2rem] bg-white p-6 shadow-soft sm:p-10">{children}</div>
          {aside}
        </div>
      </div>
    </div>
  )
}

export function RegisterSkeleton() {
  return (
    <PageFrame>
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-rh-ink/[0.07]" />
        <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-rh-ink/[0.07]" />
        <div className="grid gap-3 pt-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
          <div className="h-32 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
        </div>
        <div className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
        <div className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
      </div>
    </PageFrame>
  )
}

export function RegisterFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const cohort = usePublicCohort()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const context = useQuery(api.learn.getMyRegistrationContext, cohort ? { cohortId: cohort.id } : {}) as Context | undefined
  const startRegistration = useAction(api.learn.startRegistration)

  const paramTrack = params.get('track')
  const cancelled = params.get('cancelled') === '1'
  const [track, setTrackState] = useState<Track>(isTrack(paramTrack) ? paramTrack : 'external')
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [confirmedLicensed, setConfirmedLicensed] = useState(false)
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const prefilled = useRef(false)
  const pickedDefault = useRef(isTrack(paramTrack))

  const setTrack = (next: Track) => {
    setTrackState(next)
    setErrors({})
    setFormError(null)
    router.replace(`/learn/register?track=${next}`, { scroll: false })
  }

  // Restore what was typed before a cancelled checkout
  useEffect(() => {
    const draft = readDraft()
    if (draft) setFields((current) => ({ ...current, ...draft }))
  }, [])

  // Fill blanks from the signed-in account, once
  useEffect(() => {
    if (prefilled.current || !context?.profile) return
    prefilled.current = true
    const profile = context.profile
    setFields((current) => ({
      ...current,
      firstName: current.firstName || profile.firstName,
      lastName: current.lastName || profile.lastName,
      email: current.email || profile.email,
      phone: current.phone || profile.phone,
    }))
  }, [context?.profile])

  // Rehabify physiotherapists arriving without a choice get their rate selected
  useEffect(() => {
    if (pickedDefault.current || !context) return
    pickedDefault.current = true
    if (context.isRehabifyPhysio) setTrack('rehabify')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context])

  const update = (key: keyof Fields) => (e: { target: { value: string } }) => {
    const value = e.target.value
    setFields((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  if (cohort === undefined) return <RegisterSkeleton />

  if (!cohort || !cohort.isOpen) {
    return (
      <PageFrame>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rh-ink">Registration</p>
        <h1 className="mt-2 text-[32px] leading-tight tracking-tight text-rh-ink sm:text-[40px]">
          {cohort ? CLOSED_COPY[cohort.closedReason ?? 'closed'] : "Registration isn't open yet"}
        </h1>
        <p className="mt-3 max-w-xl text-rh-ink/65">
          Leave your email and we&apos;ll let you know as soon as registration for the next cohort of the {PROGRAM.shortTitle} opens.
        </p>
        <InterestForm className="mt-8 max-w-lg" />
      </PageFrame>
    )
  }

  const alreadyRegistered = context?.registration?.status === 'paid'
  const authPending = track === 'rehabify' && (authLoading || (isAuthenticated && context === undefined))
  const needsSignIn = track === 'rehabify' && !authLoading && !isAuthenticated
  const notEligible = track === 'rehabify' && isAuthenticated && context !== undefined && !context.isRehabifyPhysio
  const showForm = !alreadyRegistered && !authPending && !needsSignIn && !notEligible
  const price = cohort.prices[track]
  const signInHref = `/sign-in?redirect=${encodeURIComponent('/learn/register?track=rehabify')}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const found = validate(fields, track, confirmedLicensed)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0]
      document.getElementById(first === 'confirm' ? 'learn-confirm' : `learn-${first}`)?.focus()
      return
    }
    setSubmitting(true)
    writeDraft(fields)
    try {
      const result = (await startRegistration({
        cohortId: cohort.id,
        track,
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
        phone: fields.phone,
        licenseNumber: track === 'external' ? fields.licenseNumber : fields.licenseNumber || undefined,
        workplace: fields.workplace || undefined,
        city: fields.city || undefined,
        yearsOfPractice: fields.yearsOfPractice || undefined,
        returnOrigin: window.location.origin,
      })) as { authorizationUrl: string; reference: string }
      window.location.assign(result.authorizationUrl)
      // Stay in the "Taking you to Paystack" state while the browser navigates away
    } catch (err) {
      setFormError(errorMessage(err, "We couldn't start your payment. Please try again."))
      setSubmitting(false)
    }
  }

  const input = (key: keyof Fields) => ({
    id: `learn-${key}`,
    value: fields[key],
    onChange: update(key),
    'aria-invalid': Boolean(errors[key]) || undefined,
    'aria-describedby': errors[key] ? `learn-${key}-error` : undefined,
    className: cn(fieldClass, errors[key] && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10'),
  })

  return (
    <PageFrame aside={<OrderSummary cohort={cohort} track={track} />}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rh-ink">Registration</p>
      <h1 className="mt-2 text-[32px] leading-tight tracking-tight text-rh-ink sm:text-[40px]">Save your place</h1>
      <p className="mt-2 text-rh-ink/65">It takes about two minutes. You&apos;ll pay securely on Paystack next.</p>

      {cancelled && !submitting && (
        <div className="mt-6">
          <Panel tone="jasmine" icon={Info} title="Payment not completed">
            No money was taken. Your details are still here, so you can try again whenever you&apos;re ready.
          </Panel>
        </div>
      )}

      <fieldset className="mt-8">
        <legend className="mb-3 text-sm font-semibold text-rh-ink">Registration type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['rehabify', 'external'] as const).map((t) => (
            <TrackOption key={t} track={t} price={cohort.prices[t]} selected={track === t} onSelect={() => setTrack(t)} />
          ))}
        </div>
      </fieldset>

      <div className="mt-6">
        {alreadyRegistered && (
          <Panel tone="calm" icon={BadgeCheck} title={`You're already registered for the ${cohort.cohortLabel}`}>
            Your confirmation email has everything you need. See you on {cohort.startsOn}!
          </Panel>
        )}

        {!alreadyRegistered && authPending && <div className="h-28 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />}

        {!alreadyRegistered && needsSignIn && (
          <Panel tone="calm" icon={LogIn} title="Sign in to use the Rehabify rate">
            <p>
              The {naira(cohort.prices.rehabify)} rate is for physiotherapists currently practising with Rehabify. Sign in with your
              Rehabify account and we&apos;ll fill in your details.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Link href={signInHref} className={cn(pillInk, 'h-11')}>
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
              <button type="button" onClick={() => setTrack('external')} className={cn(pillOutline, 'h-11')}>
                I&apos;m not on Rehabify
              </button>
            </div>
          </Panel>
        )}

        {!alreadyRegistered && notEligible && (
          <Panel tone="jasmine" icon={AlertCircle} title="This account can't use the Rehabify rate">
            <p>
              It&apos;s for approved physiotherapists practising on Rehabify. If your physiotherapist account is still being reviewed,
              you can register once it&apos;s approved, or register as another physiotherapist now.
            </p>
            <button type="button" onClick={() => setTrack('external')} className={cn(pillOutline, 'mt-4 h-11')}>
              Register as another physiotherapist
            </button>
          </Panel>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} noValidate className="mt-2">
          {track === 'rehabify' && context?.isRehabifyPhysio && (
            <p className="mb-6 flex items-center gap-2 rounded-2xl bg-rh-honeydew px-4 py-3 text-sm text-rh-ink">
              <BadgeCheck className="h-4 w-4 shrink-0 text-rh-ink" />
              Rehabify physiotherapist account confirmed. Your rate is applied.
            </p>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First name" htmlFor="learn-firstName" error={errors.firstName}>
              <input {...input('firstName')} autoComplete="given-name" />
            </Field>
            <Field label="Last name" htmlFor="learn-lastName" error={errors.lastName}>
              <input {...input('lastName')} autoComplete="family-name" />
            </Field>
            <Field label="Email" htmlFor="learn-email" error={errors.email} hint="Your confirmation and joining details go here.">
              <input {...input('email')} type="email" inputMode="email" autoComplete="email" />
            </Field>
            <Field label="Phone (WhatsApp)" htmlFor="learn-phone" error={errors.phone}>
              <input {...input('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 000 0000" />
            </Field>
            {track === 'external' && (
              <Field
                label="Physiotherapy licence number"
                htmlFor="learn-licenseNumber"
                error={errors.licenseNumber}
                hint="Your MRTB licence or registration number."
                className="sm:col-span-2"
              >
                <input {...input('licenseNumber')} autoComplete="off" />
              </Field>
            )}
            <Field label="Where you work" htmlFor="learn-workplace" optional>
              <input {...input('workplace')} autoComplete="organization" placeholder="Clinic or hospital" />
            </Field>
            <Field label="City" htmlFor="learn-city" optional>
              <input {...input('city')} autoComplete="address-level2" placeholder="e.g. Lagos" />
            </Field>
            <Field label="Years in practice" htmlFor="learn-yearsOfPractice" optional className="sm:col-span-2">
              <select
                {...input('yearsOfPractice')}
                className={cn(fieldClass, 'appearance-none bg-no-repeat pr-10')}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23002e2c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '16px',
                }}
              >
                <option value="">Choose one</option>
                {YEARS_OF_PRACTICE.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {track === 'external' && (
            <div className="mt-6">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-rh-ink/10 p-4 transition hover:border-rh-ink/20">
                <input
                  id="learn-confirm"
                  type="checkbox"
                  checked={confirmedLicensed}
                  onChange={(e) => {
                    setConfirmedLicensed(e.target.checked)
                    if (errors.confirm) setErrors((current) => ({ ...current, confirm: undefined }))
                  }}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-rh-ink/30 accent-[#0b1312]"
                />
                <span className="text-sm leading-6 text-rh-ink/75">I confirm I&apos;m a licensed physiotherapist.</span>
              </label>
              {errors.confirm && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.confirm}</p>}
            </div>
          )}

          {formError && (
            <div role="alert" className="mt-6">
              <Panel tone="rose" icon={AlertCircle} title="We couldn't start your payment">
                {formError}
              </Panel>
            </div>
          )}

          <button type="submit" disabled={submitting} className={cn(pillInk, 'mt-8 h-14 w-full text-base')}>
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Taking you to Paystack…
              </>
            ) : (
              <>
                Continue to payment · {naira(price)} <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-rh-ink/50">{PROGRAM.certificationNote}</p>
        </form>
      )}
    </PageFrame>
  )
}
