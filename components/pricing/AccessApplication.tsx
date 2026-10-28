'use client'

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { ArrowRight, CalendarClock, Check, ChevronDown, Clock, Info, Loader2 } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { CheckItem, displayFont } from '@/components/learn/shared'
import { errorMessage } from '@/components/partners/portal/shared'
import { ACCESS_STATUS_LABELS, FUNDING_OPTIONS, INCOME_BANDS, SITUATIONS } from '@/lib/rehabify-access'
import { formatKobo } from '@/lib/rehabify-services'
import { cn } from '@/lib/utils'
import type { AccessStatus, MyAccess } from '@/lib/rehabify-api-types'
import { ctaPrimary, ctaSecondary, textLink, useCatalogue } from './shared'

type Application = NonNullable<MyAccess['application']>
type Award = NonNullable<MyAccess['award']>

const OPEN_STATUSES = new Set(['submitted', 'under_review', 'waitlisted'])
const RETURN_PATH = '/rehabify-access#apply'
const card = 'rounded-[2rem] bg-white p-6 sm:p-9'
const cardLabel = 'text-sm font-semibold text-rh-ink/60'
const cardTitle = 'text-[24px] font-bold leading-tight tracking-tight text-rh-ink'
/** Inputs, selects and textareas: canvas fill, hairline ring, ink ring on focus. */
const inputClass =
  'h-12 w-full rounded-2xl bg-rh-canvas px-4 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/10 placeholder:text-rh-ink/40 transition focus:outline-none focus:ring-2 focus:ring-rh-ink disabled:opacity-60'
const fieldLabel = 'block text-[15px] font-semibold text-rh-ink'
const errorText = 'mt-1.5 text-sm font-medium text-red-700'
/** For the confirm-withdraw step: firm, but not the lime main action. */
const inkButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-ink px-7 text-[15px] font-semibold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
const arrow = 'h-4 w-4 transition-transform duration-300 group-hover:translate-x-1'

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export function AccessApplication() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const user = useQuery(api.users.getMyUser, isAuthenticated ? {} : 'skip')
  const access = useQuery(api.rehabifyAccess.getMyAccess, isAuthenticated ? {} : 'skip') as MyAccess | null | undefined
  const status = useQuery(api.rehabifyAccess.getAccessStatus, {}) as AccessStatus | undefined
  const [justSubmitted, setJustSubmitted] = useState(false)

  if (isLoading) return <Skeleton />
  if (!isAuthenticated) return <SignInPrompt />
  if (user === undefined || user === null || access === undefined) return <Skeleton />

  if (!user.role) return <FinishSetup />
  if (user.role !== 'patient') {
    return (
      <Notice title="Applications are made from a patient account">
        The account you&apos;re signed in with isn&apos;t a patient account. To apply for yourself or someone you care for, sign
        in with a patient account.
      </Notice>
    )
  }

  const application = access?.application ?? null
  const award = access?.award ?? null

  if (award) return <AwardCard award={award} />
  if (application && OPEN_STATUSES.has(application.status)) {
    return <ApplicationStatus application={application} justSubmitted={justSubmitted} />
  }

  if (status && !status.intakeOpen) {
    return (
      <Notice title="Applications are closed for now">
        Rehabify Access isn&apos;t taking new applications right now. Please check back soon. In the meantime you can book at
        our{' '}
        <Link href="/pricing" className={textLink}>
          standard prices
        </Link>{' '}
        or spread the cost with{' '}
        <Link href="/pricing#mediloan" className={textLink}>
          MediLoan
        </Link>
        .
      </Notice>
    )
  }

  return (
    <div className="space-y-4">
      {application && <PreviousOutcome application={application} />}
      {status && !status.placesAvailable && (
        <p className="flex gap-3 rounded-[1.5rem] bg-white p-5 text-[15px] font-medium leading-6 text-rh-ink/80">
          <Info className="mt-1 h-4 w-4 shrink-0 text-rh-ink" />
          All our current places are taken. You can still apply: if we can&apos;t offer you a place straight away, we may add
          you to the waiting list.
        </p>
      )}
      <ApplicationForm onSubmitted={() => setJustSubmitted(true)} />
    </div>
  )
}

function Skeleton() {
  return (
    <div className={cn(card, 'space-y-4')} aria-busy="true">
      <div className="h-6 w-1/2 animate-pulse rounded-full bg-rh-ink/[0.07]" />
      <div className="h-4 w-3/4 animate-pulse rounded-full bg-rh-ink/[0.05]" />
      <div className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
      <div className="h-12 animate-pulse rounded-2xl bg-rh-ink/[0.05]" />
    </div>
  )
}

function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={card}>
      <h3 className={cardTitle}>{title}</h3>
      <p className="mt-3 text-[15px] font-medium leading-7 text-rh-ink/70">{children}</p>
      {action && <div className="mt-7 flex flex-col gap-3 sm:flex-row">{action}</div>}
    </div>
  )
}

function SignInPrompt() {
  const redirect = encodeURIComponent(RETURN_PATH)
  return (
    <Notice
      title="Sign in to apply"
      action={
        <>
          <Link href={`/sign-up?redirect_url=${redirect}`} className={ctaPrimary}>
            Create a free account <ArrowRight className={arrow} />
          </Link>
          <Link href={`/sign-in?redirect_url=${redirect}`} className={ctaSecondary}>
            I already have an account
          </Link>
        </>
      }
    >
      You apply from your Rehabify patient account. It keeps your details private, and it&apos;s where you&apos;ll see the
      outcome and book your sessions.
    </Notice>
  )
}

function FinishSetup() {
  return (
    <Notice
      title="Finish setting up your account"
      action={
        <Link href="/role-selection" className={ctaPrimary}>
          Set up my patient account <ArrowRight className={arrow} />
        </Link>
      }
    >
      Choose &ldquo;Patient&rdquo; to finish setting up your account, then come back to this page to apply.
    </Notice>
  )
}

function ApplicationStatus({ application, justSubmitted }: { application: Application; justSubmitted: boolean }) {
  const withdraw = useMutation(api.rehabifyAccess.withdrawApplication)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onWithdraw = async () => {
    setBusy(true)
    setError(null)
    try {
      await withdraw({ applicationId: application.id })
    } catch (err) {
      setError(errorMessage(err, "We couldn't withdraw your application. Please try again."))
      setBusy(false)
    }
  }

  const waitlisted = application.status === 'waitlisted'

  return (
    <div className={card}>
      {justSubmitted && (
        <p role="status" className="mb-6 flex items-center gap-3 rounded-2xl bg-rh-canvas p-4 text-[15px] font-semibold text-rh-ink">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
            <Check className="h-3.5 w-3.5" />
          </span>
          Thank you. Your application has been received.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={cardLabel}>Your application</p>
          <h3 className={cn(cardTitle, 'mt-1.5')}>{ACCESS_STATUS_LABELS[application.status] ?? 'Received'}</h3>
          <p className="mt-1 text-sm font-medium text-rh-ink/60">Submitted {formatDate(application.createdAt)}</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-canvas text-rh-ink">
          {waitlisted ? <CalendarClock className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
        </span>
      </div>
      <p className="mt-5 text-[15px] font-medium leading-7 text-rh-ink/70">
        {waitlisted
          ? "The programme is full at the moment, so you're on our waiting list. We'll be in touch as soon as a place opens."
          : "We review every application individually and will be in touch about the outcome. We may contact you to confirm a few details."}{' '}
        You can still book at our{' '}
        <Link href="/pricing" className={textLink}>
          standard prices
        </Link>{' '}
        in the meantime.
      </p>

      <div className="mt-7 border-t border-rh-ink/10 pt-5">
        {confirming ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="text-[15px] font-semibold text-rh-ink sm:mr-auto">Withdraw your application?</p>
            <button type="button" onClick={onWithdraw} disabled={busy} className={inkButton}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, withdraw it
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={ctaSecondary}>
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-sm text-[15px] font-semibold text-rh-ink/60 underline-offset-4 hover:text-rh-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
          >
            Withdraw my application
          </button>
        )}
        {error && <p className={cn(errorText, 'mt-3')}>{error}</p>}
      </div>
    </div>
  )
}

function AwardCard({ award }: { award: Award }) {
  const services = award.services.filter((service) => service.assistedPriceKobo !== null)
  const usedUp = award.sessionsLeft <= 0

  return (
    <div className={card}>
      <p className={cardLabel}>Approved</p>
      <h3 className={cn(cardTitle, 'mt-1.5')}>Your Access rate with {award.physiotherapistName}</h3>
      <p className="mt-1 text-sm font-medium text-rh-ink/60">
        {usedUp
          ? "You've used all the sessions in your arrangement"
          : `${award.sessionsLeft} of ${award.sessionsGranted} session${award.sessionsGranted === 1 ? '' : 's'} left`}
        {` · until ${formatDate(award.expiresAt)}`}
      </p>
      {services.length > 0 && (
        <ul className="mt-6 space-y-3">
          {services.map((service) => (
            <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rh-canvas p-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-rh-ink">{service.name}</p>
                <p className="mt-0.5 text-[15px] tabular-nums">
                  <span className={cn('text-lg text-rh-ink', displayFont)}>{formatKobo(service.assistedPriceKobo ?? 0)}</span>
                  {service.standardPriceKobo > (service.assistedPriceKobo ?? 0) && (
                    <s className="ml-2 text-rh-ink/40">{formatKobo(service.standardPriceKobo)}</s>
                  )}
                </p>
              </div>
              {!usedUp && (
                <Link href={`/book/${award.physiotherapistId}/${service.id}?access=${award.id}`} className={ctaPrimary}>
                  Book at your Access rate <ArrowRight className={arrow} />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-[15px] font-medium leading-6 text-rh-ink/65">
        You&apos;ll also find this in your{' '}
        <Link href="/dashboard/patient" className={textLink}>
          patient dashboard
        </Link>
        .
      </p>
    </div>
  )
}

function PreviousOutcome({ application }: { application: Application }) {
  const declined = application.status === 'declined'
  const ended = application.status === 'approved'
  if (!declined && !ended) return null
  return (
    <div className="rounded-[1.5rem] bg-white p-5 text-[15px] font-medium leading-6 text-rh-ink/75">
      <p className="font-semibold text-rh-ink">
        {declined ? "Your last application wasn't approved" : 'Your last Access arrangement has ended'}
      </p>
      {declined && application.decisionReason && <p className="mt-1">{application.decisionReason}</p>}
      <p className="mt-1">
        {declined ? 'If your circumstances have changed, you can apply again below.' : 'If you still need help with the cost, you can apply again below.'}
      </p>
    </div>
  )
}

// ── The form ───────────────────────────────────────────────────────────────

type Fields = {
  serviceNeeded: string
  isCurrentPatient: '' | 'yes' | 'no'
  situation: string
  incomeBand: string
  alternativeFunding: string
  clinicalNeed: string
  statement: string
  city: string
  area: string
  phone: string
}

type FieldName = keyof Fields | 'consent'

const EMPTY: Fields = {
  serviceNeeded: '',
  isCurrentPatient: '',
  situation: '',
  incomeBand: '',
  alternativeFunding: '',
  clinicalNeed: '',
  statement: '',
  city: '',
  area: '',
  phone: '',
}

function validate(fields: Fields, consent: boolean): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {}
  if (!fields.serviceNeeded) errors.serviceNeeded = 'Choose the care you need, or "I\'m not sure yet".'
  if (!fields.isCurrentPatient) errors.isCurrentPatient = 'Let us know if you are already being treated.'
  if (!fields.situation) errors.situation = 'Choose what best describes your situation.'
  if (!fields.incomeBand) errors.incomeBand = 'Choose an income range.'
  if (!fields.alternativeFunding) errors.alternativeFunding = 'Tell us about any other help with the cost.'
  if (fields.clinicalNeed.trim().length < 10) errors.clinicalNeed = 'Tell us briefly what you need help with.'
  if (!consent) errors.consent = 'Please confirm to send your application.'
  return errors
}

function ApplicationForm({ onSubmitted }: { onSubmitted: () => void }) {
  const catalogue = useCatalogue()
  const submit = useMutation(api.rehabifyAccess.submitApplication)
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const services = catalogue.services.filter((service) => service.bookable)

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const found = validate(fields, consent)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      document.getElementById(`access-${first}`)?.focus()
      return
    }
    setSubmitting(true)
    try {
      await submit({
        serviceNeeded: fields.serviceNeeded,
        isCurrentPatient: fields.isCurrentPatient === 'yes',
        situation: fields.situation,
        incomeBand: fields.incomeBand,
        alternativeFunding: fields.alternativeFunding,
        clinicalNeed: fields.clinicalNeed.trim(),
        statement: fields.statement.trim() || undefined,
        city: fields.city.trim() || undefined,
        area: fields.area.trim() || undefined,
        phone: fields.phone.trim() || undefined,
        consent,
      })
      onSubmitted()
    } catch (err) {
      setFormError(errorMessage(err, "We couldn't send your application. Please try again."))
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className={cn(card, 'space-y-6')}>
      <Field name="serviceNeeded" label="What care do you need?" error={errors.serviceNeeded}>
        {(props) => (
          <Select {...props} value={fields.serviceNeeded} onChange={(value) => set('serviceNeeded', value)} placeholder="Choose a service">
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
            <option value="not_sure">I&apos;m not sure yet</option>
          </Select>
        )}
      </Field>

      <fieldset aria-describedby={errors.isCurrentPatient ? 'access-isCurrentPatient-error' : undefined}>
        <legend className={cn(fieldLabel, 'mb-2')}>Are you already being treated by a Rehabify physiotherapist?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['yes', 'Yes, I am'],
              ['no', 'No, not yet'],
            ] as const
          ).map(([value, label], i) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-medium ring-inset transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-rh-ink',
                fields.isCurrentPatient === value
                  ? 'bg-rh-canvas text-rh-ink ring-2 ring-rh-ink'
                  : 'bg-white text-rh-ink/80 ring-1 ring-rh-ink/10 hover:ring-rh-ink/25'
              )}
            >
              <input
                id={i === 0 ? 'access-isCurrentPatient' : undefined}
                type="radio"
                name="isCurrentPatient"
                value={value}
                checked={fields.isCurrentPatient === value}
                onChange={() => set('isCurrentPatient', value)}
                className="h-4 w-4 accent-rh-ink"
              />
              {label}
            </label>
          ))}
        </div>
        {errors.isCurrentPatient && (
          <p id="access-isCurrentPatient-error" className={errorText}>
            {errors.isCurrentPatient}
          </p>
        )}
      </fieldset>

      <Field name="situation" label="Which best describes your situation?" error={errors.situation}>
        {(props) => (
          <Select {...props} value={fields.situation} onChange={(value) => set('situation', value)} placeholder="Choose one">
            {SITUATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field name="incomeBand" label="Monthly income" hint="A range is enough." error={errors.incomeBand}>
          {(props) => (
            <Select {...props} value={fields.incomeBand} onChange={(value) => set('incomeBand', value)} placeholder="Choose a range">
              {INCOME_BANDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field name="alternativeFunding" label="Any other help with the cost?" hint="HMO, employer or family." error={errors.alternativeFunding}>
          {(props) => (
            <Select {...props} value={fields.alternativeFunding} onChange={(value) => set('alternativeFunding', value)} placeholder="Choose one">
              {FUNDING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field name="clinicalNeed" label="What do you need help with?" hint="Your pain, injury or condition, in a sentence or two." error={errors.clinicalNeed}>
        {(props) => (
          <textarea
            {...props}
            rows={3}
            maxLength={1000}
            value={fields.clinicalNeed}
            onChange={(e) => set('clinicalNeed', e.target.value)}
            placeholder="For example: lower back pain for six months, worse after sitting at work."
            className={cn(inputClass, 'h-auto min-h-[96px] resize-y py-3 leading-6')}
          />
        )}
      </Field>

      <Field name="statement" label="Anything else you'd like us to know?" optional>
        {(props) => (
          <textarea
            {...props}
            rows={3}
            maxLength={1000}
            value={fields.statement}
            onChange={(e) => set('statement', e.target.value)}
            className={cn(inputClass, 'h-auto min-h-[96px] resize-y py-3 leading-6')}
          />
        )}
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field name="city" label="City" optional>
          {(props) => (
            <input {...props} type="text" autoComplete="address-level2" maxLength={80} value={fields.city} onChange={(e) => set('city', e.target.value)} className={inputClass} />
          )}
        </Field>
        <Field name="area" label="Area" optional>
          {(props) => (
            <input {...props} type="text" maxLength={80} value={fields.area} onChange={(e) => set('area', e.target.value)} className={inputClass} />
          )}
        </Field>
      </div>

      <Field name="phone" label="Phone number" hint="If you'd like us to call a different number from the one on your account." optional>
        {(props) => (
          <input {...props} type="tel" autoComplete="tel" maxLength={32} value={fields.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
        )}
      </Field>

      <div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-rh-canvas p-4">
          <input
            id="access-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked)
              if (errors.consent) setErrors((current) => ({ ...current, consent: undefined }))
            }}
            aria-describedby={errors.consent ? 'access-consent-error' : undefined}
            className="mt-1 h-4 w-4 shrink-0 accent-rh-ink"
          />
          <span className="text-[15px] font-medium leading-6 text-rh-ink/80">
            The information I&apos;ve given is accurate. I agree to Rehabify reviewing it, and contacting me if needed, to assess
            my application for Rehabify Access.
          </span>
        </label>
        {errors.consent && (
          <p id="access-consent-error" className={errorText}>
            {errors.consent}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-[15px] font-medium leading-6 text-red-800">
          {formError}
        </p>
      )}

      <div>
        <button type="submit" disabled={submitting || !consent} className={cn(ctaPrimary, 'w-full sm:w-auto')}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending
            </>
          ) : (
            <>
              Submit application <ArrowRight className={arrow} />
            </>
          )}
        </button>
        <ul className="mt-5 space-y-2">
          <CheckItem>No documents needed to apply</CheckItem>
          <CheckItem>Reviewed individually, against the same criteria</CheckItem>
        </ul>
      </div>
    </form>
  )
}

type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }

function Field({
  name,
  label,
  hint,
  error,
  optional = false,
  children,
}: {
  name: keyof Fields
  label: string
  hint?: string
  error?: string
  optional?: boolean
  children: (props: ControlProps) => ReactNode
}) {
  const id = `access-${name}`
  const hintId = useId()
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className={cn(fieldLabel, 'mb-1.5')}>
        {label}
        {optional && <span className="ml-1.5 font-medium text-rh-ink/50">(optional)</span>}
      </label>
      {hint && (
        <p id={hintId} className="-mt-0.5 mb-2 text-sm font-medium text-rh-ink/60">
          {hint}
        </p>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className={errorText}>
          {error}
        </p>
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  placeholder,
  children,
  ...props
}: ControlProps & { value: string; onChange: (value: string) => void; placeholder: string; children: ReactNode }) {
  return (
    <div className="relative">
      <select {...props} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, 'appearance-none pr-10')}>
        <option value="" disabled>
          {placeholder}
        </option>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/50" />
    </div>
  )
}
