'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import type { OwnMediaLinks, RequestMediaLinks } from './ownMedia'

/**
 * A physio's own video, or their photos as a swipeable set, for one exercise. Links are signed
 * and short-lived, so they're fetched when the exercise is shown.
 */
export function OwnMediaView({
  exerciseId,
  name,
  requestLinks,
  className,
}: {
  exerciseId: Id<'exercises'>
  name: string
  requestLinks: RequestMediaLinks
  className?: string
}) {
  const [links, setLinks] = useState<OwnMediaLinks | null>(null)
  const [failed, setFailed] = useState(false)
  const [index, setIndex] = useState(0)
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    setLinks(null)
    setFailed(false)
    setIndex(0)
    requestLinks(exerciseId)
      .then((result) => {
        if (!live) return
        if (result && (result.video || result.photos.length)) setLinks(result)
        else setFailed(true)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [exerciseId, requestLinks])

  const frame = cn('relative aspect-video w-full overflow-hidden rounded-3xl bg-pt-sunken', className)

  if (failed) {
    return <div className={cn(frame, 'flex items-center justify-center px-6 text-center text-sm text-pt-muted')}>The demonstration isn’t available right now. Follow the steps below.</div>
  }
  if (!links) return <div className={cn(frame, 'animate-pulse')} aria-label="Loading the demonstration" />

  if (links.video) {
    return (
      <video
        src={links.video}
        poster={links.poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className={cn('aspect-video w-full rounded-3xl bg-black object-contain', className)}
      >
        <track kind="captions" />
      </video>
    )
  }

  const photos = links.photos
  const go = (next: number) => {
    const el = strip.current
    if (!el) return
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className={cn('relative', className)}>
      <div
        ref={strip}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl bg-pt-sunken [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={`${name}: ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
      >
        {photos.map((src, i) => (
          <div key={src} className="relative aspect-[4/3] w-full shrink-0 snap-center">
            <Image src={src} alt={`${name}, step ${i + 1}`} fill unoptimized sizes="(max-width: 1024px) 100vw, 800px" className="object-contain" />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
            {photos.map((src, i) => (
              <span key={src} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-pt-ink' : 'w-1.5 bg-pt-line-strong')} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label="Previous photo"
            className="absolute left-3 top-[calc(50%-1rem)] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-rh-ink shadow-sm transition disabled:opacity-0 sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(Math.min(photos.length - 1, index + 1))}
            disabled={index === photos.length - 1}
            aria-label="Next photo"
            className="absolute right-3 top-[calc(50%-1rem)] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-rh-ink shadow-sm transition disabled:opacity-0 sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
