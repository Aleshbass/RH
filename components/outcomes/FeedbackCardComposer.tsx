'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Check, Download, Instagram, Linkedin, Loader2, WhatsApp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PhysioDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { CARD_FORMATS, downloadBlob, feedbackCardPng, shareCardImage, type CardData, type CardFormat } from '@/lib/outcomes/feedbackCard'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type CardSource = {
  checkId: Id<'outcomeChecks'>
  firstName: string
  area: string | null
  quotes: string[]
  rating: number | null
  consentAt: number
  painFrom: number | null
  painTo: number | null
  sessions: number | null
  physioName: string
  physioTitle: string
  link: string
} | null

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const cardRef = makeFunctionReference<'query', { checkId: Id<'outcomeChecks'> }, CardSource>('outcomes:getFeedbackCard')
const sharedRef = makeFunctionReference<'mutation', { checkId: Id<'outcomeChecks'> }, { points: number }>('outcomes:markCardShared')

const plainLink = (url: string) => url.replace(/^https?:\/\//, '')

/**
 * "Create a feedback card": pick the patient's words (never edited), choose what else shows,
 * pick a size, then share to WhatsApp, Instagram or LinkedIn, or download. Only for patients who
 * agreed to share, first name and area only.
 */
export function FeedbackCardComposer({ checkId, onClose }: { checkId: Id<'outcomeChecks'> | null; onClose: () => void }) {
  const source = useQuery(cardRef, checkId ? { checkId } : 'skip')
  const markShared = useMutation(sharedRef)
  const [quote, setQuote] = useState(0)
  const [showPain, setShowPain] = useState(true)
  const [showSessions, setShowSessions] = useState(true)
  const [size, setSize] = useState<CardFormat>('square')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!checkId) return
    setQuote(0)
    setShowPain(true)
    setShowSessions(true)
    setSize('square')
  }, [checkId])

  const data = useMemo<CardData | null>(() => {
    if (!source) return null
    return {
      quote: source.quotes[quote] ?? source.quotes[0] ?? '',
      firstName: source.firstName,
      area: source.area,
      pain: showPain && source.painFrom !== null && source.painTo !== null ? { from: source.painFrom, to: source.painTo } : null,
      sessions: showSessions ? source.sessions : null,
      physioName: source.physioName,
      physioTitle: source.physioTitle,
      link: plainLink(source.link),
    }
  }, [source, quote, showPain, showSessions])

  // Live preview, drawn the same way as the shared image
  useEffect(() => {
    if (!data) return
    let url: string | null = null
    let cancelled = false
    feedbackCardPng(data, size)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPreview(url)
      })
      .catch(() => !cancelled && setPreview(null))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [data, size])

  async function share(channel: 'whatsapp' | 'instagram' | 'linkedin' | 'download') {
    if (!data || !source) return
    setBusy(channel)
    try {
      const blob = await feedbackCardPng(data, size)
      const filename = `Rehabify-feedback-${source.firstName}-${size}.png`
      const text = `Proud of ${source.firstName}'s progress. Book a session: ${source.link}`
      let result: 'shared' | 'downloaded' | 'cancelled'
      if (channel === 'download') {
        downloadBlob(blob, filename)
        result = 'downloaded'
      } else {
        result = await shareCardImage(blob, filename, text)
        // On a computer the image downloads; open the network so it can be attached
        if (result === 'downloaded' && channel === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
        if (result === 'downloaded' && channel === 'linkedin') {
          window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(source.link)}`, '_blank', 'noopener')
        }
      }
      if (result === 'cancelled') return
      playSound('share')
      const { points } = await markShared({ checkId: source.checkId })
      toast.success(
        result === 'shared' ? 'Shared' : channel === 'instagram' ? 'Saved. Post it from Instagram.' : 'Image saved',
        { description: points ? `+${points} reward points for your first card.` : undefined }
      )
      if (points) playSound('points')
    } catch {
      playSound('error')
      toast.error('Couldn’t make the image. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <PhysioDrawer
      open={Boolean(checkId)}
      onOpenChange={(o) => !o && onClose()}
      title="Create a feedback card"
      className="md:max-w-lg"
      footer={
        source && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-pt-muted">Share to</p>
            <div className="grid grid-cols-3 gap-2">
              <Button className={cn(primaryButtonClass, 'h-11')} disabled={Boolean(busy)} onClick={() => void share('whatsapp')}>
                {busy === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WhatsApp className="mr-1.5 h-4 w-4" />}
                WhatsApp
              </Button>
              <Button variant="outline" className={cn(secondaryButtonClass, 'h-11')} disabled={Boolean(busy)} onClick={() => void share('instagram')}>
                {busy === 'instagram' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="mr-1.5 h-4 w-4" />}
                Instagram
              </Button>
              <Button variant="outline" className={cn(secondaryButtonClass, 'h-11')} disabled={Boolean(busy)} onClick={() => void share('linkedin')}>
                {busy === 'linkedin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Linkedin className="mr-1.5 h-4 w-4" />}
                LinkedIn
              </Button>
            </div>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void share('download')}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-pt-muted hover:text-pt-ink"
            >
              <Download className="h-3.5 w-3.5" />
              Download image
            </button>
          </div>
        )
      }
    >
      {source === undefined ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-pt-muted" />
        </div>
      ) : source === null ? (
        <p className="py-8 text-center text-sm text-pt-muted">This feedback can’t be shared. The patient hasn’t agreed, or took it back.</p>
      ) : (
        <div className="space-y-5">
          <p className="flex items-start gap-2 rounded-2xl bg-pt-green-bg px-4 py-3 text-[13px] leading-relaxed text-pt-ink">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-pt-green-fg" />
            <span>
              <span className="font-semibold">{source.firstName} agreed to share</span> · first name and area only ·{' '}
              {format(source.consentAt, 'd MMM')}
            </span>
          </p>

          <div>
            <p className="mb-2 text-sm font-semibold text-pt-ink">Pick their words</p>
            <div className="space-y-2">
              {source.quotes.map((q, i) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuote(i)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-relaxed transition',
                    quote === i ? 'border-pt-ink bg-pt-surface text-pt-ink' : 'border-pt-line bg-pt-surface text-pt-muted hover:text-pt-ink'
                  )}
                >
                  <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', quote === i ? 'border-pt-ink' : 'border-pt-line-strong')}>
                    {quote === i && <span className="h-2 w-2 rounded-full bg-pt-ink" />}
                  </span>
                  “{q}”
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-pt-faint">Their exact words. Cards can’t change what a patient wrote.</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-pt-ink">Show on the card</p>
            <div className="space-y-2">
              {source.painFrom !== null && source.painTo !== null && (
                <Toggle checked={showPain} onChange={setShowPain} label={`Pain change (${source.painFrom} → ${source.painTo})`} />
              )}
              {source.sessions ? <Toggle checked={showSessions} onChange={setShowSessions} label={`Number of sessions (${source.sessions})`} /> : null}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-pt-ink">Size</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CARD_FORMATS) as CardFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSize(f)}
                  className={cn(
                    'rounded-2xl px-3 py-2.5 text-left transition',
                    size === f ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink hover:bg-pt-hover'
                  )}
                >
                  <span className="block text-sm font-semibold">{CARD_FORMATS[f].label}</span>
                  <span className={cn('block text-[11px]', size === f ? 'opacity-75' : 'text-pt-muted')}>{CARD_FORMATS[f].hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-pt-line bg-pt-sunken">
            {preview ? (
              <Image
                src={preview}
                alt="Card preview"
                width={CARD_FORMATS[size].width}
                height={CARD_FORMATS[size].height}
                unoptimized
                className={cn('mx-auto h-auto w-full', size === 'story' && 'max-w-[260px]')}
              />
            ) : (
              <div className="flex aspect-square items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-pt-muted" />
              </div>
            )}
          </div>
          <p className="text-center text-xs text-pt-faint">Links to your Rehabify booking page. +20 reward points the first time you share a card.</p>
        </div>
      )}
    </PhysioDrawer>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className="flex w-full items-center justify-between rounded-2xl border border-pt-line bg-pt-surface px-4 py-3 text-left text-sm text-pt-ink"
    >
      {label}
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-md border transition',
          checked ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong'
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
    </button>
  )
}
