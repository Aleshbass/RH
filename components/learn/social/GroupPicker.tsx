'use client'

/**
 * Pick your group (Mary 2026-11-17): shown after someone says who they are on Learn, and on the
 * Learn home until they're in one. Groups hold up to their capacity (40 by default); full groups
 * can't be picked, so people move on to the next. Each card shows the group's champion.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowRight, Check, Crown, Loader2, Users } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { groupTone, joinableGroupsRef, joinGroupRef, type JoinableGroup } from '@/lib/learnAdminsApi'
import { displayFont, pillInk } from '../shared'
import { errorText, roomPath } from './socialApi'
import { Avatar, Skeleton } from './ui'

/** "Group 3" pill with the group's colour, used beside names in the community. */
export function GroupChip({ group, className }: { group: { name: string; color: string; lead?: boolean } | null | undefined; className?: string }) {
  if (!group) return null
  const tone = groupTone(group.color)
  return (
    <span
      className={cn('inline-flex max-w-[11rem] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}
      style={{ background: tone.soft, color: tone.ink }}
      title={group.lead ? `${group.name} champion` : group.name}
    >
      {group.lead ? <Crown className="h-3 w-3 shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone.dot }} />}
      <span className="truncate">{group.name}</span>
    </span>
  )
}

function Seats({ group }: { group: JoinableGroup }) {
  const tone = groupTone(group.color)
  const pct = Math.min(100, Math.round((group.memberCount / Math.max(1, group.capacity)) * 100))
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-rh-ink/[0.07]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: tone.dot }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="mt-1.5 flex justify-between text-xs text-rh-ink/55">
        <span>
          {group.memberCount} of {group.capacity}
        </span>
        <span className={cn('font-semibold', group.full ? 'text-rh-ink/45' : 'text-rh-ink/70')}>
          {group.full ? 'Full' : `${group.placesLeft} ${group.placesLeft === 1 ? 'place' : 'places'} left`}
        </span>
      </p>
    </div>
  )
}

function GroupCard({ group, busy, onJoin, index }: { group: JoinableGroup; busy: boolean; onJoin: () => void; index: number }) {
  const reduce = useReducedMotion()
  const tone = groupTone(group.color)
  return (
    <motion.li
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[1.5rem] border bg-white p-5 transition',
        group.mine ? 'border-transparent' : 'border-rh-ink/[0.08]',
        group.full && !group.mine && 'opacity-60'
      )}
      style={group.mine ? { boxShadow: `0 0 0 2px ${tone.dot}` } : undefined}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: tone.dot }} />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: tone.soft, color: tone.ink }}>
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold text-rh-ink">{group.name}</span>
            {group.mine && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.soft, color: tone.ink }}>
                <Check className="h-3 w-3" /> Your group
              </span>
            )}
          </p>
          {group.description && <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-rh-ink/60">{group.description}</p>}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-rh-cream/70 px-3 py-2.5">
        {group.lead ? (
          <>
            <Avatar name={group.lead.name} imageUrl={group.lead.imageUrl} size={30} />
            <span className="min-w-0 text-sm leading-tight">
              <span className="block truncate font-semibold text-rh-ink">{group.lead.name}</span>
              <span className="flex items-center gap-1 text-xs text-rh-ink/55">
                <Crown className="h-3 w-3" /> Group champion
              </span>
            </span>
          </>
        ) : (
          <span className="text-sm text-rh-ink/55">Champion to be announced</span>
        )}
      </div>

      <div className="mt-4">
        <Seats group={group} />
      </div>

      <div className="mt-5">
        {group.mine ? (
          <Link href={roomPath(`group-${group.id}`)} className={cn(pillInk, 'h-11 w-full')}>
            Open your group <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button type="button" onClick={onJoin} disabled={busy || group.full} className={cn(pillInk, 'h-11 w-full disabled:opacity-60')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {group.full ? 'Full' : 'Join this group'}
          </button>
        )}
      </div>
    </motion.li>
  )
}

/**
 * The picker. `heading` false for places that bring their own title. After joining, the person
 * stays here (the card turns into "Your group") and `onJoined` runs.
 */
export function GroupPicker({ heading = true, onJoined, className }: { heading?: boolean; onJoined?: (roomSlug: string) => void; className?: string }) {
  const data = useQuery(joinableGroupsRef, {})
  const join = useMutation(joinGroupRef)
  const [busy, setBusy] = useState<string | null>(null)

  if (data === undefined) {
    return (
      <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-[1.5rem]" />
        ))}
      </div>
    )
  }
  if (!data.isMember || data.groups.length === 0) return null

  const pick = async (group: JoinableGroup) => {
    if (data.myGroup && !window.confirm(`Move from ${data.myGroup.name} to ${group.name}?`)) return
    setBusy(group.id)
    try {
      const res = await join({ groupId: group.id })
      playSound('success')
      toast.success(res.moved ? `You've moved to ${group.name}` : `Welcome to ${group.name}`)
      onJoined?.(res.roomSlug)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Couldn’t join that group. Try another.'))
    } finally {
      setBusy(null)
    }
  }

  const open = data.groups.filter((g) => !g.full).length
  return (
    <section className={className} aria-labelledby={heading ? 'pick-group-heading' : undefined}>
      {heading && (
        <div className="mb-5">
          <h2 id="pick-group-heading" className={cn('text-[26px] leading-tight tracking-tight text-rh-ink sm:text-[32px]', displayFont)}>
            {data.myGroup ? 'Your group' : 'Pick your group'}
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-rh-ink/60">
            {data.myGroup
              ? `You're in ${data.myGroup.name}. You can move while another group has room.`
              : 'Learn with a small group: your own room, a champion to guide you, and a group leaderboard. When a group is full, pick the next.'}
          </p>
        </div>
      )}
      {open === 0 && !data.myGroup && (
        <p className="mb-4 rounded-2xl bg-rh-cream px-4 py-3 text-sm text-rh-ink/70">Every group is full right now. A new one opens soon, so check back.</p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {data.groups.map((g, i) => (
            <GroupCard
              key={g.id}
              group={g}
              index={i}
              busy={busy === g.id}
              onJoin={() => {
                if (data.leadsAGroup) {
                  toast.message('You’re a group champion. Ask a Learn admin to move you.')
                  return
                }
                void pick(g)
              }}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

/** Whether the viewer still needs to pick (undefined while loading). */
export function useNeedsGroup(): boolean | undefined {
  const data = useQuery(joinableGroupsRef, {})
  if (data === undefined) return undefined
  return data.isMember && !data.myGroup && data.groups.length > 0
}
