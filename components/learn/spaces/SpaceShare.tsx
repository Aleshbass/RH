'use client'

/**
 * Share a Space (owner 2026-11-15): WhatsApp, LinkedIn, copy and the phone's share menu. The link
 * shows a preview card ("Live now", the host, the time). Group-only Spaces aren't shared.
 */

import { useState } from 'react'
import { Share2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { learnShareUrl, ShareSheet } from '../shareKit'
import { spacePath } from '../social/socialApi'

type ShareableSpace = { id: string; title: string; status: string; group: unknown; host: { name: string } }

export function SpaceShareButton({ space, compact = false }: { space: ShareableSpace; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  if (space.group) return null
  const host = space.host.name.split(' ')[0] || 'a Rehabify physio'
  const text =
    space.status === 'live'
      ? `I’m listening live to “${space.title}” with ${host} on Rehabify Learn. Join in:`
      : `Join me for “${space.title}”, a live audio Space with ${host} on Rehabify Learn:`
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Share this Space"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <Share2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white/85 ring-1 ring-inset ring-white/20 transition hover:bg-white/10')}
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      )}
      <ShareSheet open={open} onClose={() => setOpen(false)} title="Share this Space" url={learnShareUrl(spacePath(space.id))} text={text} linkedin />
    </>
  )
}
