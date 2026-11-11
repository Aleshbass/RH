'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UserPlus, WhatsApp, X } from '@/components/icons'
import AddPatientModal from '@/components/dashboard/physiotherapist/AddPatientModal'
import { InviteHowToVideo } from './InviteHowToVideo'

const KEY = 'rh_news_whatsapp_invites_v1'

/**
 * One-time "New" card on the physio home: patients now join from a WhatsApp link with a PIN, no
 * email. Shows to every physio (new and returning) until they add a patient from it or close it.
 */
export function InviteNewsCard() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== 'done')
    } catch {
      setShow(false)
    }
  }, [])

  // Used it: don't show again, but stay on screen so the Add patient drawer isn't closed mid-way
  const markSeen = () => {
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      // Shows again next visit: fine
    }
  }
  const dismiss = () => {
    setShow(false)
    markSeen()
  }

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl bg-rh-ink p-5 text-white sm:p-6"
          aria-label="New: invite patients on WhatsApp"
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
              <WhatsApp className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1 pr-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rh-lime">New</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Invite patients on WhatsApp</h2>
              <p className="mt-1 text-sm text-white/75">
                No email needed. Add a patient, tap Send on WhatsApp, and they join with a 4-digit PIN. You can see who has joined.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AddPatientModal
                onSuccess={markSeen}
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-rh-lime px-4 text-sm font-semibold text-rh-ink transition hover:bg-rh-lime-deep active:scale-[0.98]"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add a patient
                  </button>
                }
              />
              <InviteHowToVideo label="Watch" className="text-white dark:text-white [&_span]:text-white/60" />
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
