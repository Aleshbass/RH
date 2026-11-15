'use client'

/**
 * "Badge unlocked": when a signed-in learner earns a badge anywhere on Learn, the medallion springs
 * in over turning light rays, with confetti, the success sound and a share button. Badges they
 * already had when this device first saw them are never celebrated (remembered per browser).
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { WhatsApp, X } from '@/components/icons'
import { playSoundFile } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { LEARN_BADGES } from '@/lib/learn/points'
import { celebrate } from '../course/shared'
import { pillLime, pillOutline } from '../shared'
import { BadgeArt } from './BadgeArt'
import { pointsApi, PROGRESS_PATH } from './pointsApi'

const SEEN_KEY = 'rh_learn_badges_seen'

const readSeen = (): Set<string> | null => {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}
const writeSeen = (ids: Iterable<string>) => {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]))
  } catch {
    // Private mode: celebrations may repeat, nothing breaks
  }
}

export function BadgeUnlock() {
  const badges = useQuery(pointsApi.myBadges, {})
  const reduce = useReducedMotion()
  const [queue, setQueue] = useState<{ id: string; detail: string | null }[]>([])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!badges) return
    const seen = readSeen()
    if (!seen) {
      // First time on this device: everything so far counts as seen
      writeSeen(badges.map((b) => b.id))
      return
    }
    const fresh = badges.filter((b) => !seen.has(b.id))
    if (!fresh.length) return
    fresh.forEach((b) => seen.add(b.id))
    writeSeen(seen)
    setQueue((q) => [...q, ...fresh.map((b) => ({ id: b.id, detail: b.detail }))])
  }, [badges])

  const current = queue[0]
  useEffect(() => {
    if (!current) return
    playSoundFile('certificate')
    celebrate()
  }, [current])

  if (!mounted) return null
  const meta = current ? LEARN_BADGES.find((b) => b.id === current.id) : null
  const close = () => setQueue((q) => q.slice(1))
  const share = meta
    ? `https://wa.me/?text=${encodeURIComponent(`I just earned the “${meta.name}” badge on Rehabify Learn. ${typeof window !== 'undefined' ? window.location.origin : ''}`)}`
    : '#'

  return createPortal(
    <AnimatePresence>
      {current && meta && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[rgb(3_8_7/0.6)] px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`Badge unlocked: ${meta.name}`}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="learn-fixed-dark relative w-full max-w-sm overflow-hidden rounded-[32px] bg-[rgb(11_19_18)] px-6 pb-6 pt-8 text-center text-white shadow-2xl"
          >
            <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
            <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
              {!reduce && (
                <motion.div
                  className="absolute inset-0 rounded-full opacity-60"
                  style={{ background: 'repeating-conic-gradient(from 0deg, rgba(0,205,15,0.35) 0deg 10deg, transparent 10deg 30deg)', maskImage: 'radial-gradient(circle, black 30%, transparent 70%)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
                />
              )}
              <motion.div initial={reduce ? false : { scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.1 }}>
                <BadgeArt id={current.id} earned size={128} />
              </motion.div>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-rh-lime">Badge unlocked</p>
            <p className="mt-2 text-2xl font-semibold">{meta.name}</p>
            <p className="mt-1.5 text-sm text-white/65">{current.detail ?? meta.how}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Link href={PROGRESS_PATH} onClick={close} className={cn(pillLime, 'h-11 flex-1 px-5')}>
                See my badges
              </Link>
              <a href={share} target="_blank" rel="noopener noreferrer" className={cn(pillOutline, 'h-11 flex-1 border-white/20 bg-transparent px-5 text-white hover:border-white/40')}>
                <WhatsApp className="h-4 w-4" /> Share
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
