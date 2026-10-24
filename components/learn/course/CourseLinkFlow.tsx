'use client'

/**
 * /learn/start/<code>: the "Open my course" button in a Rehabify Learn email. Nothing happens
 * until the physio taps, so email link scanners can't use the link up. The tap swaps the code
 * for a short-lived Clerk sign-in ticket (convex/learn.ts redeemCourseLink).
 */

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth, useClerk, useSignIn } from '@clerk/nextjs'
import { useAction, useQuery } from 'convex/react'
import { GraduationCap, Hourglass, Link2Off, Loader2, User } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { pillInk, pillOutline } from '../shared'

const COURSE = '/learn/course'

type Peek =
  | { state: 'not_found' }
  | { state: 'signed_in'; firstName: string }
  | { state: 'ok' | 'used' | 'expired'; firstName: string; maskedEmail: string }

const FAILURE_TEXT: Record<string, string> = {
  used: 'This link has already been used. Get a new one below.',
  expired: 'This link has expired. Get a new one below.',
  not_found: "We couldn't find this link. Get a new one below.",
  unavailable: "We couldn't open your course just now. Please try again in a minute.",
}

function Frame({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-rh-cream px-4">
      <div className="mx-auto flex h-16 w-full max-w-lg items-center">
        <Image src="/logos/Ink%20MainRehabify.svg" alt="Rehabify" width={96} height={30} className="h-7 w-auto" />
        <span className="ml-2 rounded-full bg-rh-ink px-2 py-0.5 text-[11px] font-semibold text-rh-lime">Learn</span>
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-1 items-center pb-16">
        <div className="w-full rounded-[2rem] bg-white p-7 text-center shadow-soft sm:p-10">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-rh-ink text-rh-lime">{icon}</span>
          <h1 className="mt-6 text-[28px] leading-tight tracking-tight text-rh-ink sm:text-[32px]">{title}</h1>
          <div className="mt-3 flex flex-col items-center gap-3 text-[15px] leading-7 text-rh-ink/65">{children}</div>
        </div>
      </div>
    </div>
  )
}

const newLink = (
  <Link href={COURSE} className={cn(pillOutline, 'mt-2 h-12 w-full text-[15px]')}>
    Email me a new link
  </Link>
)

export function CourseLinkFlow() {
  const params = useParams()
  const router = useRouter()
  const code = String(params.code ?? '')
  const link = useQuery(api.learn.peekCourseLink, { code }) as Peek | undefined
  const redeem = useAction(api.learn.redeemCourseLink)
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn()
  const { signOut } = useClerk()
  const [opening, setOpening] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Already signed in as this physio: straight to the course
  useEffect(() => {
    if (link?.state === 'signed_in') router.replace(COURSE)
  }, [link?.state, router])

  const open = async () => {
    if (!signIn || !setActive) return
    setOpening(true)
    setFailure(null)
    try {
      const result = (await redeem({ code })) as { ok: true; ticket: string } | { ok: false; reason: string }
      if (!result.ok) {
        setFailure(FAILURE_TEXT[result.reason] ?? FAILURE_TEXT.unavailable)
        setOpening(false)
        return
      }
      const attempt = await signIn.create({ strategy: 'ticket', ticket: result.ticket })
      if (attempt.status !== 'complete' || !attempt.createdSessionId) throw new Error('Sign-in incomplete')
      await setActive({ session: attempt.createdSessionId })
      playSound('success')
      router.replace(COURSE)
    } catch {
      setFailure(FAILURE_TEXT.unavailable)
      playSound('error')
      setOpening(false)
    }
  }

  if (link === undefined || !authLoaded || link.state === 'signed_in') {
    return (
      <Frame icon={<Loader2 className="h-7 w-7 animate-spin" />} title="Opening your course">
        <p>Just a moment.</p>
      </Frame>
    )
  }

  if (link.state === 'not_found') {
    return (
      <Frame icon={<Link2Off className="h-7 w-7" />} title="Link not recognised">
        <p>Check that you opened the full link from your email, or get a new one.</p>
        {newLink}
      </Frame>
    )
  }

  const greeting = `Hi ${link.firstName}`

  if (link.state === 'used' || link.state === 'expired') {
    return (
      <Frame icon={<Hourglass className="h-7 w-7" />} title={link.state === 'used' ? 'This link has been used' : 'This link has expired'}>
        <p>
          {greeting}. For your security each link signs you in once. Get a fresh one sent to {link.maskedEmail}.
        </p>
        {newLink}
      </Frame>
    )
  }

  // Someone else is signed in on this device; that session has to close first
  if (isSignedIn) {
    return (
      <Frame icon={<User className="h-7 w-7" />} title="You're signed in to another account">
        <p>
          {greeting}. Sign out of the other account on this device to open your course as {link.maskedEmail}.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpening(true)
            void signOut({ redirectUrl: `/learn/start/${code}` })
          }}
          disabled={opening}
          className={cn(pillInk, 'mt-2 h-12 w-full text-[15px]')}
        >
          {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign out and continue'}
        </button>
      </Frame>
    )
  }

  return (
    <Frame icon={<GraduationCap className="h-7 w-7" />} title={`${greeting}, your course is ready`}>
      <p>Live session links, weekly materials and the exercise library, all in one place. No password needed.</p>
      {failure && <p className="font-medium text-rose-600">{failure}</p>}
      <button type="button" onClick={() => void open()} disabled={opening || !signInLoaded} className={cn(pillInk, 'mt-2 h-12 w-full text-[15px]')}>
        {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Open my course'}
      </button>
      {failure && failure !== FAILURE_TEXT.unavailable && newLink}
      <p className="text-xs text-rh-ink/45">Signing in as {link.maskedEmail}</p>
    </Frame>
  )
}
