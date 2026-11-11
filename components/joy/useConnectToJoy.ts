'use client'

import { useCallback, useState } from 'react'
import { useAction } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import type { Id } from '@/convex/_generated/dataModel'
import { playSound } from '@/lib/sounds'

// By name: the generated `api` type is at TypeScript's depth limit
const createConnectLinkRef = makeFunctionReference<
  'action',
  { patientId: Id<'users'> },
  { whatsappUrl: string; joyUrl: string; code: string; message: string; expiresAt: number; alreadyConnected: boolean }
>('joyConnect:createConnectLink')

/**
 * "Connect to Joy on WhatsApp" (physio and clinic patient pages): opens WhatsApp with a message to
 * the patient carrying their one-time link to Joy (convex/joyConnect.ts). When they tap it and send
 * the message, Joy greets them as someone in care: exercises, reminders and visits on WhatsApp.
 */
export function useConnectToJoy() {
  const createLink = useAction(createConnectLinkRef)
  const [busy, setBusy] = useState(false)

  const connect = useCallback(
    async (patientId: string, firstName?: string) => {
      if (busy) return
      // Open the window now so phones don't block it as a popup
      const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
      setBusy(true)
      try {
        const link = await createLink({ patientId: patientId as Id<'users'> })
        if (win) win.location.href = link.whatsappUrl
        else window.location.href = link.whatsappUrl
        playSound('send')
        toast.success(`Send the message to ${firstName || 'the patient'}`, {
          description: link.alreadyConnected
            ? 'They’re connected already. This new link moves Joy to whichever number taps it.'
            : 'When they tap the link and send it, Joy connects them. The link works for 30 days.',
          duration: 10000,
          action: {
            label: 'Copy message',
            onClick: () => void navigator.clipboard?.writeText(link.message),
          },
        })
      } catch (error) {
        win?.close()
        toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Couldn’t make the link. Try again.')
      } finally {
        setBusy(false)
      }
    },
    [busy, createLink]
  )

  return { connect, busy }
}
