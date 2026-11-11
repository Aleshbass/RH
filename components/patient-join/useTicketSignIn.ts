'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, useSignIn } from '@clerk/nextjs'
import { AFTER_JOIN_PATH, JUST_JOINED_KEY } from './refs'

/**
 * Finishes sign-in with the one-time Clerk ticket the server made after checking the PIN
 * (same as the Joy /go links). Returns false when the ticket couldn't be used.
 */
export function useTicketSignIn() {
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const { signIn, setActive, isLoaded } = useSignIn()

  const finish = useCallback(
    async (ticket: string, options: { to?: string; justJoined?: boolean } = {}) => {
      const to = options.to ?? AFTER_JOIN_PATH
      if (options.justJoined) {
        try {
          localStorage.setItem(JUST_JOINED_KEY, '1')
        } catch {
          // Storage blocked: they can add the app from Settings
        }
      }
      if (isSignedIn) {
        router.replace(to)
        return true
      }
      if (!isLoaded || !signIn || !setActive) return false
      try {
        const attempt = await signIn.create({ strategy: 'ticket', ticket })
        if (attempt.status !== 'complete' || !attempt.createdSessionId) return false
        await setActive({ session: attempt.createdSessionId })
        router.replace(to)
        return true
      } catch {
        return false
      }
    },
    [isLoaded, isSignedIn, router, setActive, signIn]
  )

  return { finish, ready: isLoaded }
}
