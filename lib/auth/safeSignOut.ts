'use client'

/**
 * Signing out of a dashboard without "Application error: a client-side exception has occurred".
 *
 * What went wrong (owner, signing out of a patient account from Exercises or Settings, 18 Nov 2026):
 * Clerk ended the session and started its own soft redirect; while that navigation was pending, the
 * page's Convex queries ran again with no login, the server refused them, and the error thrown in
 * the middle of the navigation broke Next's router (React error #310).
 *
 * So: first swap the dashboard for "Signing you out…" (SignOutGuard reads useSigningOut), which
 * unmounts every query on the page; then end the session; then leave with a full page load, which
 * never goes through the router and starts the next visit fresh.
 */
import { useSyncExternalStore } from 'react'
import type { useClerk } from '@clerk/nextjs'

type ClerkSignOut = ReturnType<typeof useClerk>['signOut']

let signingOut = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** True from the moment someone taps Sign out until the page is left. */
export function useSigningOut() {
  return useSyncExternalStore(subscribe, () => signingOut, () => false)
}

/** Every dashboard "Sign out" goes through here instead of calling Clerk's signOut directly. */
export async function safeSignOut(signOut: ClerkSignOut, redirectUrl = '/') {
  signingOut = true
  for (const listener of listeners) listener()
  // Let React put "Signing you out…" on screen (and drop the page's queries) before the session ends
  await new Promise((resolve) => setTimeout(resolve, 80))
  const leave = () => window.location.assign(redirectUrl)
  try {
    await signOut(leave)
  } catch {
    leave()
  }
}
