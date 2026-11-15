'use client'

/**
 * Invite links (owner 2026-11-15): learn.../?invite=<code>. Remembers the code on this device for
 * 30 days, shows a visitor who invited them, and once they're signed in to Learn tells the server
 * (points for both of them come when they finish a first lesson).
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { UserPlus, X } from '@/components/icons'
import { LEARN_EARN } from '@/lib/learn/points'
import { cn } from '@/lib/utils'
import { pillLime } from '../shared'
import { useLearnerIdentity } from '../platform/identity'
import { learnSignUpHref, WELCOME_PATH } from '../platform/learnApi'
import { pointsApi } from './pointsApi'

const KEY = 'rehabify:learn-invite'
const KEEP_MS = 30 * 86400000
const VALID = /^[a-z0-9]{5,12}$/

function stored(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { code?: string; at?: number }
    return v.code && v.at && Date.now() - v.at < KEEP_MS ? v.code : null
  } catch {
    return null
  }
}
function forget() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing saved
  }
}

export function InviteCapture() {
  const identity = useLearnerIdentity()
  const claim = useMutation(pointsApi.claimInvite)
  const [code, setCode] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const tried = useRef(false)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('invite')?.trim().toLowerCase() ?? null
    const c = fromUrl && VALID.test(fromUrl) ? fromUrl : stored()
    if (!c) return
    setCode(c)
    if (fromUrl === c) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() }))
      } catch {
        // private mode: works for this visit only
      }
    }
  }, [])

  const signedIn = Boolean(identity?.signedIn)
  const from = useQuery(pointsApi.inviteFrom, code && identity && !signedIn ? { code } : 'skip')

  // Signed in: tell the server once (it only counts people new to Learn)
  useEffect(() => {
    if (!code || !signedIn || tried.current) return
    tried.current = true
    claim({ code })
      .then((r) => {
        // Not through the welcome step yet: keep the code for after it
        if (r.reason === 'welcome') return
        forget()
        if (r.claimed) toast.success(`Welcome! Finish your first lesson and you and your friend both earn points.`)
      })
      .catch(() => undefined)
  }, [code, signedIn, claim])

  if (!code || signedIn || dismissed || !from) return null
  return (
    <div className="learn-fixed-dark border-b border-white/10 bg-rh-ink text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <UserPlus className="h-4 w-4 shrink-0 text-rh-lime" />
        <p className="min-w-0 flex-1 text-[13px] leading-5 text-white/85 sm:text-sm">
          <span className="font-semibold text-white">{from.firstName} invited you.</span> Join free, finish a lesson, and you get {LEARN_EARN.invited.points} points (so do they).
        </p>
        <Link href={learnSignUpHref(WELCOME_PATH)} className={cn(pillLime, 'h-9 shrink-0 px-4 text-[13px]')}>
          Join free
        </Link>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
