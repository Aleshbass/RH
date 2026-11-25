'use client'

/**
 * "Help me choose a physio" on Find a Physio, in the same order as Joy on WhatsApp (owner, 25 Nov
 * 2026): their name and who it's for, age, city and country, what's wrong, and Joy's red-flag
 * check. A signed-in patient's answers are saved to their record; a guest also leaves a WhatsApp
 * number. The care team sees it at once in Patients looking for care, with the physio profiles
 * opened on this device, and contacts them to pair them (convex/findHelp.ts). Any red flag: the
 * page says to get urgent care first, and the team is told.
 */

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { AlertTriangle, CheckCircle2, Loader2, WhatsApp } from '@/components/icons'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { viewedPhysioIds } from '@/lib/viewedPhysios'
import { cn } from '@/lib/utils'

type Format = 'online' | 'home_visit' | 'either'
type MyAnswers =
  | { isPatient: false }
  | { isPatient: true; firstName: string | null; hasPhone: boolean; complaint: string | null; format: 'online' | 'home_visit' | 'clinic' | null; state: string | null; area: string | null; askedAt: number | null }
  | null

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const myAnswersRef = makeFunctionReference<'query', Record<string, never>, MyAnswers>('findHelp:myAnswers')
const askRef = makeFunctionReference<
  'mutation',
  {
    complaint: string
    format: Format
    state?: string
    area?: string
    forWhom?: 'self' | 'other'
    patientName?: string
    age?: number
    city?: string
    country?: string
    redFlags?: string[]
    name?: string
    phone?: string
    viewed?: string[]
    website?: string
  },
  { ok: boolean }
>('findHelp:askForHelp')

const TOPICS = [
  'Back or neck pain',
  'Knee',
  'Shoulder',
  'Hip',
  'Ankle or foot',
  'Sports injury',
  'After surgery or a fracture',
  'Stroke or nerve problem',
  'Something else',
]

/** Joy's red-flag list (joy/backend/app/triage/self_referral.py RED_FLAG_ITEMS) */
const RED_FLAGS = [
  { id: '1', label: 'Chest pain, trouble breathing, or fainting' },
  { id: '2', label: 'New weakness, numbness, or trouble speaking' },
  { id: '3', label: 'Loss of bladder or bowel control' },
  { id: '4', label: 'Severe or rapidly worsening pain' },
  { id: '5', label: 'Unexplained weight loss, fever, or night sweats' },
  { id: '6', label: 'Recent major injury or accident' },
]

const COUNTRIES = ['Nigeria', 'Ghana', 'United Kingdom', 'United States', 'Canada', 'Ireland', 'South Africa', 'Kenya', 'United Arab Emirates', 'Other']

const REHABIFY_PHONE = '0806 152 5811'

const SENT_KEY = 'rh_help_choose_sent'
const SENT_FOR_MS = 24 * 60 * 60 * 1000
const JOY_URL = joyWhatsAppUrl("Hi Joy, I'd like help finding the right physiotherapist.")

const field =
  'h-12 w-full rounded-2xl border border-rh-ink/15 bg-white px-4 text-base text-rh-ink placeholder:text-rh-ink/40 focus:border-rh-ink/40 focus:outline-none focus:ring-2 focus:ring-rh-ink/10'
const label = 'text-sm font-semibold text-rh-ink'

function errorText(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === 'string') return error.data
  return 'Something went wrong. Please try again, or chat with Joy on WhatsApp.'
}

export function HelpMeChoose() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const mine = useQuery(myAnswersRef, isAuthenticated ? {} : 'skip')
  const ask = useMutation(askRef)

  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [details, setDetails] = useState('')
  const [forWhom, setForWhom] = useState<'self' | 'other' | ''>('')
  const [patientName, setPatientName] = useState('')
  const [age, setAge] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('Nigeria')
  const [redFlags, setRedFlags] = useState<string[]>([])
  const [noneOfThese, setNoneOfThese] = useState(false)
  // What was sent had a red flag: the page says to get urgent care
  const [urgent, setUrgent] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  // A guest who already sent their answers on this device in the last day
  useEffect(() => {
    try {
      const at = Number(window.localStorage.getItem(SENT_KEY))
      if (at && Date.now() - at < SENT_FOR_MS) setSentAt(at)
    } catch {
      // Storage blocked: show the card as new
    }
  }, [])

  // A signed-in patient: start from what's on their record
  useEffect(() => {
    if (prefilled || !mine || !mine.isPatient) return
    setPrefilled(true)
    if (mine.askedAt) setSentAt(mine.askedAt)
    if (mine.complaint) {
      const [first, ...rest] = mine.complaint.split(': ')
      if (TOPICS.includes(first)) {
        setTopic(first)
        setDetails(rest.join(': '))
      } else {
        setTopic('Something else')
        setDetails(mine.complaint)
      }
    }
    const place = [mine.area, mine.state].filter(Boolean).join(', ')
    if (place) setCity(place)
  }, [mine, prefilled])

  const toggleFlag = (id: string) => {
    setNoneOfThese(false)
    setRedFlags((flags) => (flags.includes(id) ? flags.filter((f) => f !== id) : [...flags, id]))
  }

  // Physios and admins browsing aren't asked
  if (authLoading || (isAuthenticated && (mine === undefined || mine === null || !mine.isPatient))) return null
  const isGuest = !isAuthenticated
  // Guests, and patients with no number on their account, leave a WhatsApp number
  const needPhone = isGuest || Boolean(mine && mine.isPatient && !mine.hasPhone)
  const firstName = isGuest ? name.trim().split(/\s+/)[0] : mine && mine.isPatient ? mine.firstName : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    const complaint = topic === 'Something else' ? details.trim() : [topic, details.trim()].filter(Boolean).join(': ')
    const years = Number(age)
    if (isGuest && !name.trim()) return setError('Add your name.')
    if (!forWhom) return setError('Choose who the physio session is for.')
    if (!(years > 0 && years < 120)) return setError(forWhom === 'other' ? 'Add their age.' : 'Add your age.')
    if (!city.trim()) return setError('Add the city.')
    if (!topic) return setError('Choose what’s wrong.')
    if (!complaint) return setError('Tell us a little about what’s wrong.')
    if (!noneOfThese && redFlags.length === 0) return setError('Tick any that apply, or None of these.')
    if (needPhone && phone.replace(/\D/g, '').length < 10) return setError('Add a WhatsApp number we can reach you on.')
    setBusy(true)
    try {
      await ask({
        complaint,
        format: 'either',
        forWhom,
        patientName: forWhom === 'other' ? patientName.trim() || undefined : undefined,
        age: years,
        city: city.trim(),
        country,
        redFlags,
        name: isGuest ? name.trim() : undefined,
        phone: needPhone ? phone.trim() : undefined,
        viewed: viewedPhysioIds(),
        website: website || undefined,
      })
      const now = Date.now()
      setUrgent(redFlags.length > 0)
      setSentAt(now)
      setOpen(false)
      try {
        window.localStorage.setItem(SENT_KEY, String(now))
      } catch {
        // ignore
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  // Sent with a red flag: urgent care first, as Joy says it
  if (sentAt && !open && urgent) {
    return (
      <div className="mt-8 max-w-3xl rounded-3xl border border-[#be123c]/30 bg-rh-blush p-5 sm:p-6" role="alert">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#be123c]" />
          <div>
            <p className="font-semibold text-rh-ink">Please get urgent medical care first.</p>
            <p className="mt-1 text-sm text-rh-ink/75">
              Some of these symptoms can need urgent assessment. Go to the nearest hospital emergency department, or call Rehabify on{' '}
              <a href={`tel:${REHABIFY_PHONE.replace(/\s/g, '')}`} className="font-semibold underline">
                {REHABIFY_PHONE}
              </a>
              . We&apos;ve told our care team. When a doctor says physiotherapy is safe, we&apos;ll help you book.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Sent: say what happens next
  if (sentAt && !open) {
    return (
      <div className="mt-8 flex max-w-3xl flex-col gap-4 rounded-3xl border border-rh-ink/10 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" role="status">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#047857]" />
          <div>
            <p className="font-semibold text-rh-ink">Thanks{firstName ? `, ${firstName}` : ''}. Our care team has your answers.</p>
            <p className="mt-1 text-sm text-rh-ink/70">
              Someone will contact you{needPhone ? ' on WhatsApp' : ''} soon to match you with the right physiotherapist. You can keep browsing in the meantime.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-sm font-semibold text-rh-ink underline-offset-4 hover:underline">
          Change my answers
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="mt-8 flex max-w-3xl flex-col gap-4 rounded-3xl border border-rh-ink/10 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-lg font-semibold text-rh-ink">Not sure who to choose?</p>
          <p className="mt-1 text-sm text-rh-ink/70">Answer a few quick questions and our care team will match you with the right physiotherapist.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-rh-lime px-6 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
        >
          Help me choose
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-3xl space-y-6 rounded-3xl border border-rh-ink/10 bg-white p-5 sm:p-7" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xl font-semibold text-rh-ink">Help me choose a physiotherapist</p>
          <p className="mt-1 text-sm text-rh-ink/70">A few quick questions, the same ones Joy asks. Our care team will use them to match you.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-sm font-semibold text-rh-ink/60 hover:text-rh-ink">
          Close
        </button>
      </div>

      {/* 1. Who it's for (and their name) */}
      <fieldset className="space-y-3">
        <legend className={label}>1. {isGuest ? 'What’s your name, and who' : 'Who'} is the physio session for?</legend>
        {isGuest && (
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Your name" aria-label="Your name" className={field} />
        )}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: 'self', label: 'For myself' },
              { value: 'other', label: 'For someone else' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={forWhom === option.value}
              onClick={() => setForWhom(option.value)}
              className={cn(
                'h-12 rounded-2xl border text-sm font-semibold transition-colors',
                forWhom === option.value ? 'border-rh-ink bg-rh-ink text-white' : 'border-rh-ink/15 bg-white text-rh-ink hover:border-rh-ink/40'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {forWhom === 'other' && (
          <input
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            maxLength={60}
            placeholder="Their first name, e.g. Bola (optional)"
            aria-label="Their first name"
            className={field}
          />
        )}
      </fieldset>

      {/* 2. Age */}
      <fieldset className="space-y-3">
        <legend className={label}>2. {forWhom === 'other' ? 'How old are they?' : 'How old are you?'}</legend>
        <input
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
          inputMode="numeric"
          placeholder="Age, e.g. 34"
          aria-label="Age"
          className={cn(field, 'sm:max-w-[12rem]')}
        />
      </fieldset>

      {/* 3. City and country */}
      <fieldset className="space-y-3">
        <legend className={label}>3. {forWhom === 'other' ? 'Which city and country do they live in?' : 'Which city and country are you in?'}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={60}
            autoComplete="address-level2"
            placeholder="City or area, e.g. Ikeja, Lagos"
            aria-label="City"
            className={field}
          />
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country" className={field}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {/* 4. What's wrong */}
      <fieldset className="space-y-3">
        <legend className={label}>4. What&apos;s wrong?</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={topic === t}
              onClick={() => setTopic(t)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                topic === t ? 'border-rh-ink bg-rh-ink text-white' : 'border-rh-ink/15 bg-white text-rh-ink hover:border-rh-ink/40'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={200}
          placeholder={topic === 'Something else' ? 'Tell us what’s wrong' : 'Anything else? e.g. how long, what makes it worse (optional)'}
          aria-label="More about what's wrong"
          className={field}
        />
      </fieldset>

      {/* 5. The red-flag check, as Joy asks it */}
      <fieldset className="space-y-3">
        <legend className={label}>5. {forWhom === 'other' ? 'Do they have any of these right now?' : 'Do you have any of these right now?'}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RED_FLAGS.map((flag) => {
            const on = redFlags.includes(flag.id)
            return (
              <button
                key={flag.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggleFlag(flag.id)}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-sm transition-colors',
                  on ? 'border-[#be123c] bg-rh-blush text-rh-ink' : 'border-rh-ink/15 bg-white text-rh-ink hover:border-rh-ink/40'
                )}
              >
                <span aria-hidden className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-[#be123c] bg-[#be123c]' : 'border-rh-ink/25')}>
                  {on && <CheckCircle2 className="h-3 w-3 text-white" />}
                </span>
                {flag.label}
              </button>
            )
          })}
          <button
            type="button"
            role="checkbox"
            aria-checked={noneOfThese}
            onClick={() => {
              setNoneOfThese(!noneOfThese)
              if (!noneOfThese) setRedFlags([])
            }}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors sm:col-span-2',
              noneOfThese ? 'border-rh-ink bg-rh-ink text-white' : 'border-rh-ink/15 bg-white text-rh-ink hover:border-rh-ink/40'
            )}
          >
            None of these
          </button>
        </div>
      </fieldset>

      {needPhone && (
        <fieldset className="space-y-3">
          <legend className={label}>How can we reach you?</legend>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="WhatsApp number, e.g. 0801 234 5678"
            aria-label="WhatsApp number"
            className={cn(field, 'sm:max-w-sm')}
          />
          {isGuest && (
            <p className="text-xs text-rh-ink/60">
              Have an account?{' '}
              <Link href="/sign-in?redirect_url=%2Ffind-a-physio" className="font-semibold text-rh-ink underline-offset-4 hover:underline">
                Sign in
              </Link>{' '}
              and we&apos;ll save your answers to it.
            </p>
          )}
        </fieldset>
      )}

      {/* Left empty by people; bots fill it */}
      <input
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      {error && (
        <p role="alert" className="rounded-2xl bg-rh-blush px-4 py-3 text-sm text-[#be123c]">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-rh-ink/60 sm:max-w-sm">
          We share your answers and the physio profiles you looked at with our care team so they can match you. See our{' '}
          <Link href="/privacy-policy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <a
            href={JOY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-rh-ink/15 px-5 text-sm font-semibold text-rh-ink transition-colors hover:border-rh-ink/40"
          >
            <WhatsApp className="h-4 w-4" /> Chat with Joy instead
          </a>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-rh-lime px-6 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Find me a physio
          </button>
        </div>
      </div>
    </form>
  )
}
