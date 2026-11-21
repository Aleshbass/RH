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
import { ArrowRight, Check, Crown, Loader2 } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { groupTone, joinableGroupsRef, joinGroupRef, type JoinableGroup } from '@/lib/learnAdminsApi'
import { displayFont, pillInk } from '../shared'
import { errorText, roomPath } from './socialApi'
import { Avatar, Skeleton } from './ui'
import { GroupAvatar } from './GroupAvatar'
import { LayoutSwitch, useCardLayout, usePhone, type CardLayout } from './CommunityCards'

// Grid · List · Scroll (owner, 21 Nov 2026: with many groups the cards stacked down the whole
// page on phones). The choice is shared with the community's other card lists (CommunityCards).
// Before the browser's choice is known: scroll on phones, grid above, in CSS alone.
const PICK_LIST: Record<CardLayout | 'auto', string> = {
  grid: 'grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3',
  list: 'grid gap-3 md:grid-cols-2',
  scroll:
    '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scroll-padding-inline:1rem] [scrollbar-width:none] sm:-mx-6 sm:px-6 sm:[scroll-padding-inline:1.5rem] [&::-webkit-scrollbar]:hidden',
  auto: '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scroll-padding-inline:1rem] [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden',
}
const PICK_ITEM: Record<CardLayout | 'auto', string> = {
  grid: 'min-w-0',
  list: 'min-w-0',
  scroll: 'w-[80vw] max-w-[300px] shrink-0 snap-start sm:w-[290px]',
  auto: 'w-[80vw] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none',
}

/** "Group 3" pill with the group's colour, used beside names in the community. */
export function GroupChip({ group, className }: { group: { name: string; color: string; imageUrl?: string | null; lead?: boolean } | null | undefined; className?: string }) {
  if (!group) return null
  const tone = groupTone(group.color)
  return (
    <span
      className={cn('inline-flex max-w-[11rem] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}
      style={{ background: tone.soft, color: tone.ink }}
      title={group.lead ? `${group.name} champion` : group.name}
    >
      {group.lead ? (
        <Crown className="h-3 w-3 shrink-0" />
      ) : group.imageUrl ? (
        <GroupAvatar group={group} size={14} rounded="full" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone.dot }} />
      )}
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

function GroupCard({
  group,
  busy,
  onJoin,
  index,
  compact,
  className,
  teamAdmin,
}: {
  group: JoinableGroup
  busy: boolean
  onJoin: () => void
  index: number
  /** Two to a row on a phone (Grid): smaller type and padding */
  compact?: boolean
  className?: string
  /** The Rehabify team: enters any group, full or not, keeping their others */
  teamAdmin?: boolean
}) {
  const reduce = useReducedMotion()
  const tone = groupTone(group.color)
  return (
    <motion.li
      layout
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex flex-col overflow-hidden border bg-white transition',
        compact ? 'rounded-[1.25rem] p-3.5' : 'rounded-[1.5rem] p-5',
        className,
        group.mine ? 'border-transparent' : 'border-rh-ink/[0.08]',
        group.full && !group.mine && 'opacity-60'
      )}
      style={group.mine ? { boxShadow: `0 0 0 2px ${tone.dot}` } : undefined}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: tone.dot }} />
      <div className="flex items-start gap-3">
        <GroupAvatar group={group} size={compact ? 34 : 44} rounded="2xl" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className={cn('truncate font-semibold text-rh-ink', compact ? 'text-[14px]' : 'text-[16px]')}>{group.name}</span>
            {group.mine && !compact && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.soft, color: tone.ink }}>
                <Check className="h-3 w-3" /> Your group
              </span>
            )}
          </p>
          {group.description && (
            <p className={cn('mt-0.5 line-clamp-2 text-rh-ink/60', compact ? 'text-[12px] leading-4' : 'text-sm leading-5')}>{group.description}</p>
          )}
        </div>
      </div>

      <div className={cn('flex items-center rounded-2xl bg-rh-cream/70', compact ? 'mt-3 gap-2 px-2.5 py-2' : 'mt-4 gap-2.5 px-3 py-2.5')}>
        {group.lead ? (
          <>
            <Avatar name={group.lead.name} imageUrl={group.lead.imageUrl} size={compact ? 24 : 30} />
            <span className="min-w-0 text-sm leading-tight">
              <span className="block truncate font-semibold text-rh-ink">{group.lead.name}</span>
              <span className="flex items-center gap-1 text-xs text-rh-ink/55">
                <Crown className="h-3 w-3" /> Group champion
              </span>
            </span>
          </>
        ) : (
          <span className={cn('text-rh-ink/55', compact ? 'text-xs' : 'text-sm')}>{compact ? 'Champion soon' : 'Champion to be announced'}</span>
        )}
      </div>

      <div className={compact ? 'mt-3' : 'mt-4'}>
        <Seats group={group} />
      </div>

      {/* Pinned to the bottom, so buttons line up across a row of cards */}
      <div className={cn('mt-auto', compact ? 'pt-3' : 'pt-5')}>
        {group.mine ? (
          <Link href={roomPath(`group-${group.id}`)} className={cn(pillInk, compact ? 'h-10 w-full text-[13px]' : 'h-11 w-full')}>
            {compact ? 'Open' : 'Open your group'} <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={busy || (group.full && !teamAdmin)}
            className={cn(pillInk, compact ? 'h-10 w-full text-[13px]' : 'h-11 w-full', 'disabled:opacity-60')}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {teamAdmin ? (compact ? 'Enter' : 'Enter group') : group.full ? 'Full' : compact ? 'Join' : 'Join this group'}
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
  const [layout, setLayout] = useCardLayout()
  const phone = usePhone()
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
    // The Rehabify team keep their other groups, so there's nothing to confirm
    if (!data.isLearnAdmin && data.myGroup && !window.confirm(`Move from ${data.myGroup.name} to ${group.name}?`)) return
    setBusy(group.id)
    try {
      const res = await join({ groupId: group.id })
      playSound('success')
      toast.success(res.moved ? `You've moved to ${group.name}` : data.isLearnAdmin ? `You're in ${group.name}` : `Welcome to ${group.name}`)
      onJoined?.(res.roomSlug)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Couldn’t join that group. Try another.'))
    } finally {
      setBusy(null)
    }
  }

  const open = data.groups.filter((g) => !g.full).length
  const switcher = data.groups.length > 1 ? <LayoutSwitch value={layout} onChange={setLayout} /> : null
  return (
    <section className={className} aria-labelledby={heading ? 'pick-group-heading' : undefined}>
      {heading ? (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
          <h2 id="pick-group-heading" className={cn('text-[26px] leading-tight tracking-tight text-rh-ink sm:text-[32px]', displayFont)}>
            {data.myGroup ? 'Your group' : 'Pick your group'}
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-rh-ink/60">
            {data.myGroup
              ? `You're in ${data.myGroup.name}. You can move while another group has room.`
              : 'Learn with a small group: your own room, a champion to guide you, and a group leaderboard. When a group is full, pick the next.'}
          </p>
          </div>
          {switcher}
        </div>
      ) : (
        switcher && <div className="mb-3 flex justify-end">{switcher}</div>
      )}
      {open === 0 && !data.myGroup && (
        <p className="mb-4 rounded-2xl bg-rh-cream px-4 py-3 text-sm text-rh-ink/70">Every group is full right now. A new one opens soon, so check back.</p>
      )}
      <ul aria-label="Groups" className={PICK_LIST[layout ?? 'auto']}>
        <AnimatePresence initial={false}>
          {data.groups.map((g, i) => (
            <GroupCard
              key={g.id}
              group={g}
              index={i}
              busy={busy === g.id}
              compact={layout === 'grid' && phone === true}
              teamAdmin={Boolean(data.isLearnAdmin)}
              className={PICK_ITEM[layout ?? 'auto']}
              onJoin={() => {
                if (data.leadsAGroup && !data.isLearnAdmin) {
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
