'use client'

/**
 * Tells the Rehabify team (careQueue.noteBrowsing) when a signed-in patient spends a little while on
 * Find a Physio, so someone can help them book. Once per visit; the server skips patients who booked
 * recently and alerts at most once a day per patient. Renders nothing.
 */

import { useEffect } from 'react'
import { useConvexAuth, useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { viewedPhysioIds } from '@/lib/viewedPhysios'

const noteBrowsingRef = makeFunctionReference<'mutation', { looking?: string; viewed?: string[] }, { noted: boolean }>('careQueue:noteBrowsing')
const SESSION_KEY = 'rh_care_browsing_noted'
const AFTER_MS = 20_000

export function CareBrowsingSignal({ looking }: { looking?: string }) {
  const { isAuthenticated } = useConvexAuth()
  const noteBrowsing = useMutation(noteBrowsingRef)

  useEffect(() => {
    if (!isAuthenticated) return
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return
    } catch {
      // Storage blocked: still fine to note once for this page view
    }
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        // ignore
      }
      // With the profiles opened on this device, maybe before they signed in
      const viewed = viewedPhysioIds()
      void noteBrowsing({ looking: looking?.trim() || undefined, viewed: viewed.length ? viewed : undefined }).catch(() => undefined)
    }, AFTER_MS)
    return () => window.clearTimeout(timer)
    // Once per visit: later search changes don't re-send
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  return null
}
