'use client'

import { useEffect, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { joinRefs, type InviteLink } from './refs'
import { inviteErrorText } from './useSendJoinLink'

/**
 * Shown right after "Add patient": the patient's personal link with a big "Send on WhatsApp"
 * button. The link is made when this opens, so the button is a plain link (no popup blocking).
 */
export function InvitePanel({
  patientId,
  firstName,
  onDone,
  doneLabel = 'Done',
}: {
  patientId: string
  firstName: string
  onDone: () => void
  doneLabel?: string
}) {
  const createLink = useAction(joinRefs.createInviteLink)
  const markSent = useMutation(joinRefs.markInviteSent)
  const [link, setLink] = useState<InviteLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let active = true
    createLink({ patientId })
      .then((result) => active && setLink(result))
      .catch((e) => active && setError(inviteErrorText(e)))
    return () => {
      active = false
    }
  }, [createLink, patientId])

  const copy = async () => {
    if (!link?.ok) return
    try {
      await navigator.clipboard.writeText(link.message)
      setCopied(true)
      void markSent({ patientId }).catch(() => undefined)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Couldn’t copy. Use Send on WhatsApp instead.')
    }
  }

  if (link && !link.ok) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {firstName} already has their own Rehabify login, so there’s nothing to send. They’ll see you in their app.
        </p>
        <Button onClick={onDone} className="h-11 w-full rounded-xl bg-rh-ink text-white hover:bg-rh-ink/90 dark:bg-white dark:text-rh-ink">
          {doneLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.04]">
        <p className="text-sm font-semibold text-rh-ink dark:text-white">Send {firstName} their link</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          It opens your WhatsApp with a ready message. {firstName} taps the link, chooses a 4-digit PIN and sees their exercises and
          appointments. No email or password needed.
        </p>
        <div className="mt-3 truncate rounded-xl bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm dark:bg-rh-ink-2 dark:text-neutral-300">
          {link?.ok ? link.url.replace(/^https?:\/\//, '') : error ? 'Link not ready' : <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
        </div>
        {link?.ok && !link.hasPhone && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No phone number saved: WhatsApp will ask who to send it to.</p>
        )}
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <a
        href={link?.ok ? link.whatsappUrl : undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!link?.ok}
        onClick={() => {
          if (!link?.ok) return
          setSent(true)
          playSound('send')
          void markSent({ patientId }).catch(() => undefined)
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
        <Button type="button" variant="ghost" disabled={!link?.ok} onClick={copy} className="h-11 rounded-xl bg-rh-canvas text-rh-ink hover:bg-rh-canvas/80 dark:bg-white/10 dark:text-white">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy message'}
        </Button>
        <Button type="button" onClick={onDone} className="h-11 rounded-xl bg-rh-ink text-white hover:bg-rh-ink/90 dark:bg-white dark:text-rh-ink">
          {sent ? doneLabel : 'Later'}
        </Button>
      </div>
      {!sent && (
        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          You can send it any time from their record or your patient list.
        </p>
      )}
    </div>
  )
}
