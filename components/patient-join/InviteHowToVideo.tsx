'use client'

import { useEffect, useState } from 'react'
import { PlayCircle } from '@/components/icons'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MARKETING_VIDEOS } from '@/lib/marketingVideos'
import { cn } from '@/lib/utils'

const PHONE = '(max-width: 640px)'

/**
 * Played exactly as uploaded to Cloudinary (no f_auto/q_auto): the MP4s are already web-ready, and
 * re-encoding would spend the free plan's monthly credits. Posters are the title card of each cut,
 * served from the site.
 */
const FILMS = {
  landscape: { url: MARKETING_VIDEOS.patientInvites, poster: '/media/patient-invites-landscape.webp', length: '1:37' },
  vertical: { url: MARKETING_VIDEOS.patientInvitesVertical, poster: '/media/patient-invites-vertical.webp', length: '1:44' },
}

/**
 * "How inviting works": the 1½-minute film of adding a patient, sending their link on WhatsApp and
 * them joining with a PIN. Phones get the vertical cut, everything else the 16:9 one.
 */
export function InviteHowToVideo({ className, label = 'How inviting works' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const [vertical, setVertical] = useState(false)
  useEffect(() => setVertical(window.matchMedia(PHONE).matches), [])
  const film = vertical ? FILMS.vertical : FILMS.landscape

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setVertical(window.matchMedia(PHONE).matches)
          setOpen(true)
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-rh-ink underline-offset-4 transition hover:underline dark:text-white',
          className
        )}
      >
        <PlayCircle className="h-4 w-4 text-rh-lime-deep dark:text-rh-lime" />
        {label}
        <span className="font-normal text-neutral-500 dark:text-neutral-400">· {film.length}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'gap-3 overflow-hidden rounded-3xl border-0 bg-rh-ink p-3 text-white sm:p-4',
            vertical ? 'max-w-[min(92vw,420px)]' : 'max-w-[min(94vw,1100px)]'
          )}
        >
          <DialogHeader className="px-1 text-left">
            <DialogTitle className="text-base font-semibold text-white">Invite patients on WhatsApp</DialogTitle>
            <DialogDescription className="text-xs text-white/70">
              Add a patient, send their link from your own WhatsApp, and they join with a 4-digit PIN.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <video
              key={film.url}
              src={film.url}
              poster={film.poster}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className={cn('w-full rounded-2xl bg-black', vertical ? 'max-h-[78vh] object-contain' : 'aspect-video')}
              title="Invite patients on WhatsApp"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
