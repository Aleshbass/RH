'use client'

/**
 * Sharing from Rehabify Learn (owner 2026-11-15): one sheet for badges, posts, Spaces and invites.
 * WhatsApp, LinkedIn, copy link and the phone's own share menu; optionally a story image
 * (1080 × 1920) to share or save for Status and Instagram.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Download, Linkedin, Loader2, Share2, WhatsApp } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { pillInk, pillOutline } from './shared'
import { Sheet } from './social/ui'

/** A full address for a Learn path (the Learn host once it has its own). */
export function learnShareUrl(path: string) {
  if (/^https?:/.test(path)) return path
  const base = process.env.NEXT_PUBLIC_LEARN_URL?.replace(/\/+$/, '')
  if (base) return `${base}${path}`
  return typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
}

export function ShareLinks({ url, text, linkedin = false, onShared }: { url: string; text: string; linkedin?: boolean; onShared?: (via: string) => void }) {
  const [copied, setCopied] = useState(false)
  const [canNative, setCanNative] = useState(false)
  useEffect(() => setCanNative(typeof navigator.share === 'function'), [])
  const button = cn(pillOutline, 'h-11 flex-1 px-3 text-sm')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      playSound('success')
      onShared?.('copy')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Couldn’t copy. Press and hold the link instead.')
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          playSound('share')
          onShared?.('whatsapp')
        }}
        className={button}
      >
        <WhatsApp className="h-4 w-4" /> WhatsApp
      </a>
      {linkedin && (
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onShared?.('linkedin')}
          className={button}
        >
          <Linkedin className="h-4 w-4" /> LinkedIn
        </a>
      )}
      <button type="button" onClick={() => void copy()} className={button}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
      </button>
      {canNative && (
        <button
          type="button"
          onClick={() => {
            navigator
              .share({ title: 'Rehabify Learn', text, url })
              .then(() => onShared?.('native'))
              .catch(() => undefined)
          }}
          aria-label="More ways to share"
          className={cn(pillOutline, 'h-11 w-11 shrink-0 px-0')}
        >
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** The share sheet: an optional story image, then the links. */
export function ShareSheet({
  open,
  onClose,
  title,
  url,
  text,
  linkedin = false,
  story,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  url: string
  text: string
  linkedin?: boolean
  story?: { make: () => Promise<Blob>; fileName: string }
  children?: React.ReactNode
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string; name: string } | null>(null)
  const [making, setMaking] = useState(false)
  // Parents pass a new story object on every render: make the picture once per file
  const storyRef = useRef(story)
  storyRef.current = story
  const fileName = story?.fileName ?? null

  useEffect(() => {
    const s = storyRef.current
    if (!open || !s || image?.name === s.fileName) return
    let live = true
    setMaking(true)
    s
      .make()
      .then((blob) => {
        if (live) setImage({ blob, url: URL.createObjectURL(blob), name: s.fileName })
      })
      .catch(() => toast.error('Couldn’t make the image.'))
      .finally(() => live && setMaking(false))
    return () => {
      live = false
    }
  }, [open, fileName, image])
  useEffect(() => {
    if (!image) return
    return () => URL.revokeObjectURL(image.url)
  }, [image])

  const shown = image && image.name === fileName ? image : null
  const file = shown && story ? new File([shown.blob], story.fileName, { type: 'image/png' }) : null
  const canShareFile = Boolean(file && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }))
  const shareImage = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], text: `${text} ${url}` })
    } catch {
      // closed the share menu
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {children}
        {story && (
          <div className="flex gap-4 rounded-2xl bg-rh-cream p-3">
            <div className="relative aspect-[9/16] w-[38%] max-w-[180px] shrink-0 overflow-hidden rounded-xl bg-rh-ink">
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element -- a picture made on this device (blob URL)
                <img src={shown.url} alt="Story image preview" className="h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-white/50">{making && <Loader2 className="h-6 w-6 animate-spin" />}</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
              <p className="text-sm font-semibold text-rh-ink">Story image</p>
              <p className="text-xs leading-5 text-rh-ink/55">For WhatsApp Status and Instagram Stories.</p>
              {canShareFile && (
                <button type="button" onClick={() => void shareImage()} disabled={!shown} className={cn(pillInk, 'h-10 w-full px-3 text-sm')}>
                  <Share2 className="h-4 w-4" /> Share image
                </button>
              )}
              <a
                href={shown?.url}
                download={story.fileName}
                aria-disabled={!shown}
                className={cn(canShareFile ? pillOutline : pillInk, 'h-10 w-full px-3 text-sm', !shown && 'pointer-events-none opacity-50')}
              >
                <Download className="h-4 w-4" /> Save image
              </a>
            </div>
          </div>
        )}
        <ShareLinks url={url} text={text} linkedin={linkedin} />
      </div>
    </Sheet>
  )
}
