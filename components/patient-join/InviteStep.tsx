'use client'

import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
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
 * physio's own WhatsApp, or a QR code to scan when the patient is in the room. Whether they've
 * joined shows on the patient list (Invited / Joined).
 */
export function InviteStep({
  patientId,
  firstName,
  onDone,
  onAddAnother,
}: {
  patientId: string
  firstName: string
  onDone: () => void
  onAddAnother?: () => void
}) {
  const createLink = useAction(joinRefs.createInviteLink)
  const markSent = useMutation(joinRefs.markInviteSent)
  const [link, setLink] = useState<InviteLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(prefersQr)
  const [sent, setSent] = useState(false)
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

  const toggleQr = () =>
    setShowQr((on) => {
      rememberQr(!on)
      return !on
    })

  // Keyboard: Enter sends on WhatsApp, Q shows the QR (when not typing in a field)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'Enter' && link?.ok && target?.tagName !== 'BUTTON' && target?.tagName !== 'A') {
        event.preventDefault()
        sendRef.current?.click()
      } else if ((event.key === 'q' || event.key === 'Q') && link?.ok && !event.metaKey && !event.ctrlKey) {
        toggleQr()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [link])

  const markAsSent = () => {
    setSent(true)
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

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-pt-sunken p-4">
        <p className="text-xs leading-relaxed text-pt-muted">
          {firstName} taps the link, chooses a 4-digit PIN and sees their care. No email or password.
        </p>
        <div className="mt-2.5 truncate rounded-xl bg-pt-surface px-3 py-2 text-sm text-pt-ink shadow-sm">
          {link?.ok ? link.url.replace(/^https?:\/\//, '') : error ? 'Link not ready' : <Loader2 className="h-4 w-4 animate-spin text-pt-faint" />}
        </div>
        {link?.ok && !link.hasPhone && <p className="mt-2 text-xs text-pt-amber-fg">No phone number saved: WhatsApp will ask who to send it to.</p>}
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
          onClick={toggleQr}
          aria-pressed={showQr}
          className={cn(secondary, showQr && 'bg-pt-ink text-pt-surface hover:bg-pt-ink')}
        >
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
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 ring-1 ring-inset ring-pt-line">
              <QrCode value={link.url} size={200} label={`QR code for ${firstName}’s join link`} className="h-48 w-48" />
              <p className="text-center text-xs text-neutral-600">{firstName} points their phone camera at this, taps the link and joins right here.</p>
            </div>
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
          {sent ? 'Done' : 'Later'}
        </button>
      </div>
      {!sent && <p className="text-center text-xs text-pt-faint">You can send it any time from their record or your patient list.</p>}
    </div>
  )
}
