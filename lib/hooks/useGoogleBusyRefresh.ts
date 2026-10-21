'use client'

import { useEffect } from 'react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * Asks the server to refresh this physio's Google Calendar busy times when a booking screen
 * opens. The slot list (calendar.availability.getAvailableSlots) is a live query, so it drops
 * the busy times by itself once they arrive. Failures are ignored: booking still works.
 */
export function useGoogleBusyRefresh(physiotherapistId: Id<'users'> | string | null | undefined) {
  const refresh = useAction(api.calendar.availability.refreshGoogleBusy)
  useEffect(() => {
    if (!physiotherapistId) return
    refresh({ physiotherapistId: physiotherapistId as Id<'users'> }).catch(() => {})
  }, [physiotherapistId, refresh])
}
