'use client'

import { useCallback, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { playSound } from '@/lib/sounds'
import { joinRefs } from './refs'

export function inviteErrorText(error: unknown) {
  return error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Couldn’t make the link. Try again.'
}

/**
 * One tap from a patient list or record: opens the physio's own WhatsApp with the patient's chat
 * and a ready message carrying their personal join link (convex/actions/patientJoin.ts).
 */
export function useSendJoinLink() {
  const createLink = useAction(joinRefs.createInviteLink)
  const markSent = useMutation(joinRefs.markInviteSent)
  const [busy, setBusy] = useState(false)

  const send = useCallback(
    async (patientId: string, firstName?: string) => {
      if (busy) return
      // Open the window now so phones don't block it as a popup
      const win = typeof window !== 'undefined' ? window.open('', '_blank') : null
      setBusy(true)
      try {
        const link = await createLink({ patientId })
        if (!link.ok) {
          win?.close()
          toast.info(`${firstName || 'This patient'} signs in with their own email`, {
            description: 'They already have their own Rehabify login, so there’s no link to send.',
          })
          return
        }
        if (win) win.location.href = link.whatsappUrl
        else window.location.href = link.whatsappUrl
        void markSent({ patientId }).catch(() => undefined)
        playSound('send')
        toast.success(`Press send in WhatsApp`, {
          description:
            link.purpose === 'join'
              ? `${firstName || 'They'} tap the link, choose a PIN and they’re in. It works for 30 days.`
              : `${firstName || 'They'} tap the link to choose a new PIN. Their old PIN stops working.`,
          duration: 10000,
          action: { label: 'Copy message', onClick: () => void navigator.clipboard?.writeText(link.message) },
        })
      } catch (error) {
        win?.close()
        toast.error(inviteErrorText(error))
      } finally {
        setBusy(false)
      }
    },
    [busy, createLink, markSent]
  )

  return { send, busy }
}
