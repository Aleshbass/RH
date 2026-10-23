'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth, useClerk, useSignIn } from '@clerk/nextjs'
import { useAction, useQuery } from 'convex/react'
import { Hourglass, Link2Off, Loader2, LogIn, User } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { CallStatusScreen } from '@/components/video/room'
import { rememberDashboardClaim } from '@/lib/auth/dashboardClaim'
import { DASHBOARD_LINK_REQUEST_URL } from '@/lib/joyWhatsApp'

// One-tap dashboard link Joy sends on WhatsApp after a booking is paid: /go/<code>.
// Nothing happens until the patient taps, so WhatsApp's link preview can't use it up.
// The tap exchanges the code for a short-lived Clerk sign-in ticket (convex/actions/joyDashboard.ts).

const DASHBOARD = '/dashboard/patient?welcome=joy'

const primaryButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-8 text-[15px] font-medium text-white shadow-[0_12px_30px_-12px_rgba(0,91,87,0.7)] transition-all hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60'
const secondaryButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-8 text-[15px] font-medium text-neutral-800 transition-all hover:border-neutral-300 active:scale-[0.98]'

const FAILURE_TEXT: Record<string, string> = {
  used: 'This link has already been used. Ask Joy for a new one.',
  expired: 'This link has expired. Ask Joy for a new one.',
  not_found: "We couldn't find this link. Ask Joy for a new one.",
  unavailable: "We couldn't open your dashboard just now. Please try again in a minute.",
}

function NewLinkButton() {
  return (
    <a href={DASHBOARD_LINK_REQUEST_URL} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
      Get a new link from Joy
    </a>
  )
}

export default function DashboardLinkPage() {
  const params = useParams()
  const router = useRouter()
  const code = String(params.code ?? '')
  const link = useQuery(api.joyAccounts.peekAccessLink, { code })
  const redeem = useAction(api.actions.joyDashboard.redeemDashboardLink)
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn()
  const { signOut } = useClerk()
  const [opening, setOpening] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Already signed in as this patient: nothing to do
  useEffect(() => {
    if (link?.state === 'signed_in') router.replace(DASHBOARD)
  }, [link?.state, router])

  const open = async () => {
    if (!signIn || !setActive) return
    setOpening(true)
    setFailure(null)
    try {
      const result = await redeem({ code })
      if (!result.ok) {
        setFailure(FAILURE_TEXT[result.reason] ?? FAILURE_TEXT.unavailable)
        setOpening(false)
        return
      }
      const attempt = await signIn.create({ strategy: 'ticket', ticket: result.ticket })
      if (attempt.status !== 'complete' || !attempt.createdSessionId) throw new Error('Sign-in incomplete')
      await setActive({ session: attempt.createdSessionId })
      router.replace(DASHBOARD)
    } catch {
      setFailure(FAILURE_TEXT.unavailable)
      setOpening(false)
    }
  }

  const switchAccount = async () => {
    setOpening(true)
    await signOut({ redirectUrl: `/go/${code}` })
  }

  if (link === undefined || !authLoaded || link.state === 'signed_in') {
    return <CallStatusScreen icon={<Loader2 className="h-6 w-6 animate-spin text-brand" />} title="Opening your dashboard" />
  }

  const greeting = link.firstName ? `Hi ${link.firstName}` : 'Hi there'

  if (link.state === 'not_found') {
    return (
      <CallStatusScreen icon={<Link2Off className="h-6 w-6" />} title="Link not recognised" description="Check that you opened the full link Joy sent you on WhatsApp.">
        <NewLinkButton />
      </CallStatusScreen>
    )
  }

  if (link.state === 'used' || link.state === 'expired') {
    return (
      <CallStatusScreen
        icon={<Hourglass className="h-6 w-6" />}
        title={link.state === 'used' ? 'This link has been used' : 'This link has expired'}
        description="For your security each link opens your dashboard once. Joy can send you a new one any time."
      >
        <NewLinkButton />
        <Link href="/sign-in?redirect=%2Fdashboard%2Fpatient" className="pt-2 text-sm font-medium text-brand hover:underline">
          I added an email. Sign in instead
        </Link>
      </CallStatusScreen>
    )
  }

  // Someone else is signed in on this device; the patient's account needs that session closed first
  if (isSignedIn) {
    return (
      <CallStatusScreen
        icon={<User className="h-6 w-6" />}
        title="You're signed in to another account"
        description={`${greeting}. Sign out of the other account on this device to open your Rehabify dashboard.`}
      >
        <button type="button" onClick={() => void switchAccount()} disabled={opening} className={primaryButton}>
          {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign out and continue'}
        </button>
      </CallStatusScreen>
    )
  }

  if (link.state === 'sign_in') {
    return (
      <CallStatusScreen
        icon={<LogIn className="h-6 w-6" />}
        title="Sign in to your dashboard"
        description={`${greeting}. You already have a Rehabify account, so sign in to see this booking and your care.`}
      >
        <Link href="/sign-in?redirect=%2Fdashboard%2Fpatient" className={primaryButton}>
          Sign in
        </Link>
      </CallStatusScreen>
    )
  }

  if (link.state === 'claim') {
    const signUpHref = `/sign-up?as=patient&redirect=${encodeURIComponent(DASHBOARD)}`
    return (
      <CallStatusScreen
        icon={<User className="h-6 w-6" />}
        title="Create your Rehabify account"
        description={`${greeting}. Create an account in a minute and your booking, location and what you shared with Joy will be waiting for you.`}
      >
        <Link href={signUpHref} onClick={() => rememberDashboardClaim(code)} className={primaryButton}>
          Create my account
        </Link>
      </CallStatusScreen>
    )
  }

  return (
    <CallStatusScreen
      icon={<User className="h-6 w-6" />}
      title={`${greeting}, your dashboard is ready`}
      description={
        <div className="space-y-2">
          <p>See your booking, your physiotherapist and what you shared with Joy. No password needed.</p>
          {failure && <p className="font-medium text-rose-600">{failure}</p>}
        </div>
      }
    >
      <button type="button" onClick={() => void open()} disabled={opening || !signInLoaded} className={primaryButton}>
        {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Open my dashboard'}
      </button>
      {failure && failure !== FAILURE_TEXT.unavailable && <NewLinkButton />}
    </CallStatusScreen>
  )
}
