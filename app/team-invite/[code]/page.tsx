'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { AlertTriangle, ArrowRight, GraduationCap, Loader2, Newspaper } from '@/components/icons'
import { TEAM_ROLE_HOME, teamAccessApi, type TeamRole } from '@/lib/teamAccessApi'

// The signed-in person's account (a plain reference: the generated api type is at its depth limit)
const myUserRef = makeFunctionReference<'query', Record<string, never>, { role?: string } | null>('users:getMyUser')

const ROLE_COPY: Record<TeamRole, { icon: typeof Newspaper; what: string; sees: string }> = {
  blog_editor: {
    icon: Newspaper,
    what: 'write articles for the Rehabify blog',
    sees: 'You write posts and send them for review; the Rehabify team publishes them.',
  },
  learn_instructor: {
    icon: GraduationCap,
    what: 'build video courses on Rehabify Learn',
    sees: 'You create courses and lessons and send them for review; the Rehabify team publishes them.',
  },
}

const ROLE_NAMES: Record<string, string> = {
  physiotherapist: 'physiotherapist',
  clinic_owner: 'clinic owner',
  clinic_staff: 'clinic team member',
  patient: 'patient',
  family_member: 'family member',
  doctor: 'referring doctor',
  partner: 'partner',
  blog_editor: 'blog writer',
  learn_instructor: 'Learn instructor',
}

const button =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime px-6 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:opacity-60'
const secondary =
  'inline-flex h-12 w-full items-center justify-center rounded-full border border-rh-ink/15 px-6 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-white'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-rh-canvas px-4 pb-16 pt-28 text-rh-ink">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-7 sm:p-9">{children}</div>
    </div>
  )
}

const errorText = (error: unknown) => {
  const data = (error as { data?: unknown } | null)?.data
  return typeof data === 'string' && data.trim() ? data : 'Something went wrong. Please try again.'
}

export default function TeamInvitePage() {
  const params = useParams<{ code: string }>()
  const code = params?.code ?? ''
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const preview = useQuery(teamAccessApi.preview, code ? { code } : 'skip')
  const me = useQuery(myUserRef, isSignedIn ? {} : 'skip')
  const accept = useMutation(teamAccessApi.accept)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switchFrom, setSwitchFrom] = useState<string | null>(null)
  const autoTried = useRef(false)
  const back = encodeURIComponent(`/team-invite/${code}`)

  const go = async (confirm = false) => {
    setBusy(true)
    setError(null)
    try {
      const result = await accept({ code, ...(confirm ? { confirm: true } : {}) })
      if (result.status === 'confirm') setSwitchFrom(result.currentRole ?? '')
      else if (result.status === 'accepted') router.replace(result.home ?? '/dashboard')
      else setError('Your account is still being set up. Try again in a moment.')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // Already theirs (it applied by itself when they signed up with the invited email): go in
  const alreadyMine = preview?.state === 'accepted' && Boolean(isSignedIn) && me?.role === preview.role
  useEffect(() => {
    if (alreadyMine && preview?.state === 'accepted') router.replace(TEAM_ROLE_HOME[preview.role])
  }, [alreadyMine, preview, router])

  // A brand-new account (no role yet) accepts straight away: nothing to choose
  useEffect(() => {
    if (autoTried.current || !isSignedIn || !me || me.role || preview?.state !== 'ok') return
    autoTried.current = true
    void go()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when everything is ready
  }, [isSignedIn, me, preview])

  if (!isLoaded || preview === undefined || (isSignedIn && me === undefined) || alreadyMine) {
    return (
      <Shell>
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-rh-ink/40" />
        </div>
      </Shell>
    )
  }

  if (preview.state !== 'ok') {
    return (
      <Shell>
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h1 className="mt-4 text-2xl font-bold leading-tight">
          {preview.state === 'expired' ? 'This invite has expired' : preview.state === 'accepted' ? 'This invite has been used' : 'This invite link no longer works'}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-rh-ink/70">
          {preview.state === 'expired'
            ? 'Invite links last 14 days. Ask the Rehabify team to send you a new one.'
            : preview.state === 'accepted'
              ? 'If it was you, sign in with the account you used to accept it.'
              : 'It may have been used already, replaced by a newer link, or cancelled. Ask the Rehabify team for a new one.'}
        </p>
        <Link href="/" className={`${secondary} mt-6`}>
          Go to the homepage
        </Link>
      </Shell>
    )
  }

  const copy = ROLE_COPY[preview.role]
  const Icon = copy.icon

  return (
    <Shell>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-honeydew">
        <Icon className="h-6 w-6 text-rh-ink" />
      </span>
      <p className="mt-5 text-[13px] font-bold uppercase tracking-wide text-rh-lime-deep">{preview.roleLabel}</p>
      <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight">You&apos;re invited to {copy.what}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-rh-ink/70">
        {preview.invitedBy} invited you. {copy.sees}
      </p>

      {switchFrom ? (
        <div className="mt-6 rounded-2xl bg-rh-peach p-4 text-[14px] leading-relaxed">
          <p className="font-semibold">You&apos;re signed in as a {ROLE_NAMES[switchFrom] ?? switchFrom}.</p>
          <p className="mt-1 text-rh-ink/75">
            Accepting changes this account to a {preview.roleLabel.toLowerCase()}, so you&apos;ll only see{' '}
            {preview.role === 'blog_editor' ? 'the blog' : 'your Learn courses'}. To keep both, sign out and accept with a different account.
          </p>
          <div className="mt-4 grid gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => go(true)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Yes, switch this account
            </button>
            <button type="button" className={secondary} onClick={() => setSwitchFrom(null)}>
              Not now
            </button>
          </div>
        </div>
      ) : isSignedIn ? (
        <div className="mt-7 grid gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => go()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Accept and continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-7 grid gap-2">
          <Link href={`/sign-up?redirect=${back}`} className={button}>
            Create my account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={`/sign-in?redirect=${back}`} className={secondary}>
            I already have an account
          </Link>
          <p className="mt-2 text-center text-xs text-rh-ink/55">Any email or Google account works. The link can only be used once.</p>
        </div>
      )}

      {error ? <p className="mt-4 rounded-xl bg-rh-blush px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </Shell>
  )
}
