'use client'

/**
 * Learn leaderboard (live): this month or all time, everyone / students / physios. The top three
 * on a podium, then the list; your own place is always visible at the bottom. Prizes are never
 * mentioned (owner: agreed privately with winners, only if and when approved).
 */

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Crown, Star, TrendingUp, Users } from '@/components/icons'
import { groupStandingsRef, groupTone, type GroupStanding } from '@/lib/learnAdminsApi'
import { GroupAvatar } from '@/components/learn/social/GroupAvatar'
import { cn } from '@/lib/utils'
import { LEARN_EARN } from '@/lib/learn/points'
import { displayFont, pillInk } from '../shared'
import { Avatar, JoinPrompt, Skeleton } from '../social/ui'
import { formatPoints, LEADERBOARD_PATH, pointsApi, PROGRESS_PATH, type LeaderRow, type Period, type Scope } from './pointsApi'

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'students', label: 'Students' },
  { id: 'physios', label: 'Physios' },
]

const MEDAL = ['', 'bg-[#f5c542] text-[#3d2c00]', 'bg-[#d6dde3] text-[#29323a]', 'bg-[#e0a46b] text-[#3b2410]']

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="relative inline-flex rounded-full bg-rh-cream p-1" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('relative rounded-full px-4 py-2 text-sm font-semibold transition-colors', value === o.id ? 'text-rh-ink' : 'text-rh-ink/55 hover:text-rh-ink')}
        >
          {value === o.id && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative whitespace-nowrap">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

function Podium({ rows }: { rows: LeaderRow[] }) {
  const reduce = useReducedMotion()
  // 2nd, 1st, 3rd
  return (
    <div className="mt-8 grid grid-cols-3 items-end gap-2 sm:gap-4">
      {[rows[1], rows[0], rows[2]].map((r, i) => {
        if (!r) return <div key={i} />
        const first = r.rank === 1
        return (
          <motion.div
            key={`${r.rank}-${r.name}`}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: first ? 0.05 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex flex-col items-center rounded-3xl border bg-white px-2 pb-4 text-center',
              first ? 'border-rh-lime/60 pt-9 shadow-[0_18px_40px_-24px_rgba(10,20,18,0.45)]' : 'border-rh-ink/[0.07] pt-6',
              r.isMe && 'ring-2 ring-rh-lime'
            )}
          >
            {first && <Crown className="absolute -top-4 h-8 w-8 text-[#f5c542] drop-shadow" aria-hidden />}
            <div className="relative">
              <Avatar name={r.name} imageUrl={r.imageUrl} size={first ? 64 : 52} />
              <span className={cn('absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ring-2 ring-white', MEDAL[r.rank] ?? 'bg-rh-ink text-white')}>
                {r.rank}
              </span>
            </div>
            <p className="mt-3 line-clamp-2 break-words text-[13px] font-semibold leading-tight text-rh-ink sm:text-sm">{r.isMe ? 'You' : r.name}</p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-rh-ink/50">{r.tag.label}</p>
            <p className={cn('mt-2 font-semibold tabular-nums text-rh-ink', first ? 'text-lg' : 'text-base')}>{formatPoints(r.points)}</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-rh-ink/40">points</p>
          </motion.div>
        )
      })}
    </div>
  )
}

function HowToEarn() {
  const [open, setOpen] = useState(false)
  const rows = Object.values(LEARN_EARN).filter((r) => r.label !== LEARN_EARN.streak.label)
  return (
    <section className="mt-10 rounded-3xl border border-rh-ink/[0.07] bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2 font-semibold text-rh-ink">
          <Star className="h-4 w-4 text-rh-ink/60" /> How to earn points
        </span>
        <ChevronDown className={cn('h-4 w-4 text-rh-ink/50 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ul className="divide-y divide-rh-ink/[0.06] px-5 pb-4 text-sm">
              {rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-rh-ink/75">{r.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-rh-ink">+{r.points}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-rh-ink/75">Every 7 days of learning in a row</span>
                <span className="shrink-0 font-semibold tabular-nums text-rh-ink">+{LEARN_EARN.streak.points}</span>
              </li>
            </ul>
            <p className="px-5 pb-5 text-xs leading-5 text-rh-ink/50">Some actions have a daily limit. Points for helpful marks are taken back if the mark is removed.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Groups against each other (Mary 2026-11-17): every member's points added up. */
export function GroupStandings({ period, limit, compact = false }: { period: Period; limit?: number; compact?: boolean }) {
  const data = useQuery(groupStandingsRef, { period })
  const reduce = useReducedMotion()
  if (data === undefined) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={cn('rounded-2xl', compact ? 'h-14' : 'h-20')} />
        ))}
      </div>
    )
  }
  if (data.state !== 'ok') return null
  const rows: GroupStanding[] = limit ? data.rows.slice(0, limit) : data.rows
  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-rh-ink/15 bg-white px-6 py-10 text-center">
        <Users className="mx-auto h-6 w-6 text-rh-ink/40" />
        <p className="mt-3 font-semibold text-rh-ink">No groups yet</p>
      </div>
    )
  }
  const top = Math.max(1, ...rows.map((r) => r.points))
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => {
        const tone = groupTone(r.color)
        return (
          <motion.li
            key={r.id}
            layout
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className={cn('relative overflow-hidden rounded-2xl border bg-white', compact ? 'px-3.5 py-3' : 'px-4 py-3.5', r.isMine ? 'border-transparent' : 'border-rh-ink/[0.07]')}
            style={r.isMine ? { boxShadow: `0 0 0 2px ${tone.dot}` } : undefined}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn('flex shrink-0 items-center justify-center rounded-full text-xs font-bold', compact ? 'h-7 w-7' : 'h-8 w-8', MEDAL[r.rank] || 'bg-rh-cream text-rh-ink/70')}
              >
                {r.rank}
              </span>
              <GroupAvatar group={r} size={compact ? 32 : 40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-rh-ink">
                  {r.name}
                  {r.isMine && <span className="ml-1.5 text-xs font-medium text-rh-ink/50">your group</span>}
                </span>
                <span className="block truncate text-xs text-rh-ink/50">
                  {r.memberCount} {r.memberCount === 1 ? 'member' : 'members'} · {r.active} active
                  {!compact && r.leadName ? ` · champion ${r.leadName}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums text-rh-ink">{formatPoints(r.points)}</span>
                {!compact && <span className="block text-[11px] text-rh-ink/45">{formatPoints(r.perMember)} per member</span>}
              </span>
            </div>
            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-rh-ink/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: tone.dot }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.round((r.points / top) * 100)}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

export function Leaderboard() {
  const [view, setView] = useState<'people' | 'groups'>('people')
  const [period, setPeriod] = useState<Period>('month')
  const [scope, setScope] = useState<Scope>('all')
  const data = useQuery(pointsApi.leaderboard, { period, scope })

  if (data && data.state === 'join') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>Leaderboard</h1>
        <div className="mt-6">
          <JoinPrompt signedIn={data.signedIn} returnTo={LEADERBOARD_PATH} />
        </div>
      </main>
    )
  }

  const rows = data?.state === 'ok' ? data.rows : []
  const me = data?.state === 'ok' ? data.me : null
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-36 pt-8 sm:px-6 sm:pt-12">
      <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>Leaderboard</h1>
      <p className="mt-2 max-w-xl text-[15px] leading-6 text-rh-ink/60">
        Points for learning, practising cases and helping each other. {period === 'month' ? 'A fresh board every month.' : 'Everything you’ve earned so far.'}
      </p>
      <div className="mt-6">
        <Segmented
          label="view"
          value={view}
          onChange={setView}
          options={[
            { id: 'people', label: 'People' },
            { id: 'groups', label: 'Groups' },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="period"
          value={period}
          onChange={setPeriod}
          options={[
            { id: 'month', label: data?.state === 'ok' ? data.monthLabel : 'This month' },
            { id: 'all', label: 'All time' },
          ]}
        />
        {view === 'people' && <Segmented label="who" value={scope} onChange={setScope} options={SCOPES} />}
      </div>

      {view === 'groups' ? (
        <div className="mt-8">
          <GroupStandings period={period} />
        </div>
      ) : data === undefined ? (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-44 rounded-3xl" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-rh-ink/15 bg-white px-6 py-12 text-center">
          <TrendingUp className="mx-auto h-6 w-6 text-rh-ink/40" />
          <p className="mt-3 font-semibold text-rh-ink">{period === 'month' ? 'Nobody has points this month yet' : 'No points yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-rh-ink/55">Finish a lesson, pass a simulation case or help someone in the community to take the top spot.</p>
        </div>
      ) : (
        <>
          <Podium rows={rows.slice(0, 3)} />
          {rows.length > 3 && (
            <ol className="mt-6 space-y-2">
              <AnimatePresence initial={false}>
                {rows.slice(3).map((r) => (
                  <motion.li
                    key={`${r.name}-${r.rank}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border bg-white px-4 py-3',
                      r.isMe ? 'border-rh-lime ring-1 ring-rh-lime/60' : 'border-rh-ink/[0.07]'
                    )}
                  >
                    <span className="w-7 shrink-0 text-center text-sm font-semibold tabular-nums text-rh-ink/55">{r.rank}</span>
                    <Avatar name={r.name} imageUrl={r.imageUrl} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-rh-ink">{r.isMe ? `${r.name} (you)` : r.name}</span>
                      <span className="block truncate text-xs text-rh-ink/50">{r.tag.label}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-rh-ink">{formatPoints(r.points)}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </>
      )}

      <HowToEarn />

      {me && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rh-ink/[0.07] bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <Avatar name={me.name} imageUrl={me.imageUrl} size={36} />
            <p className="min-w-0 flex-1 text-sm leading-5 text-rh-ink">
              {me.hidden ? (
                <>You’re hidden from the leaderboard.</>
              ) : !me.ranks ? (
                <>
                  <span className="font-semibold">{formatPoints(me.points)} points</span>
                  <span className="text-rh-ink/55">
                    {me.team ? ' · admins and the Rehabify team don’t rank, so prizes go to learners' : ' · you’re not in this group. Switch to Everyone to see your rank'}
                  </span>
                </>
              ) : me.rank ? (
                <>
                  <span className="font-semibold">You’re #{me.rank}</span>
                  <span className="text-rh-ink/55">
                    {' '}
                    · {formatPoints(me.points)} points{period === 'month' ? ' this month' : ''}
                  </span>
                </>
              ) : (
                <span className="text-rh-ink/60">Earn your first points to join the board.</span>
              )}
            </p>
            <Link href={PROGRESS_PATH} className={cn(pillInk, 'h-10 shrink-0 px-4 text-sm')}>
              My progress
            </Link>
          </div>
        </div>
      )}
    </main>
  )
}
