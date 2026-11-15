'use client'

/**
 * Sharing a scored run (owner 2026-11-14: "share their simulations to social media and it displays
 * what they did and the sounds"): a link to a public replay page with a preview card, plus a
 * vertical video made on the replay page. The expert answers and the marking stay private.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Share2, Video, WhatsApp } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { pillInk, pillOutline } from '../../shared'
import { errorText, replayPath, replayUrl, simApi, simTrack } from '../simApi'

/** WhatsApp, copy link and the phone's own share sheet, for a replay link. */
export function ShareRow({ url, text, slug, dark = false }: { url: string; text: string; slug: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false)
  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const button = dark
    ? 'flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/15'
    : cn(pillOutline, 'h-11 flex-1 px-3 text-sm')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      playSound('success')
      simTrack('sim_share', { case: slug, via: 'copy' })
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Couldn’t copy. Press and hold the link instead.')
    }
  }
  const native = async () => {
    try {
      await navigator.share({ title: 'Rehabify Learn', text, url })
      simTrack('sim_share', { case: slug, via: 'native' })
    } catch {
      // closed the share sheet
    }
  }
  return (
    <div className="flex gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          playSound('share')
          simTrack('sim_share', { case: slug, via: 'whatsapp' })
        }}
        className={button}
      >
        <WhatsApp className="h-4 w-4" /> WhatsApp
      </a>
      <button type="button" onClick={() => void copy()} className={button}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
      </button>
      {canNative && (
        <button type="button" onClick={() => void native()} aria-label="More ways to share" className={cn(button, 'max-w-[52px] flex-none px-0')}>
          <Share2 className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** On the debrief: make the replay link (once), then the ways to share it. */
export function ShareReplayCard({ attemptId, slug, pct, title }: { attemptId: string; slug: string; pct: number; title: string }) {
  const create = useMutation(simApi.createShare)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const text = `I scored ${pct}% on “${title}”, a clinical simulation on Rehabify Learn. Watch my run, then see if you can beat it:`

  const make = async () => {
    setBusy(true)
    try {
      const res = await create({ attemptId })
      setCode(res.code)
      playSound('success')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t make the link. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[22px] border border-rh-ink/10 bg-white p-4">
      <p className="text-[16px] font-semibold text-rh-ink">Share your run</p>
      <p className="mt-1 text-sm leading-6 text-rh-ink/60">
        Friends watch your patient, your choices and the voices, then try the case themselves. Shows your first name and score; the expert answers stay hidden.
      </p>
      {code ? (
        <div className="mt-3 space-y-2.5">
          <ShareRow url={replayUrl(code)} text={text} slug={slug} />
          <Link href={`${replayPath(code)}?video=1`} className={cn(pillInk, 'h-11 w-full px-4 text-sm')}>
            <Video className="h-4 w-4" /> Make a video for TikTok, Reels or Status
          </Link>
        </div>
      ) : (
        <button type="button" onClick={() => void make()} disabled={busy} className={cn(pillInk, 'mt-3 h-11 w-full px-5')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share my replay
        </button>
      )}
    </div>
  )
}
