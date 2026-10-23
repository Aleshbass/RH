'use client'

/**
 * Rehabify Learn — MSK Specialist Program: copy, cohort data and small brand pieces shared
 * by /learn, /learn/register, /learn/confirmation, the landing-page section and the top
 * banner. Cohort logistics (dates, sessions, prices) come from Convex and are edited by
 * admins at /dashboard/admin/learn; the program copy below is fixed.
 *
 * Brand use follows the visual guideline: primary teal leads, secondary night green for
 * depth and text, lime only as a highlight on teal or night, pastels for supporting cards.
 */

import { Component, useState, type ComponentType, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check, Loader2 } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { PublicCohort } from '@/convex/learn'
import { errorMessage } from '@/components/partners/portal/shared'
import { cn } from '@/lib/utils'

export type { PublicCohort }
export type Track = 'rehabify' | 'external'

export const PROGRAM = {
  title: 'Rehabify MSK Specialist Program',
  shortTitle: 'MSK Specialist Program',
  certificate: 'Rehabify MSK Specialist Certificate',
  summary:
    'Build practical skills in musculoskeletal assessment, clinical reasoning, patient management, and rehabilitation through structured online learning and live clinical sessions.',
  certificationNote:
    'Certification issued by Rehabify following successful completion of the program and assessment. This is a professional development certificate and does not replace professional licensure or specialist accreditation by a regulatory body.',
  supportEmail: 'support@rehabify.ng',
}

/** Shown before the first cohort exists, and in the headline. */
export const DEFAULT_DURATION = '5 weeks'

const SHARED_INCLUDES = [
  '5-week MSK training program',
  'Weekly live online sessions',
  'Recorded sessions available to watch later',
  'Case-based clinical discussions',
]

export const TRACKS: Record<
  Track,
  { label: string; short: string; audience: string; cta: string; includes: string[] }
> = {
  rehabify: {
    label: 'Rehabify Physiotherapist',
    short: 'Rehabify PT',
    audience: 'For physiotherapists currently practising with Rehabify.',
    cta: 'Register as Rehabify PT',
    includes: [...SHARED_INCLUDES, 'Live demonstrations with real patients', 'Final assessment', 'Rehabify MSK Specialist Certificate'],
  },
  external: {
    label: 'Other Physiotherapists',
    short: 'Other physiotherapist',
    audience: 'Open to licensed physiotherapists who want to develop their practical MSK skills.',
    cta: 'Register as Physiotherapist',
    includes: [...SHARED_INCLUDES, 'Final assessment', 'Rehabify MSK Specialist Certificate'],
  },
}

export const YEARS_OF_PRACTICE = ['Less than 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years']

/** "5 weeks" → "5 Weeks", for the headline. */
export function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

export const CLOSED_COPY: Record<NonNullable<PublicCohort['closedReason']>, string> = {
  draft: "Registration hasn't opened yet.",
  closed: 'Registration for this cohort is closed.',
  ended: 'This cohort has finished.',
  deadline: 'The registration deadline has passed.',
  full: 'This cohort is full.',
}

/**
 * The cohort the public site shows. `initial` is what the server rendered (undefined if it
 * couldn't fetch); the live query takes over once it loads. Undefined means still loading.
 */
export function usePublicCohort(initial?: PublicCohort | null): PublicCohort | null | undefined {
  const live = useQuery(api.learn.getPublicCohort, {}) as PublicCohort | null | undefined
  return live === undefined ? initial : live
}

/**
 * Renders nothing if a promotion fails (e.g. the site is deployed before the Convex
 * functions are). The banner lives in the global header, so it must never take a page down.
 */
export class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[learn] promotion hidden after an error:', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Open for registration and switched on for this surface. */
export function isPromoted(cohort: PublicCohort | null | undefined, surface: 'landing' | 'banner') {
  if (!cohort || !cohort.isOpen) return false
  return surface === 'landing' ? cohort.showOnLanding : cohort.showBanner
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand pieces
// ─────────────────────────────────────────────────────────────────────────────

/** Cal Sans for display text that isn't a heading (headings get it globally). */
export const displayFont = 'font-[family-name:var(--font-cal)]'

const pillBase =
  'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

/** Lime highlight: only on teal or night backgrounds. */
export const pillLime = cn(pillBase, 'bg-rh-lime text-rh-night hover:brightness-[0.94] focus-visible:ring-rh-lime focus-visible:ring-offset-rh-teal')
export const pillTeal = cn(pillBase, 'bg-rh-teal text-white hover:bg-rh-teal-deep focus-visible:ring-rh-teal')
export const pillWhite = cn(pillBase, 'bg-white text-rh-night hover:bg-rh-honeydew focus-visible:ring-white focus-visible:ring-offset-rh-teal')
export const pillGhostOnDark = cn(pillBase, 'border border-white/25 text-white hover:bg-white/10 focus-visible:ring-white/70 focus-visible:ring-offset-rh-teal')
export const pillOutline = cn(pillBase, 'border border-rh-night/15 bg-white text-rh-night hover:border-rh-night/30 focus-visible:ring-rh-teal')

export const fieldClass =
  'h-12 w-full rounded-2xl border border-rh-night/10 bg-white px-4 text-[15px] text-rh-night placeholder:text-rh-night/35 transition focus:border-rh-teal focus:outline-none focus:ring-4 focus:ring-rh-teal/10 disabled:bg-rh-canvas disabled:text-rh-night/60'

/** The overlapping rounded squares from the guide's colour-pairing page. */
export function PairingShapes({ className, tone = 'night' }: { className?: string; tone?: 'night' | 'teal' }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute', className)}>
      <div className={cn('absolute inset-0 rounded-[28%]', tone === 'night' ? 'bg-rh-night/70' : 'bg-rh-teal')} />
      <div className="absolute -bottom-[18%] -right-[18%] h-[62%] w-[62%] rounded-[26%] bg-rh-lime" />
    </div>
  )
}

export function CheckItem({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          onDark ? 'bg-rh-lime text-rh-night' : 'bg-rh-mint text-rh-teal'
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className={cn('text-[15px] leading-6', onDark ? 'text-white/90' : 'text-rh-night/80')}>{children}</span>
    </li>
  )
}

export function Fact({
  icon: Icon,
  label,
  value,
  loading = false,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value?: ReactNode
  loading?: boolean
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rh-honeydew text-rh-teal">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rh-night/45">{label}</p>
        {loading ? (
          <div className="mt-1.5 h-4 w-40 animate-pulse rounded-full bg-rh-night/[0.07]" />
        ) : (
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-rh-night">{value}</p>
        )}
      </div>
    </div>
  )
}

/** "Tell me when the next cohort opens." */
export function InterestForm({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const join = useMutation(api.learn.joinInterestList)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (state === 'done') {
    return (
      <p className={cn('flex items-center gap-2 text-sm font-medium', onDark ? 'text-white' : 'text-rh-teal', className)}>
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full', onDark ? 'bg-rh-lime text-rh-night' : 'bg-rh-mint')}>
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        You&apos;re on the list. We&apos;ll email you when the next cohort opens.
      </p>
    )
  }

  return (
    <form
      className={cn('w-full', className)}
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setState('busy')
        try {
          await join({ email })
          setState('done')
        } catch (err) {
          setError(errorMessage(err, 'Something went wrong. Please try again.'))
          setState('idle')
        }
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="learn-interest-email">
          Email address
        </label>
        <input
          id="learn-interest-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(fieldClass, 'sm:flex-1', onDark && 'border-white/15')}
        />
        <button type="submit" disabled={state === 'busy'} className={cn(onDark ? pillLime : pillTeal, 'h-12 shrink-0')}>
          {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" />}
          Notify me
        </button>
      </div>
      {error && <p className={cn('mt-2 text-sm', onDark ? 'text-rh-rose' : 'text-rose-600')}>{error}</p>}
    </form>
  )
}
