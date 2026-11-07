'use client'

/**
 * "Help me choose a physio" on Find a Physio: what's wrong, video or home visit, and where they
 * are. A signed-in patient's answers are saved to their record; a guest also leaves a name and a
 * WhatsApp number. The care team sees it at once in Patients looking for care, with the physio
 * profiles opened on this device, and contacts them to pair them (convex/findHelp.ts).
 */

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { CheckCircle2, House, Loader2, Video, WhatsApp } from '@/components/icons'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import { NIGERIAN_STATES } from '@/lib/nigerianStates'
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
  { complaint: string; format: Format; state: string; area?: string; name?: string; phone?: string; viewed?: string[]; website?: string },
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

const FORMATS: { value: Format; label: string; hint: string; icon?: typeof Video }[] = [
  { value: 'online', label: 'Video call', hint: 'From home, on your phone', icon: Video },
  { value: 'home_visit', label: 'Home visit', hint: 'A physio comes to you', icon: House },
  { value: 'either', label: 'Either is fine', hint: 'Whatever is sooner' },
]

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
  const [format, setFormat] = useState<Format | ''>('')
  const [state, setState] = useState('')
  const [area, setArea] = useState('')
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
    if (mine.format === 'online' || mine.format === 'home_visit') setFormat(mine.format)
    if (mine.state) setState(mine.state)
    if (mine.area) setArea(mine.area)
  }, [mine, prefilled])

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
    if (!topic) return setError('Choose what’s wrong.')
    if (!complaint) return setError('Tell us a little about what’s wrong.')
    if (!format) return setError('Choose video call, home visit or either.')
    if (!state) return setError('Choose your state.')
    if (format === 'home_visit' && !area.trim()) return setError('Add your area so we can find a physio who visits it.')
    if (isGuest && !name.trim()) return setError('Add your name.')
    if (needPhone && phone.replace(/\D/g, '').length < 10) return setError('Add a WhatsApp number we can reach you on.')
    setBusy(true)
    try {
      await ask({
        complaint,
        format,
        state,
        area: area.trim() || undefined,
        name: isGuest ? name.trim() : undefined,
        phone: needPhone ? phone.trim() : undefined,
        viewed: viewedPhysioIds(),
        website: website || undefined,
      })
      const now = Date.now()
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
          <p className="mt-1 text-sm text-rh-ink/70">Answer 3 quick questions and our care team will match you with the right physiotherapist.</p>
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
          <p className="mt-1 text-sm text-rh-ink/70">Three quick questions. Our care team will use them to match you.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="shrink-0 text-sm font-semibold text-rh-ink/60 hover:text-rh-ink">
          Close
        </button>
      </div>

      {/* 1. What's wrong */}
      <fieldset className="space-y-3">
        <legend className={label}>1. What&apos;s wrong?</legend>
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

      {/* 2. Video or home visit */}
      <fieldset className="space-y-3">
        <legend className={label}>2. Video call or home visit?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FORMATS.map(({ value, label: text, hint, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={format === value}
              onClick={() => setFormat(value)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors',
                format === value ? 'border-rh-ink bg-rh-ink text-white' : 'border-rh-ink/15 bg-white text-rh-ink hover:border-rh-ink/40'
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span>
                <span className="block text-sm font-semibold">{text}</span>
                <span className={cn('block text-xs', format === value ? 'text-white/70' : 'text-rh-ink/60')}>{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* 3. Where */}
      <fieldset className="space-y-3">
        <legend className={label}>3. Where are you?</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select value={state} onChange={(e) => setState(e.target.value)} aria-label="State" className={cn(field, !state && 'text-rh-ink/40')}>
            <option value="">State</option>
            {NIGERIAN_STATES.map((s) => (
              <option key={s} value={s} className="text-rh-ink">
                {s}
              </option>
            ))}
          </select>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={80}
            placeholder={format === 'home_visit' ? 'Area, e.g. Lekki or Wuse' : 'Area, e.g. Lekki (optional)'}
            aria-label="Area"
            className={field}
          />
        </div>
      </fieldset>

      {needPhone && (
        <fieldset className="space-y-3">
          <legend className={label}>How can we reach you?</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {isGuest && (
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Your name" aria-label="Your name" className={field} />
            )}
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="WhatsApp number, e.g. 0801 234 5678"
              aria-label="WhatsApp number"
              className={field}
            />
          </div>
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
