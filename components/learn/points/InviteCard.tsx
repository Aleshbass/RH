'use client'

/**
 * "Invite friends, earn together" (owner 2026-11-15): the learner's personal link and how it's
 * going. A friend who joins with it and finishes a first lesson earns both of them points.
 */

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, UserPlus } from '@/components/icons'
import { LEARN_EARN } from '@/lib/learn/points'
import { cn } from '@/lib/utils'
import { pillLime } from '../shared'
import { learnShareUrl, ShareLinks } from '../shareKit'
import { formatPoints, inviteLink, pointsApi } from './pointsApi'

export function InviteCard() {
  const data = useQuery(pointsApi.myInvite, {})
  const create = useMutation(pointsApi.createInvite)
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const url = data.code ? learnShareUrl(inviteLink(data.code)) : null

  const make = async () => {
    setBusy(true)
    try {
      await create({})
    } catch (err) {
      const msg = (err as { data?: unknown })?.data
      toast.error(typeof msg === 'string' && msg ? msg : 'Couldn’t make your link. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="learn-fixed-dark mt-8 rounded-3xl bg-rh-ink p-5 text-white sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-[#0b1312]">
          <UserPlus className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Invite friends, earn together</h2>
          <p className="mt-1 text-sm leading-6 text-white/65">
            When a friend joins with your link and finishes their first lesson, you get {LEARN_EARN.invite.points} points and they get {LEARN_EARN.invited.points}.
            Invite 3 for the Ambassador badge.
          </p>
        </div>
      </div>
      {(data.joined > 0 || data.points > 0) && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            [String(data.joined), 'joined'],
            [String(data.learning), 'learning'],
            [`+${formatPoints(data.points)}`, 'points'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-2xl bg-white/[0.07] px-2 py-3">
              <p className="text-xl font-semibold tabular-nums">{value}</p>
              <p className="text-xs text-white/55">{label}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4">
        {url ? (
          <div className="space-y-2.5">
            <p className="truncate rounded-xl bg-white/[0.07] px-3 py-2.5 font-mono text-[13px] text-white/85">{url}</p>
            <ShareLinks url={url} text="I'm learning on Rehabify Learn: courses, clinical simulations and live Spaces for physios and physio students. Join free with my link:" />
          </div>
        ) : (
          <button type="button" onClick={() => void make()} disabled={busy} className={cn(pillLime, 'h-11 px-5')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Get my invite link
          </button>
        )}
      </div>
    </section>
  )
}
