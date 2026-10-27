'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Camera, ImageIcon, Loader2, Pencil, Play, Plus, Send, Trash2 } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { primaryButtonClass, secondaryButtonClass, StatusBadge } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { formatMegabytes, OWN_MEDIA_LIMITS } from '@/lib/ownExerciseMedia'
import { cn } from '@/lib/utils'
import { formatDuration, useExerciseMediaLinks, type RequestMediaLinks } from './ownMedia'
import { OwnExerciseSheet, type OwnExercise } from './OwnExerciseSheet'
import type { LibraryEntry } from './types'

type MyOwnExercises = {
  items: OwnExercise[]
  usage: { videos: number; bytes: number }
  limits: typeof OWN_MEDIA_LIMITS
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const myOwnRef = makeFunctionReference<'query', Record<string, never>, MyOwnExercises | null>('exerciseLibrary:myOwnExercises')
const removeRef = makeFunctionReference<'mutation', { exerciseId: Id<'exercises'> }, { success: boolean }>('exerciseLibrary:removeOwnExercise')

/** The first frame of the video, or the first photo; a plain tile when there's neither. */
function Thumb({ entry, requestLinks }: { entry: OwnExercise; requestLinks: RequestMediaLinks }) {
  const [src, setSrc] = useState<string | null>(null)
  const media = entry.ownMedia
  useEffect(() => {
    let live = true
    if (media) {
      requestLinks(entry._id)
        .then((links) => live && setSrc(links?.poster ?? links?.photos[0] ?? null))
        .catch(() => {})
    }
    return () => {
      live = false
    }
  }, [entry._id, media, requestLinks])

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-pt-sunken">
      {src ? (
        <Image src={src} alt="" fill unoptimized sizes="(max-width: 640px) 100vw, 320px" className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-pt-faint">
          {media ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-xs">Steps only</span>}
        </div>
      )}
      {media?.kind === 'video' && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-rh-ink/85 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Play className="h-2.5 w-2.5" />
          {media.durationSec ? formatDuration(media.durationSec) : 'Video'}
        </span>
      )}
      {media?.kind === 'photos' && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-rh-ink/85 px-2 py-0.5 text-[11px] font-semibold text-white">
          <ImageIcon className="h-2.5 w-2.5" />
          {media.photoCount} photo{media.photoCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

/**
 * The physio's own exercises: create them with their own photos or video, reuse them for any
 * patient, and see how much of the allowance is used.
 */
export function OwnExercisesTab({ onSend }: { onSend: (entry: LibraryEntry) => void }) {
  const data = useQuery(myOwnRef, {})
  const remove = useMutation(removeRef)
  const requestLinks = useExerciseMediaLinks({ kind: 'staff' })
  const [editing, setEditing] = useState<OwnExercise | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<OwnExercise | null>(null)
  const [busy, setBusy] = useState(false)

  if (data === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-3xl" />
        ))}
      </div>
    )
  }
  if (data === null) {
    return <p className="py-10 text-center text-sm text-pt-muted">Your own exercises are available once your account is approved.</p>
  }

  const { items, usage, limits } = data
  const storageShare = Math.min(100, Math.round((usage.bytes / limits.totalBytes) * 100))

  return (
    <div className="space-y-5">
      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-pt-sunken px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
            <Camera className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-pt-ink">Show patients how you teach it</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-6 text-pt-muted">
            Record a short video or take a few photos on your phone. Save it once, then send it to any patient: they see it in their app and their WhatsApp link.
          </p>
          <button type="button" onClick={() => setCreating(true)} className={cn(primaryButtonClass, 'mt-5 inline-flex h-11 items-center gap-2 px-5 text-sm font-semibold')}>
            <Plus className="h-4 w-4" />
            Create your first exercise
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <div className="flex items-baseline justify-between text-xs text-pt-muted">
                <span>
                  {usage.videos} of {limits.videos} videos
                </span>
                <span>
                  {formatMegabytes(usage.bytes)} of {formatMegabytes(limits.totalBytes)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pt-sunken" aria-hidden>
                <div className={cn('h-full rounded-full', storageShare >= 90 ? 'bg-amber-500' : 'bg-rh-lime')} style={{ width: `${Math.max(storageShare, usage.bytes ? 2 : 0)}%` }} />
              </div>
            </div>
            <button type="button" onClick={() => setCreating(true)} className={cn(primaryButtonClass, 'inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold')}>
              <Plus className="h-4 w-4" />
              New exercise
            </button>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((entry) => (
              <li key={entry._id} className="flex flex-col rounded-3xl border border-pt-line bg-pt-surface p-3">
                <Thumb entry={entry} requestLinks={requestLinks} />
                <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 font-semibold leading-snug text-pt-ink">{entry.name}</h3>
                    {entry.libraryShare === 'pending' && <StatusBadge>In review</StatusBadge>}
                    {entry.libraryShare === 'approved' && <StatusBadge tone="green">In library</StatusBadge>}
                  </div>
                  <p className="mt-1 text-xs text-pt-muted">
                    {entry.instructions.length} step{entry.instructions.length === 1 ? '' : 's'} · {entry.defaults.sets} × {entry.defaults.reps}
                    {entry.defaults.holdSeconds ? `, ${entry.defaults.holdSeconds}s hold` : ''}
                    {entry.bodyParts[0] ? ` · ${entry.bodyParts[0]}` : ''}
                  </p>
                  <div className="mt-auto flex items-center gap-2 pt-4">
                    <button type="button" onClick={() => onSend(entry)} className={cn(primaryButtonClass, 'inline-flex h-9 flex-1 items-center justify-center gap-1.5 text-sm font-semibold')}>
                      <Send className="h-3.5 w-3.5" />
                      Send
                    </button>
                    <button type="button" onClick={() => setEditing(entry)} aria-label={`Edit ${entry.name}`} className={cn(secondaryButtonClass, 'inline-flex h-9 w-9 items-center justify-center')}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setRemoving(entry)} aria-label={`Remove ${entry.name}`} className={cn(secondaryButtonClass, 'inline-flex h-9 w-9 items-center justify-center')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <OwnExerciseSheet
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
        exercise={editing}
        requestLinks={requestLinks}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
        <AlertDialogContent className="rounded-3xl border-pt-line bg-pt-surface text-pt-ink">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves your library and its photos or video are deleted. Patients who already have it keep the name and steps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className="rounded-full">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault()
                if (!removing) return
                setBusy(true)
                try {
                  await remove({ exerciseId: removing._id })
                  toast.success('Exercise removed')
                  setRemoving(null)
                } catch (error) {
                  toast.error(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Couldn’t remove it. Please try again.')
                } finally {
                  setBusy(false)
                }
              }}
              className="rounded-full bg-red-600 text-white hover:bg-red-700"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
