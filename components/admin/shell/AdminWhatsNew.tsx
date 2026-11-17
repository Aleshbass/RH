'use client'

/**
 * "What's new" for admins (owner 17 Nov 2026): shown once per admin after a release, with what
 * each new feature needs from them and a button to the page. Learn super admins see only Learn.
 * A new release = a new KEY.
 */

import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Building2, Crown, GraduationCap, Mail, MapPinned, ShieldCheck, Users, X } from '@/components/icons'
import type { ConsoleRole } from './adminNav'

const KEY = 'admin:whats-new-2026-11-17'
const seenRef = makeFunctionReference<'query', { key: string }, boolean>('featureIntros:hasSeen')
const markRef = makeFunctionReference<'mutation', { key: string }, null>('featureIntros:markSeen')

type Item = { icon: typeof Crown; title: string; body: string; href: string; cta: string }

const ADMIN_ITEMS: Item[] = [
  {
    icon: Crown,
    title: 'Physio plans: Free and Individual Pro',
    body: 'Check the prices and dates, give free Pro where agreed, and tick “Show physios the plans pop-up” when you want physios to see the founding offer.',
    href: '/dashboard/admin/physio-plans',
    cta: 'Open Physio plans',
  },
  {
    icon: Building2,
    title: 'Clinics choose a plan and save a card',
    body: 'Plans chosen in November are first charged on 1 December. Send clinics the plan email; it can greet each clinic by name.',
    href: '/dashboard/admin/emails',
    cta: 'Write the clinic email',
  },
  {
    icon: MapPinned,
    title: 'Clinic outreach from hello@',
    body: 'Find clinics by city, write your 3 emails, send yourself a test, add clinics, then press Start sending after 7–14 days of warm-up.',
    href: '/dashboard/admin/outreach',
    cta: 'Open Clinic outreach',
  },
  {
    icon: Users,
    title: 'Learn groups, before sharing the link',
    body: 'People pick a group when they join Learn (40 per group). Create the groups and make one champion in each.',
    href: '/dashboard/admin/learn/groups',
    cta: 'Set up groups',
  },
  {
    icon: ShieldCheck,
    title: 'Learn super admins',
    body: 'Super admins now run groups, the community, Spaces and the leaderboard only. Courses and certificates stay with admins. Add them by email.',
    href: '/dashboard/admin/team-access',
    cta: 'Add super admins',
  },
]

const LEARN_ITEMS: Item[] = [
  {
    icon: Users,
    title: 'Groups and champions',
    body: 'People pick a group when they join Learn (40 per group by default). Create the groups, set their size, and make one champion in each before the link is shared.',
    href: '/dashboard/admin/learn/groups',
    cta: 'Set up groups',
  },
  {
    icon: GraduationCap,
    title: 'A community-first Learn',
    body: 'The Learn home now leads with the community. Posts show each person’s group, @mentions notify people, and loves earn points. Champions can hide or delete posts in their group.',
    href: '/dashboard/admin/learn/leaderboard',
    cta: 'See the leaderboard',
  },
  {
    icon: Mail,
    title: 'What you look after',
    body: 'As a Learn super admin you run groups, posts, Spaces, simulations and the leaderboard. Courses and certificates are handled by the Rehabify team.',
    href: '/dashboard/admin/learn/groups',
    cta: 'Got it',
  },
]

export function AdminWhatsNew({ role }: { role: ConsoleRole }) {
  const seen = useQuery(seenRef, { key: KEY })
  const mark = useMutation(markRef)
  const reduce = useReducedMotion()
  const items = role === 'admin' ? ADMIN_ITEMS : role === 'learn_admin' ? LEARN_ITEMS : []
  const open = seen === false && items.length > 0
  const close = () => void mark({ key: KEY })
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center p-3 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <button type="button" aria-label="Close" className="absolute inset-0 bg-[rgb(3_8_7/0.55)] backdrop-blur-[2px]" onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            className="relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl dark:bg-rh-ink-2"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-black/[0.06] px-6 pb-4 pt-6 dark:border-white/[0.08]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">What&apos;s new</p>
                <h2 id="whats-new-title" className="mt-1 text-2xl font-semibold tracking-tight text-rh-ink dark:text-white">
                  {role === 'admin' ? 'What needs you this week' : 'Learn has changed'}
                </h2>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/[0.05] dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="flex-1 space-y-2.5 overflow-y-auto px-6 py-5">
              {items.map((item, i) => (
                <motion.li
                  key={item.title}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.08 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="flex gap-4 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.04]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-ink text-rh-lime">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-rh-ink dark:text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{item.body}</p>
                    <Link href={item.href} onClick={close} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink hover:underline dark:text-white">
                      {item.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </motion.li>
              ))}
            </ol>
            <div className="flex justify-end border-t border-black/[0.06] px-6 py-4 dark:border-white/[0.08]">
              <button type="button" onClick={close} className="inline-flex h-11 items-center justify-center rounded-full bg-rh-lime px-6 text-sm font-semibold text-rh-ink transition hover:brightness-95">
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
