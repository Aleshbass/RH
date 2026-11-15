'use client'

/**
 * "My progress" on Learn: points (total and this month, with your rank), your streak, the badge
 * collection (earned and still to earn), points per week for 12 weeks, best score per simulation
 * case, recent activity, and whether you show on the leaderboard.
 */

import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Flame, Star, TrendingUp, WhatsApp } from '@/components/icons'
import { cn } from '@/lib/utils'
import { displayFont, pillOutline } from '../shared'
import { Avatar, JoinPrompt, Skeleton } from '../social/ui'
import { relativeTime } from '../social/socialApi'
import { BadgeArt } from './BadgeArt'
import { formatPoints, LEADERBOARD_PATH, pointsApi, PROGRESS_PATH } from './pointsApi'

function Tile({ icon: Icon, label, value, sub, accent }: { icon: typeof Star; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-3xl border p-4 sm:p-5', accent ? 'border-transparent bg-rh-ink text-white' : 'border-rh-ink/[0.07] bg-white')}>
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em]', accent ? 'text-white/60' : 'text-rh-ink/50')}>
        <Icon className={cn('h-3.5 w-3.5', accent ? 'text-rh-lime' : '')} /> {label}
      </p>
      <p className={cn('mt-2 text-[28px] font-semibold leading-none tabular-nums', accent ? 'text-white' : 'text-rh-ink')}>{value}</p>
      {sub && <p className={cn('mt-1.5 text-xs', accent ? 'text-white/60' : 'text-rh-ink/55')}>{sub}</p>}
    </div>
  )
}

export function MyProgress() {
  const data = useQuery(pointsApi.myProgress, {})
  const setHidden = useMutation(pointsApi.setHidden)
  const reduce = useReducedMotion()

  if (data === undefined) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <Skeleton className="h-12 w-1/2" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-3xl" />
      </main>
    )
  }
  if (data.state === 'join') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>My progress</h1>
        <div className="mt-6">
          <JoinPrompt signedIn={data.signedIn} returnTo={PROGRESS_PATH} />
        </div>
      </main>
    )
  }

  const earned = data.badges.filter((b) => b.earnedAt)
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.points))
  const weekTotal = data.weeks.reduce((s, w) => s + w.points, 0)
  const toggle = async () => {
    try {
      const r = await setHidden({ hidden: !data.hidden })
      toast.success(r.hidden ? 'You’re hidden from the leaderboard.' : 'You’re on the leaderboard again.')
    } catch {
      toast.error('That didn’t save. Try again.')
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="flex items-center gap-4">
        <Avatar name={data.name} imageUrl={data.imageUrl} size={56} />
        <div className="min-w-0">
          <h1 className={cn('text-[32px] leading-tight tracking-tight text-rh-ink sm:text-[44px]', displayFont)}>My progress</h1>
          <p className="truncate text-sm text-rh-ink/55">{data.name}</p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile icon={Star} label="Points" value={formatPoints(data.total)} sub={`${earned.length} of ${data.badges.length} badges`} accent />
        <Tile
          icon={TrendingUp}
          label={data.monthLabel}
          value={formatPoints(data.monthPoints)}
          sub={data.hidden ? 'Hidden from the leaderboard' : !data.canRank ? 'The team doesn’t rank' : data.rank ? `#${data.rank} of ${data.ranked} this month` : 'Earn points to rank'}
        />
        <div className="col-span-2 sm:col-span-1">
          <Tile icon={Flame} label="Streak" value={`${data.streak} day${data.streak === 1 ? '' : 's'}`} sub={`Best: ${data.bestStreak} day${data.bestStreak === 1 ? '' : 's'} · learn something every day`} />
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-rh-ink">Badges</h2>
          <span className="text-sm text-rh-ink/50">
            {earned.length} / {data.badges.length}
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.badges.map((b, i) => {
            const got = Boolean(b.earnedAt)
            return (
              <motion.li
                key={b.id}
                initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.03 }}
                className={cn('flex flex-col items-center rounded-3xl border p-4 text-center', got ? 'border-rh-ink/[0.07] bg-white' : 'border-dashed border-rh-ink/15 bg-rh-cream/60')}
              >
                <BadgeArt id={b.id} earned={got} size={64} />
                <p className={cn('mt-3 text-sm font-semibold', got ? 'text-rh-ink' : 'text-rh-ink/55')}>{b.name}</p>
                <p className="mt-0.5 text-xs leading-5 text-rh-ink/50">
                  {got ? (b.detail ?? `Earned ${new Date(b.earnedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`) : b.how}
                </p>
                {got && (
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`I earned the “${b.name}” badge on Rehabify Learn. ${typeof window !== 'undefined' ? window.location.origin : ''}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rh-ink/55 transition hover:text-rh-ink"
                  >
                    <WhatsApp className="h-3 w-3" /> Share
                  </a>
                )}
              </motion.li>
            )
          })}
        </ul>
      </section>

      <section className="mt-8 rounded-3xl border border-rh-ink/[0.07] bg-white p-5">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-rh-ink">Points per week</h2>
          <span className="text-sm text-rh-ink/50">{formatPoints(weekTotal)} in 12 weeks</span>
        </div>
        <div className="mt-5 flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label="Points earned in each of the last 12 weeks">
          {data.weeks.map((w, i) => (
            <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <motion.div
                initial={reduce ? false : { height: 0 }}
                animate={{ height: `${Math.max(w.points ? 6 : 2, (w.points / maxWeek) * 100)}%` }}
                transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                className={cn('w-full rounded-t-lg', i === data.weeks.length - 1 ? 'bg-rh-lime' : w.points ? 'bg-rh-ink/80' : 'bg-rh-ink/10')}
                title={`${w.points} points`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-rh-ink/45">
          <span>12 weeks ago</span>
          <span>This week</span>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-rh-ink/[0.07] bg-white p-5">
          <h2 className="text-lg font-semibold text-rh-ink">Simulation cases</h2>
          {data.sims.length === 0 ? (
            <p className="mt-3 text-sm text-rh-ink/55">No cases finished yet. Each case you pass is worth 50 points.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {data.sims.map((s) => (
                <li key={s.slug}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-rh-ink">{s.title}</span>
                    <span className={cn('shrink-0 text-xs font-semibold', s.passed ? 'text-rh-success-ink' : 'text-rh-ink/50')}>
                      {s.passed ? 'Passed' : 'Not passed yet'} · best {s.score}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rh-ink/[0.08]">
                    <div className={cn('h-full rounded-full', s.passed ? 'bg-rh-lime' : 'bg-rh-ink/40')} style={{ width: `${Math.min(100, s.score)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-rh-ink/[0.07] bg-white p-5">
          <h2 className="text-lg font-semibold text-rh-ink">Recent activity</h2>
          {data.recent.length === 0 ? (
            <p className="mt-3 text-sm text-rh-ink/55">Your points will show here as you learn.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rh-ink/[0.06]">
              {data.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-rh-ink">{r.label}</span>
                    <span className="block text-xs text-rh-ink/45">{relativeTime(r.at)}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-rh-ink">+{r.points}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8 flex flex-col gap-4 rounded-3xl border border-rh-ink/[0.07] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-rh-ink">Show me on the leaderboard</p>
          <p className="mt-0.5 text-sm text-rh-ink/55">Your name, photo and points appear to other Learn members. You keep earning either way.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={!data.hidden}
            onClick={() => void toggle()}
            className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', data.hidden ? 'bg-rh-ink/20' : 'bg-rh-lime')}
          >
            <span className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform', data.hidden ? 'left-1' : 'left-1 translate-x-5')} />
            <span className="sr-only">Show me on the leaderboard</span>
          </button>
          <Link href={LEADERBOARD_PATH} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
            Leaderboard
          </Link>
        </div>
      </section>
    </main>
  )
}
