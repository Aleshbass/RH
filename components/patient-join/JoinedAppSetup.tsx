'use client'

import { useEffect, useState } from 'react'
import { AppSetupPrompt } from '@/components/pwa/AppSetup'
import { JUST_JOINED_KEY } from './refs'

/**
 * Right after joining from their physio's link: "Add Rehabify to your home screen" opens once,
 * so next time they just tap the icon. Other patients find it in the top bar or Settings.
 */
export function JoinedAppSetup() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(JUST_JOINED_KEY)) {
        localStorage.removeItem(JUST_JOINED_KEY)
        setShow(true)
      }
    } catch {
      // Storage blocked: nothing to show
    }
  }, [])

  return show ? <AppSetupPrompt /> : null
}
