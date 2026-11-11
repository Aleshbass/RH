'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Check, Copy, Loader2, QrCode as QrIcon, UserPlus, WhatsApp } from '@/components/icons'
import { QrCode } from '@/components/shared/QrCode'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { joinRefs, type InviteLink } from './refs'
import { inviteErrorText } from './useSendJoinLink'
import { getInviteLink, prefersQr, rememberQr } from './inviteLinkCache'

const secondary =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-pt-sunken px-4 text-sm font-semibold text-pt-ink transition hover:bg-pt-hover active:scale-[0.98] disabled:opacity-50'

/**
 * Step 2 of adding a patient (and "Send link" from a record): their personal link, sent from the
 * physio's own WhatsApp, or a QR code to scan when the patient is in the room. The tracker below
 * follows it live: sent, opened, joined.
 */
export function InviteStep({
  patientId,
  firstName,
  onDone,
  onAddAnother,
  afterJoin,
  reset = false,
}: {
  patientId: string
  firstName: string
  onDone: () => void
  onAddAnother?: () => void
  /** The next thing to do once they've joined, e.g. "Book first session" */
  afterJoin?: ReactNode
  /** A new sign-in link for someone who already joined (forgot PIN): no join tracker */
  reset?: boolean
}) {
  const createLink = useAction(joinRefs.createInviteLink)
  const markSent = useMutation(joinRefs.markInviteSent)
  const status = useQuery(joinRefs.getJoinStatus, { patientId })
  const [link, setLink] = useState<InviteLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(prefersQr)
  const [sentHere, setSentHere] = useState(false)
  const cheered = useRef(false)
  const sendRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    let active = true
    getInviteLink(createLink, patientId)
      .then((result) => active && setLink(result))
      .catch((e) => active && setError(inviteErrorText(e)))
    return () => {
      active = false
    }
  }, [createLink, patientId])

  // Keyboard: Enter sends on WhatsApp, Q shows the QR (when not typing in a field)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'Enter' && link?.ok && target?.tagName !== 'BUTTON' && target?.tagName !== 'A') {
        event.preventDefault()
        sendRef.current?.click()
      } else if ((event.key === 'q' || event.key === 'Q') && link?.ok && !event.metaKey && !event.ctrlKey) {
        setShowQr((on) => {
          rememberQr(!on)
          return !on
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [link])

  const joined = !reset && (status?.status === 'joined' || status?.status === 'programme_started')
  const opened = joined || Boolean(status?.openedAt)
  const sent = opened || sentHere || Boolean(status?.sentAt)

  useEffect(() => {
    if (joined && !cheered.current && (sentHere || showQr)) {
      cheered.current = true
      playSound('success')
    }
  }, [joined, sentHere, showQr])

  const markAsSent = () => {
    setSentHere(true)
    void markSent({ patientId }).catch(() => undefined)
  }

  const copy = async () => {
    if (!link?.ok) return
    try {
      await navigator.clipboard.writeText(link.message)
      setCopied(true)
      markAsSent()
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Couldn’t copy. Use Send on WhatsApp instead.')
    }
  }

  if (link && !link.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-pt-sunken p-4 text-sm text-pt-ink">
          {firstName} already has their own Rehabify login (email), so there’s nothing to send. They’ll see you in their app.
        </p>
        <button type="button" onClick={onDone} className="h-11 w-full rounded-xl bg-pt-ink text-sm font-semibold text-pt-surface">
          Done
        </button>
      </div>
    )
  }

  const steps = [
    { label: 'Link ready', done: Boolean(link?.ok) },
    { label: 'Sent', done: sent },
    { label: 'Opened', done: opened },
    { label: 'Joined', done: joined },
  ]

  return (
    <div className="space-y-4">
      {/* Live tracker */}
      <ol className={cn('grid grid-cols-4 gap-1.5', reset && 'hidden')} aria-label="Invitation progress">
        {steps.map((step, i) => (
          <li key={step.label} className="min-w-0">
            <div className={cn('h-1.5 rounded-full transition-colors duration-500', step.done ? 'bg-rh-lime' : 'bg-pt-line')} />
            <p className={cn('mt-1.5 flex items-center gap-1 truncate text-[11px] font-semibold', step.done ? 'text-pt-ink' : 'text-pt-faint')}>
              {step.done ? <Check className="h-3 w-3 shrink-0 text-rh-lime-deep" /> : <span className="tabular-nums">{i + 1}</span>}
              {step.label}
            </p>
          </li>
        ))}
      </ol>

      <AnimatePresence initial={false} mode="wait">
        {joined ? (
          <motion.div
            key="joined"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl bg-rh-honeydew p-4 text-rh-ink ring-1 ring-inset ring-rh-mint dark:bg-rh-lime/10 dark:text-white dark:ring-rh-lime/30"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                <Check className="h-3.5 w-3.5" />
              </span>
              {firstName} has joined
            </p>
            <p className="mt-1 text-xs text-pt-muted">They can see their exercises, appointments and your messages now.</p>
            {afterJoin && <div className="mt-3 flex flex-wrap gap-2">{afterJoin}</div>}
          </motion.div>
        ) : (
          <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="rounded-2xl bg-pt-sunken p-4">
              <p className="text-xs leading-relaxed text-pt-muted">
                {firstName} taps the link, chooses a 4-digit PIN and sees their care. No email or password.
              </p>
              <div className="mt-2.5 truncate rounded-xl bg-pt-surface px-3 py-2 text-sm text-pt-ink shadow-sm">
                {link?.ok ? link.url.replace(/^https?:\/\//, '') : error ? 'Link not ready' : <Loader2 className="h-4 w-4 animate-spin text-pt-faint" />}
              </div>
              {link?.ok && !link.hasPhone && (
                <p className="mt-2 text-xs text-pt-amber-fg">No phone number saved: WhatsApp will ask who to send it to.</p>
              )}
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </div>

            <a
              ref={sendRef}
              href={link?.ok ? link.whatsappUrl : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!link?.ok}
              onClick={() => {
                if (!link?.ok) return
                playSound('send')
                markAsSent()
              }}
              className={cn(
                'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rh-lime text-[15px] font-semibold text-rh-ink transition hover:bg-rh-lime-deep active:scale-[0.99]',
                !link?.ok && 'pointer-events-none opacity-50'
              )}
            >
              <WhatsApp className="h-5 w-5" />
              {sent ? 'Open WhatsApp again' : 'Send on WhatsApp'}
            </a>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!link?.ok} onClick={copy} className={secondary}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy message'}
              </button>
              <button
                type="button"
                disabled={!link?.ok}
                onClick={() =>
                  setShowQr((on) => {
                    rememberQr(!on)
                    return !on
                  })
                }
                aria-pressed={showQr} className={cn(secondary, showQr && 'bg-pt-ink text-pt-surface hover:bg-pt-ink')}>
                <QrIcon className="h-4 w-4" />
                {showQr ? 'Hide QR' : 'They’re here: QR'}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {showQr && link?.ok && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 ring-1 ring-inset ring-pt-line">
                    <QrCode value={link.url} size={200} label={`QR code for ${firstName}’s join link`} className="h-48 w-48" />
                    <p className="text-center text-xs text-neutral-600">
                      {firstName} points their phone camera at this, taps the link and joins right here. This page shows when they’re in.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cn('grid gap-2 pt-1', onAddAnother ? 'grid-cols-2' : 'grid-cols-1')}>
        {onAddAnother && (
          <button type="button" onClick={onAddAnother} className={secondary}>
            <UserPlus className="h-4 w-4" />
            Add another
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-pt-ink px-4 text-sm font-semibold text-pt-surface transition hover:opacity-90 active:scale-[0.98]"
        >
          {sent || joined ? 'Done' : 'Later'}
        </button>
      </div>
      {!sent && !joined && <p className="text-center text-xs text-pt-faint">You can send it any time from their record or your patient list.</p>}
    </div>
  )
}
