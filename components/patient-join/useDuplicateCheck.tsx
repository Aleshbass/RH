'use client'

import { useEffect, useState } from 'react'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Users } from '@/components/icons'
import { joinRefs } from './refs'
import { JOIN_STATUS_LABELS } from './JoinStatusChip'

/** "08031234567" or "+2348031234567" → "0803 123 4567"; anything else as typed. */
export function formatLocalPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const local = digits.startsWith('234') && digits.length === 13 ? `0${digits.slice(3)}` : digits
  if (/^0[789]\d{9}$/.test(local)) return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  return value.trim()
}

/**
 * While a WhatsApp number is typed in Add patient: is this already one of my patients? Waits for
 * a full number and a short pause, then asks (only patients this person can already see).
 */
export function useDuplicateCheck(phone: string) {
  const [settled, setSettled] = useState('')
  useEffect(() => {
    const digits = phone.replace(/\D/g, '')
    const timer = window.setTimeout(() => setSettled(digits.length >= 10 ? phone : ''), 350)
    return () => window.clearTimeout(timer)
  }, [phone])
  const found = useQuery(joinRefs.findInMyCareByPhone, settled ? { phone: settled } : 'skip')
  return settled && found ? found : null
}

type Duplicate = NonNullable<ReturnType<typeof useDuplicateCheck>>

/** "Amaka Okoro is already on your list" with one tap to their link instead of a second record. */
export function DuplicateHint({ duplicate, onUse, actionLabel = 'Send their link' }: { duplicate: Duplicate | null; onUse: () => void; actionLabel?: string }) {
  return (
    <AnimatePresence initial={false}>
      {duplicate && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-amber-50 px-3.5 py-3 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
            <Users className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{duplicate.name} is already on your list</p>
              <p className="text-xs opacity-80">
                {duplicate.patientNumber ? `${duplicate.patientNumber} · ` : ''}
                {JOIN_STATUS_LABELS[duplicate.join.status]}
              </p>
            </div>
            <button
              type="button"
              onClick={onUse}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 transition hover:opacity-90 active:scale-[0.97] dark:bg-amber-200 dark:text-amber-950"
            >
              {actionLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
