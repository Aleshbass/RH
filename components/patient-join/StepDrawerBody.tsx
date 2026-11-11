'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check } from '@/components/icons'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

/** "1 Details · 2 Send link" at the top of the Add patient drawer. */
export function StepDots({ step }: { step: 1 | 2 }) {
  const items = ['Details', 'Send link']
  return (
    <ol className="mb-4 flex items-center gap-2 text-xs font-semibold" aria-label={`Step ${step} of 2`}>
      {items.map((label, i) => {
        const n = (i + 1) as 1 | 2
        const done = n < step
        const current = n === step
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className={cn('h-px w-6 transition-colors duration-300', step > 1 ? 'bg-rh-lime' : 'bg-pt-line')} aria-hidden />}
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition-colors duration-300',
                done ? 'bg-rh-lime text-rh-ink' : current ? 'bg-pt-ink text-pt-surface' : 'bg-pt-sunken text-pt-faint'
              )}
            >
              {done ? <Check className="h-3 w-3" /> : n}
            </span>
            <span className={current || done ? 'text-pt-ink' : 'text-pt-faint'}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Slides between the steps: forward moves left, back moves right. Short, so it feels instant. */
export function StepSlide({ stepKey, direction, children }: { stepKey: string; direction: 1 | -1; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 28 * direction }}
        animate={{ opacity: 1, x: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -28 * direction }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
