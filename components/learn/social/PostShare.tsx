'use client'

/**
 * Share a community post (owner 2026-11-15). Only posts in open rooms: course, programme and group
 * rooms stay private. The link shows a preview card (title, room, first name); reading it needs
 * Learn, which is free.
 */

import { useState } from 'react'
import { Share2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { pillOutline } from '../shared'
import { learnShareUrl, ShareSheet } from '../shareKit'
import { postPath } from './socialApi'

export function PostShareButton({ postId, title }: { postId: string; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(pillOutline, 'h-10 px-4 text-sm')}>
        <Share2 className="h-4 w-4" /> Share
      </button>
      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Share this post"
        url={learnShareUrl(postPath(postId))}
        text={`“${title}”, on the Rehabify Learn community. Join the conversation:`}
        linkedin
      />
    </>
  )
}
