'use client'

/**
 * Opens an admin's "View as" link (convex/adminViewAs.ts): signs in as that person with the
 * one-time ticket in the #fragment, remembers it's a support view (ViewAsBanner), and goes to
 * their dashboard. In a window where someone is already signed in, it explains instead of
 * signing them out, because the ticket only works once.
 */
import { useEffect, useState } from 'react'
import { useAuth, useClerk, useSignIn } from '@clerk/nextjs'
import { Eye, Loader2 } from '@/components/icons'
import { VIEW_AS_KEY } from '@/components/auth/ViewAsBanner'

type Ticket = { t: string; n: string; a: string }

const card = 'mx-auto mt-16 w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-soft ring-1 ring-black/[0.05] sm:p-8'
const primary =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-rh-ink px-5 text-sm font-semibold text-white transition hover:bg-rh-ink/90 disabled:opacity-60'
const secondary =
  'inline-flex h-11 w-full items-center justify-center rounded-full border border-black/10 px-5 text-sm font-semibold text-rh-ink transition hover:bg-black/[0.03]'

export default function ViewAsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const clerk = useClerk()
  const { signOut } = clerk
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn()
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const t = params.get('t')
    setTicket(t ? { t, n: params.get('n') || 'this person', a: params.get('a') || 'An admin' } : null)
  }, [])

  // Not signed in here (a private window): open it straight away
  useEffect(() => {
    if (!ticket || !isLoaded || isSignedIn || !signInLoaded || !signIn || !setActive || state !== 'idle') return
    setState('opening')
    void (async () => {
      try {
        const attempt = await signIn.create({ strategy: 'ticket', ticket: ticket.t })
        await setActive({ session: attempt.createdSessionId })
        try {
          localStorage.setItem(VIEW_AS_KEY, JSON.stringify({ name: ticket.n, admin: ticket.a, clerkUserId: clerk.user?.id ?? null, at: Date.now() }))
        } catch {
          // The bar just won't show
        }
        window.history.replaceState(null, '', '/support/view-as')
        window.location.replace('/role-selection')
      } catch {
        setState('failed')
      }
    })()
  }, [ticket, isLoaded, isSignedIn, signInLoaded, signIn, setActive, state])

  if (ticket === undefined || !isLoaded) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </main>
    )
  }

  if (!ticket || state === 'failed') {
    return (
      <main className="px-4">
        <div className={card}>
          <h1 className="text-xl font-semibold text-rh-ink">This link can&apos;t be used</h1>
          <p className="mt-2 text-sm text-neutral-600">
            View-as links work once and only for 10 minutes. Make a new one from the person&apos;s page in the admin console.
          </p>
        </div>
      </main>
    )
  }

  if (isSignedIn && state === 'idle') {
    return (
      <main className="px-4">
        <div className={card}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <Eye className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-rh-ink">Open this in a private window</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            You&apos;re signed in here as yourself. Copy this link into a private (incognito) window to see Rehabify as{' '}
            <strong className="text-rh-ink">{ticket.n}</strong> and stay signed in here. The link works once, for 10 minutes.
          </p>
          <div className="mt-6 space-y-2">
            <button
              type="button"
              className={primary}
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button type="button" className={secondary} onClick={() => void signOut(() => window.location.reload())}>
              Sign out here and continue as {ticket.n}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-neutral-500">
      <Loader2 className="h-6 w-6 animate-spin" />
      Opening Rehabify as {ticket.n}…
    </main>
  )
}
