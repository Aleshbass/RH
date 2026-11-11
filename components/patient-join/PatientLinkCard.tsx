'use client'

import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { toast } from 'sonner'
import { Check, Copy, QrCode as QrIcon, UserPlus, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QrCode } from '@/components/shared/QrCode'
import { cardClass, IconChip, InfoTip } from '@/components/physio/ui'
import { publicAppUrl } from '@/lib/public-app-url'
import { cn } from '@/lib/utils'
import { InviteHowToVideo } from './InviteHowToVideo'

// By name: the generated `api` type is at TypeScript's depth limit
const ensureSlugRef = makeFunctionReference<'mutation', { userId: string }, string | null>('marketplace/search:ensureBookingSlug')

/**
 * The physio's own patient link, /join/<slug>: one link for every patient (WhatsApp status, a
 * QR code on the clinic wall). Patients type their name and phone, choose a PIN, and are on the
 * physio's list. Uses the same slug as the booking link.
 */
export function PatientLinkCard({ physioId, name }: { physioId: string; name?: string }) {
  const ensureSlug = useMutation(ensureSlugRef)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    let active = true
    const base = publicAppUrl().replace(/\/$/, '')
    // The slug never changes once set: ask the server once per browser session
    const cacheKey = `rehabify:booking-slug:${physioId}`
    let cached: string | null = null
    try {
      cached = sessionStorage.getItem(cacheKey)
    } catch {
      // Storage blocked: ask the server
    }
    if (cached) {
      setUrl(`${base}/join/${cached}`)
      return
    }
    ensureSlug({ userId: physioId })
      .then((slug) => {
        if (!slug) return
        try {
          sessionStorage.setItem(cacheKey, slug)
        } catch {
          // Fine: asked again next visit
        }
        if (active) setUrl(`${base}/join/${slug}`)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [physioId, ensureSlug])

  const message = `Join me${name ? ` (${name})` : ''} on Rehabify to see your exercises and appointments. It takes a minute and you don’t need an email: ${url ?? ''}`

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Couldn’t copy. Press and hold the link to copy it.')
    }
  }

  return (
    <section className={cn(cardClass, 'overflow-hidden p-5')}>
      <div className="flex items-center gap-3">
        <IconChip icon={UserPlus} tone="green" />
        <div className="min-w-0">
          <h2 className="flex items-center gap-1 text-[15px] font-semibold tracking-tight text-rh-ink dark:text-white">
            Your patient link
            <InfoTip>
              One link for all your patients. They open it, type their name and phone number, choose a 4-digit PIN and they’re on your
              list. No email needed. To add someone yourself, use Add patient.
            </InfoTip>
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">Patients join you with their phone number</p>
        </div>
      </div>
      <div className="mt-4 truncate rounded-xl bg-white px-3 py-2 text-sm text-neutral-700 shadow-sm dark:bg-rh-ink-2 dark:text-neutral-300">
        {url ? url.replace(/^https?:\/\//, '') : <Skeleton className="h-4 w-48" />}
      </div>
      {showQr && url && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-white p-4 dark:bg-white">
          <QrCode value={url} size={200} label="QR code for your patient link" className="h-48 w-48" />
          <p className="text-center text-xs text-neutral-600">Patients scan it with their phone camera. Print it for your clinic wall.</p>
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button onClick={copy} disabled={!url} className="rounded-xl bg-rh-lime text-rh-ink hover:bg-rh-lime-deep dark:bg-rh-lime dark:text-rh-ink">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button asChild variant="ghost" className={cn('rounded-xl bg-white text-rh-ink hover:bg-white/80 dark:bg-white/10 dark:text-white', !url && 'pointer-events-none opacity-50')}>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <WhatsApp className="mr-1.5 h-4 w-4" />
            Share
          </a>
        </Button>
        <Button
          variant="ghost"
          disabled={!url}
          onClick={() => setShowQr((on) => !on)}
          aria-pressed={showQr}
          className="rounded-xl bg-white text-rh-ink hover:bg-white/80 dark:bg-white/10 dark:text-white"
        >
          <QrIcon className="mr-1.5 h-4 w-4" />
          QR
        </Button>
      </div>
      <div className="mt-3 flex justify-center">
        <InviteHowToVideo />
      </div>
    </section>
  )
}
