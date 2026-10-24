'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileText, Loader2 } from '@/components/icons'
import { useIsPhone } from '@/components/patient/ui'
import { cn } from '@/lib/utils'

/**
 * A Rehabify Library PDF leaflet shown inside the app. It comes from our own
 * /api/library/doc/<key> (hospital sites block being shown in other apps), so the browser's
 * own PDF viewer can show it in a frame. Phones don't show PDFs inside a page, so there it's one
 * tap to open the full leaflet. If the source site doesn't send it, it offers the original.
 */
export function PdfViewer({ docKey, sourceUrl, sourceName, className }: { docKey: string; sourceUrl: string | null; sourceName: string; className?: string }) {
  const src = `/api/library/doc/${encodeURIComponent(docKey)}`
  const isPhone = useIsPhone()
  const [state, setState] = useState<'checking' | 'ready' | 'failed'>('checking')

  // Check the leaflet loads before framing it, so a failure shows a clear fallback instead of a broken frame
  useEffect(() => {
    let cancelled = false
    setState('checking')
    fetch(src, { method: 'HEAD' })
      .then((res) => !cancelled && setState(res.ok ? 'ready' : 'failed'))
      .catch(() => !cancelled && setState('failed'))
    return () => {
      cancelled = true
    }
  }, [src])

  const original = sourceUrl && (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-pt-muted underline-offset-2 hover:text-pt-ink hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Original on {sourceName}
    </a>
  )

  if (state === 'checking') {
    return (
      <div className={cn('flex items-center gap-2 rounded-2xl bg-pt-sunken px-4 py-6 text-sm text-pt-muted', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening the leaflet…
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div className={cn('flex flex-col items-center rounded-2xl bg-pt-sunken px-4 py-8 text-center', className)}>
        <FileText className="h-6 w-6 text-pt-faint" />
        <p className="mt-2 text-sm font-semibold text-pt-ink">Couldn’t show this leaflet here</p>
        <p className="mt-1 max-w-xs text-xs text-pt-muted">{sourceName}’s site didn’t send it to us. You can still read it on their site.</p>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-pt-line-strong bg-pt-surface px-3 py-2 text-sm font-medium text-pt-ink hover:bg-pt-hover"
          >
            <ExternalLink className="h-4 w-4" />
            Open on {sourceName}
          </a>
        )}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {isPhone ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-pt-line bg-pt-surface p-4 transition-colors hover:bg-pt-hover"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pt-violet-bg text-pt-violet-fg">
            <FileText className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-pt-ink">Read the leaflet</span>
            <span className="block text-xs text-pt-muted">PDF from {sourceName} · opens full screen</span>
          </span>
        </a>
      ) : (
        <iframe src={`${src}#view=FitH`} title={`Leaflet from ${sourceName}`} className="h-[70vh] min-h-[28rem] w-full rounded-2xl border border-pt-line bg-pt-sunken" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-pt-faint">PDF leaflet · {sourceName}</p>
        {original}
      </div>
    </div>
  )
}
