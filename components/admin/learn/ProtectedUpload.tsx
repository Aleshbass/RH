'use client'

/**
 * The protected-video upload experience in the lesson drawer (Admin › Learn › Courses): a big drop
 * zone, a file card with a preview frame, upload progress with speed and time left, and live
 * Upload → Encode & encrypt → Ready steps that follow the encoder (convex/learnVideo.ts).
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2, Lock, PlayCircle, RotateCcw, UploadCloud, X } from '@/components/icons'
import { cn } from '@/lib/utils'
import { formatBytes, formatLength, type VideoAsset, type VideoAssetId } from '@/components/learn/video/videoApi'

/** Length, size of picture and a preview frame, when the browser can read the file. Never blocks an
 * upload: iPhone HEVC and other files the browser can't play still encode fine on the server. */
export async function peekVideo(file: File): Promise<{ durationSec: number; width: number; height: number; posterUrl: string | null }> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve) => {
      const video = document.createElement('video')
      const fallback = { durationSec: 0, width: 0, height: 0, posterUrl: null }
      const timer = window.setTimeout(() => resolve(fallback), 8000)
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.src = url
      video.onerror = () => {
        window.clearTimeout(timer)
        resolve(fallback)
      }
      video.onloadedmetadata = () => {
        const durationSec = Number.isFinite(video.duration) ? video.duration : 0
        const size = { durationSec, width: video.videoWidth, height: video.videoHeight }
        if (!durationSec || !video.videoWidth) {
          window.clearTimeout(timer)
          resolve({ ...size, posterUrl: null })
          return
        }
        video.currentTime = Math.min(Math.max(durationSec * 0.1, 1), durationSec / 2)
        video.onseeked = () => {
          window.clearTimeout(timer)
          try {
            const canvas = document.createElement('canvas')
            canvas.width = 480
            canvas.height = Math.round(480 * (video.videoHeight / video.videoWidth))
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
            resolve({ ...size, posterUrl: canvas.toDataURL('image/jpeg', 0.75) })
          } catch {
            resolve({ ...size, posterUrl: null })
          }
        }
      }
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function resolutionLabel(width: number, height: number) {
  const short = Math.min(width, height)
  if (!short) return null
  if (short >= 2000) return '4K'
  if (short >= 1400) return '1440p'
  if (short >= 1000) return '1080p'
  if (short >= 700) return '720p'
  return `${short}p`
}

// ── Drop zone ────────────────────────────────────────────────────────────────

export function UploadDropzone({
  onFile,
  disabled,
  replacing,
}: {
  onFile: (file: File | undefined) => void
  disabled?: boolean
  replacing?: boolean
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) onFile(e.dataTransfer.files?.[0])
      }}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-5 py-10 text-center transition duration-200',
        disabled && 'pointer-events-none opacity-50',
        dragging
          ? 'scale-[1.01] border-rh-lime bg-rh-honeydew dark:bg-white/[0.06]'
          : 'border-black/10 bg-white hover:border-rh-ink/30 hover:bg-rh-canvas/60 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/[0.04]'
      )}
    >
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <span
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-2xl transition duration-200',
          dragging ? 'bg-rh-ink text-rh-lime' : 'bg-rh-canvas text-rh-ink group-hover:bg-rh-ink group-hover:text-rh-lime dark:bg-white/[0.08] dark:text-white'
        )}
      >
        <UploadCloud className="h-6 w-6" />
      </span>
      <span className="mt-4 text-[15px] font-semibold text-rh-ink dark:text-white">
        {dragging ? 'Drop to upload' : replacing ? 'Replace the video' : 'Drop your video here'}
      </span>
      <span className="mt-1 text-sm text-neutral-500">
        or <span className="font-semibold text-rh-ink underline underline-offset-4 dark:text-white">browse files</span>
      </span>
      <span className="mt-5 flex flex-wrap justify-center gap-1.5">
        {['MP4 or MOV', 'Up to 8 GB', '1080p and 4K welcome'].map((chip) => (
          <span key={chip} className="rounded-full bg-rh-canvas px-2.5 py-1 text-[11px] font-medium text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300">
            {chip}
          </span>
        ))}
      </span>
    </label>
  )
}

// ── File card + progress ─────────────────────────────────────────────────────

function Poster({ url }: { url: string | null }) {
  return (
    <span className="relative flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-rh-ink text-white/60">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local data: preview frame, not a remote image
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <PlayCircle className="h-5 w-5" />
      )}
    </span>
  )
}

function useRate(fraction: number, sizeBytes: number, startedAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return useMemo(() => {
    const seconds = Math.max(1, (now - startedAt) / 1000)
    const sent = fraction * sizeBytes
    const perSecond = sent / seconds
    const left = perSecond > 0 ? (sizeBytes - sent) / perSecond : 0
    return { perSecond, left: seconds < 3 ? null : left }
  }, [now, startedAt, fraction, sizeBytes])
}

export type FileFacts = { name: string; sizeBytes: number; durationSec: number; width: number; height: number; posterUrl: string | null }

function FileLine({ facts }: { facts: FileFacts }) {
  const res = resolutionLabel(facts.width, facts.height)
  return (
    <span className="text-xs text-neutral-500">
      {[facts.durationSec ? formatLength(facts.durationSec) : null, formatBytes(facts.sizeBytes), res].filter(Boolean).join(' · ')}
    </span>
  )
}

export function UploadProgressCard({
  facts,
  stage,
  fraction,
  startedAt,
  onCancel,
}: {
  facts: FileFacts
  stage: 'reading' | 'uploading'
  fraction: number
  startedAt: number
  onCancel: () => void
}) {
  const { perSecond, left } = useRate(fraction, facts.sizeBytes, startedAt)
  const pct = Math.round(fraction * 100)
  return (
    <div className="rounded-3xl border border-black/[0.06] bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <Poster url={facts.posterUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{facts.name}</p>
          <FileLine facts={facts} />
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel upload"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-rh-canvas hover:text-rh-ink dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-rh-canvas dark:bg-white/[0.06]">
        <div
          className={cn('h-full rounded-full bg-rh-lime transition-[width] duration-500 ease-out', stage === 'reading' && 'animate-pulse')}
          style={{ width: `${stage === 'uploading' ? Math.max(3, pct) : 3}%` }}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold tabular-nums text-rh-ink dark:text-white">{stage === 'reading' ? 'Getting ready…' : `Uploading · ${pct}%`}</span>
        {stage === 'uploading' && (
          <span className="tabular-nums text-neutral-500">
            {formatBytes(perSecond)}/s{left !== null ? ` · ${left < 60 ? `${Math.ceil(left)} s` : `${Math.ceil(left / 60)} min`} left` : ''}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-neutral-500">Keep this page open until the upload finishes.</p>
    </div>
  )
}

// ── Steps after the upload ───────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'waiting' | 'failed'

function Step({ state, label, detail }: { state: StepState; label: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
          state === 'done' && 'bg-rh-ink text-rh-lime dark:bg-rh-lime dark:text-rh-ink',
          state === 'active' && 'bg-rh-honeydew text-rh-ink dark:bg-white/10 dark:text-white',
          state === 'waiting' && 'bg-rh-canvas text-neutral-400 dark:bg-white/[0.06]',
          state === 'failed' && 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
        )}
      >
        {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === 'failed' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', state === 'waiting' ? 'text-neutral-400' : 'text-rh-ink dark:text-white')}>{label}</span>
        {detail && <span className="mt-0.5 block text-xs leading-5 text-neutral-500">{detail}</span>}
      </span>
    </li>
  )
}

/** Upload → Encode & encrypt → Ready, following the video's live status. */
export function UploadedCard({
  facts,
  status,
  error,
  onReplace,
}: {
  facts: FileFacts
  status: VideoAsset['status'] | undefined
  error?: string | null
  onReplace: () => void
}) {
  const encoding: StepState = status === 'ready' ? 'done' : status === 'failed' ? 'failed' : 'active'
  return (
    <div className="rounded-3xl border border-black/[0.06] bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <Poster url={facts.posterUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{facts.name}</p>
          <FileLine facts={facts} />
        </div>
        <button type="button" onClick={onReplace} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-rh-ink transition hover:bg-rh-canvas dark:text-white dark:hover:bg-white/[0.06]">
          Replace
        </button>
      </div>
      <ol className="mt-4 space-y-3 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <Step state="done" label="Uploaded" detail="Stored privately. Only the encoder can read it." />
        <Step
          state={encoding}
          label={status === 'failed' ? 'Encoding failed' : 'Encoding and encrypting'}
          detail={
            status === 'failed'
              ? error || 'Replace the file to try again. MP4 (H.264) works best.'
              : status === 'ready'
                ? '480p and 720p, encrypted.'
                : 'Usually a few minutes. You can add the lesson now and close this.'
          }
        />
        <Step state={status === 'ready' ? 'done' : 'waiting'} label="Ready to watch" detail={status === 'ready' ? 'Enrolled learners can play it now.' : undefined} />
      </ol>
    </div>
  )
}

export function UploadFailedCard({ facts, message, onRetry, onPickAnother }: { facts: FileFacts; message: string; onRetry: () => void; onPickAnother: () => void }) {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-500/20 dark:bg-rose-500/[0.06]">
      <div className="flex items-center gap-3">
        <Poster url={facts.posterUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-rh-ink dark:text-white">{facts.name}</p>
          <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{message}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full bg-rh-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-black dark:bg-rh-lime dark:text-rh-ink">
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </button>
        <button type="button" onClick={onPickAnother} className="rounded-full px-4 py-2 text-xs font-semibold text-rh-ink transition hover:bg-white dark:text-white dark:hover:bg-white/[0.06]">
          Choose another file
        </button>
      </div>
    </div>
  )
}

// ── Videos published from the laptop ────────────────────────────────────────

export function PublishedPicker({
  assets,
  picked,
  onPick,
}: {
  assets: VideoAsset[]
  picked: VideoAssetId | null
  onPick: (id: VideoAssetId | null) => void
}) {
  if (assets.length === 0) {
    return (
      <div className="rounded-3xl bg-rh-canvas px-5 py-8 text-center text-sm text-neutral-500 dark:bg-white/[0.04]">
        No videos waiting. Videos published with <code className="rounded bg-white px-1 py-0.5 text-xs dark:bg-white/10">npm run video:publish</code> show here.
      </div>
    )
  }
  return (
    <ul className="grid gap-2" role="radiogroup" aria-label="Published videos">
      {assets.map((a) => {
        const on = picked === a.id
        return (
          <li key={a.id}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(on ? null : a.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition',
                on ? 'border-rh-ink bg-rh-honeydew dark:border-rh-lime dark:bg-white/[0.06]' : 'border-black/[0.06] hover:border-rh-ink/25 dark:border-white/10'
              )}
            >
              <Poster url={a.posterUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-rh-ink dark:text-white">{a.title}</span>
                <span className="text-xs text-neutral-500">
                  {formatLength(a.durationSec)} · {new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </span>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-rh-ink bg-rh-ink text-rh-lime dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink' : 'border-black/20 dark:border-white/25')}>
                {on && <Check className="h-3 w-3" />}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Small pieces ─────────────────────────────────────────────────────────────

export function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">Uploads aren’t switched on yet</p>
        <p className="mt-0.5 text-xs leading-5 opacity-80">A server setting is missing ({missing.join('; ')}). Ask the tech team; YouTube links still work.</p>
      </div>
    </div>
  )
}

/** Status chip for a lesson row. */
export function LessonVideoChip({ hosting, processing, failed }: { hosting: string; processing: boolean; failed: boolean }) {
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
        <AlertTriangle className="h-3 w-3" /> Encoding failed
      </span>
    )
  }
  if (processing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
        <Loader2 className="h-3 w-3 animate-spin" /> Encoding
      </span>
    )
  }
  if (hosting === 'protected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rh-honeydew px-2 py-0.5 text-[11px] font-semibold text-rh-ink dark:bg-white/10 dark:text-white">
        <Lock className="h-3 w-3" /> Protected
      </span>
    )
  }
  if (hosting === 'youtube') {
    return <span className="rounded-full bg-rh-canvas px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300">YouTube</span>
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rh-canvas px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300">
      <CheckCircle2 className="h-3 w-3" /> Uploaded
    </span>
  )
}
