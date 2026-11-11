'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * A YouTube video that costs nothing until it is played: a poster and a play button first,
 * the real player (from youtube-nocookie.com) only after the click.
 */
export function YouTubeEmbed({ id, title }: { id: string; title?: string }) {
  const [playing, setPlaying] = useState(false)
  const label = title?.trim() || 'Video'
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-rh-ink">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play video: ${label}`} className="group absolute inset-0 h-full w-full">
          <Image
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 768px) 720px, 100vw"
            className="object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rh-lime text-rh-ink transition-transform group-hover:scale-105">
            <svg viewBox="0 0 24 24" aria-hidden className="ml-1 h-7 w-7 fill-current">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
