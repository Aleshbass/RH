'use client'

/** Points in the Learn header (signed-in members): live total, a "+N" lift when points land. */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Star } from '@/components/icons'
import { formatPoints, pointsApi, PROGRESS_PATH } from './pointsApi'

export function PointsPill() {
  const data = useQuery(pointsApi.myPoints, {})
  const reduce = useReducedMotion()
  const last = useRef<number | null>(null)
  const [gain, setGain] = useState<{ n: number; id: number } | null>(null)

  useEffect(() => {
    if (!data) return
    if (last.current !== null && data.total > last.current) setGain({ n: data.total - last.current, id: Date.now() })
    last.current = data.total
  }, [data])
  useEffect(() => {
    if (!gain) return
    const id = window.setTimeout(() => setGain(null), 2200)
    return () => window.clearTimeout(id)
  }, [gain])

  if (!data) return null
  return (
    <Link
      href={PROGRESS_PATH}
      aria-label={`${data.total} points: my progress`}
      className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-rh-ink/10 bg-white px-3 text-sm font-semibold tabular-nums text-rh-ink transition hover:border-rh-ink/25 active:scale-95"
    >
      <Star className="h-3.5 w-3.5 text-[#e0a400]" />
      <motion.span key={data.total} initial={reduce ? false : { y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }}>
        {formatPoints(data.total)}
      </motion.span>
      <AnimatePresence>
        {gain && (
          <motion.span
            key={gain.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -22 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute -top-1 right-1 rounded-full bg-rh-lime px-2 py-0.5 text-xs font-bold text-rh-ink shadow"
          >
            +{gain.n}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )
}
