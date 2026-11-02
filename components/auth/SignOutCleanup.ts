'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { clearUserNoteDrafts } from '@/components/physio/notes/draftStore'
import { clearStoredPages, disablePush, setIconBadge, setOfflinePilot } from '@/lib/pwa'
import { wipeUser } from '@/lib/offline/vault'

/** Saved in this browser for one person; never carried over to whoever signs in next. */
const PERSONAL_KEYS = ['rh_signup_intent', 'rh_app_setup_snoozed_until']

/** Who last used this browser, so a different person never sees their offline pages, even after a restart. */
const LAST_USER_KEY = 'rh_last_user'

/**
 * Tidies the device whenever someone stops being signed in, however it happened: a sign-out
 * button in any portal, Clerk's account menu, an expired session, or a different account signing
 * in. Their push notifications stop coming to this device, the app-icon count clears, and their
 * unsaved clinical-note drafts, saved choices, stored pages and encrypted offline data are removed.
 * The next person turns notifications on for themselves (the app-setup prompt asks).
 */
export function useSignOutCleanup() {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    const current = isSignedIn && userId ? userId : null
    const previous = lastUserId.current
    lastUserId.current = current
    if (previous && previous !== current) void cleanUpAfter(previous)
    // A different person signed in on this browser since the page last ran
    if (current) {
      const stored = readLastUser()
      if (stored && stored !== current) {
        void clearStoredPages()
        void wipeUser(stored).catch(() => undefined)
      }
      writeLastUser(current)
    }
  }, [isLoaded, isSignedIn, userId])
}

function readLastUser(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}

function writeLastUser(clerkUserId: string) {
  try {
    window.localStorage.setItem(LAST_USER_KEY, clerkUserId)
  } catch {
    // Storage blocked: offline pages can't be kept either
  }
}

async function cleanUpAfter(clerkUserId: string) {
  setIconBadge(0)
  clearUserNoteDrafts(clerkUserId)
  await clearStoredPages()
  // Their encrypted offline copy on this phone (lib/offline/vault.ts) and their pilot switch
  await wipeUser(clerkUserId).catch(() => undefined)
  setOfflinePilot(false)
  try {
    for (const key of PERSONAL_KEYS) window.localStorage.removeItem(key)
  } catch {
    // Storage blocked: nothing was saved there
  }
  // The server forgets the old endpoint the first time a push to it fails
  await disablePush().catch(() => null)
}
