'use client'

import { useEffect } from 'react'
import { AppSetupPrompt } from '@/components/pwa/AppSetup'
import { JUST_JOINED_KEY } from './refs'

/**
 * "Add Rehabify to your home screen" for every patient (owner, 20 Nov 2026: patients couldn't find
 * how to install the app; it only opened once, right after joining from a physio's link). It opens
 * on its own until the app is installed and notifications are on; "Not now" waits 3 days. The top
 * bar's "Get the app" and Settings open it any time.
 */
export function JoinedAppSetup() {
  useEffect(() => {
    try {
      // Just joined from their physio's link: it opens now anyway (nothing has snoozed it yet)
      localStorage.removeItem(JUST_JOINED_KEY)
    } catch {
      // Storage blocked: nothing to tidy
    }
  }, [])

  return <AppSetupPrompt audience="patient" />
}
