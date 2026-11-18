'use client'

/**
 * Every dashboard (app/dashboard/layout.tsx): the moment a signed-in person signs out (or their
 * session ends), the page is swapped for a quiet "Signing you out…" instead of staying mounted.
 *
 * Without this, the page's Convex queries ran again for a moment with no login, the server refused
 * them, and the page crashed with "Application error: a client-side exception has occurred" before
 * Clerk's redirect landed (owner, signing out of a patient account from Exercises or Settings,
 * 18 Nov 2026).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/nextjs'
import { RehabifyLoader } from '@/components/brand/RehabifyLoader'
import { useSigningOut } from '@/lib/auth/safeSignOut'

/** If Clerk's own redirect doesn't happen (a session that simply expired), go to sign-in ourselves */
const FALLBACK_REDIRECT_MS = 5000

export function SignOutGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  // Tapped Sign out (lib/auth/safeSignOut.ts): swap the page out before the session even ends
  const tappedSignOut = useSigningOut()
  const [wasSignedIn, setWasSignedIn] = useState(false)
  useEffect(() => {
    if (isLoaded && isSignedIn) setWasSignedIn(true)
  }, [isLoaded, isSignedIn])

  const signingOut = tappedSignOut || (wasSignedIn && isLoaded && !isSignedIn)
  useEffect(() => {
    if (!signingOut) return
    const timer = setTimeout(() => window.location.replace('/sign-in'), FALLBACK_REDIRECT_MS)
    return () => clearTimeout(timer)
  }, [signingOut])

  if (signingOut) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-rh-canvas text-sm text-neutral-500">
        <RehabifyLoader size={48} label="Signing you out" />
        <p>Signing you out…</p>
      </div>
    )
  }
  return <>{children}</>
}
