'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import { toast } from 'sonner'
import { Camera, Loader2, Plus, Trash2, Upload, X } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { PhysioDrawer, fieldClass, primaryButtonClass } from '@/components/physio/ui'
import type { Id } from '@/convex/_generated/dataModel'
import { inspectVideo, uploadToImagekit, type ImagekitFile } from '@/components/learn/video/videoApi'
import { OWN_MEDIA_CONSENT, OWN_MEDIA_LIMITS, type OwnMediaConsent } from '@/lib/ownExerciseMedia'
import { cn } from '@/lib/utils'
import { formatDuration, preparePhoto, type RequestMediaLinks } from './ownMedia'
import { OwnMediaView } from './OwnMediaView'
import type { LibraryEntry } from './types'

export type OwnExercise = LibraryEntry & { libraryShare: 'pending' | 'approved' | 'declined' | null }

type UploadAuth = { token: string; expire: number; signature: string; publicKey: string; folder: string }
type NewVideo = ImagekitFile & { durationSec: number; poster?: ImagekitFile; preview: string }
type NewPhoto = ImagekitFile & { preview: string }

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const uploadAuthRef = makeFunctionReference<'mutation', { kind: 'video' | 'photo' }, UploadAuth>('exerciseLibrary:ownExerciseUploadAuth')
const saveRef = makeFunctionReference<'mutation', Record<string, unknown>, { exerciseId: Id<'exercises'> }>('exerciseLibrary:saveOwnExercise')

const BODY_AREAS = ['Neck', 'Shoulder', 'Elbow', 'Wrist & hand', 'Back', 'Core', 'Hip', 'Knee', 'Ankle & foot', 'Balance']

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : error instanceof Error && error.message ? error.message : fallback

const stripFile = ({ fileId, filePath, url, size }: ImagekitFile) => ({ fileId, filePath, url, size })

/**
 * Create or edit one of the physio's own exercises: their video or photos first (straight from
 * the phone camera), who appears in them, then the name, steps and dose. Files upload as soon as
 * they're picked, so saving is instant.
 */
export function OwnExerciseSheet({
  open,
  onOpenChange,
  exercise,
  requestLinks,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this exercise; leave out to create one */
  exercise?: OwnExercise | null
  requestLinks: RequestMediaLinks
  onSaved?: (exerciseId: Id<'exercises'>) => void
}) {
  const getUploadAuth = useMutation(uploadAuthRef)
  const save = useMutation(saveRef)

  const [mode, setMode] = useState<'video' | 'photos'>('video')
  const [keepExisting, setKeepExisting] = useState(false)
  const [video, setVideo] = useState<NewVideo | null>(null)
  const [photos, setPhotos] = useState<NewPhoto[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [consent, setConsent] = useState<OwnMediaConsent | null>(null)
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [sets, setSets] = useState('3')
  const [reps, setReps] = useState('10')
  const [hold, setHold] = useState('')
  const [area, setArea] = useState<string | null>(null)
  const [share, setShare] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  const recordVideo = useRef<HTMLInputElement>(null)
  const pickVideo = useRef<HTMLInputElement>(null)
  const takePhoto = useRef<HTMLInputElement>(null)
  const pickPhotos = useRef<HTMLInputElement>(null)

  // Start fresh each time the sheet opens
  useEffect(() => {
    if (!open) return
    setKeepExisting(Boolean(exercise?.ownMedia))
    setMode(exercise?.ownMedia?.kind === 'photos' ? 'photos' : 'video')
    setVideo(null)
    setPhotos([])
    setProgress(null)
    setConsent(null)
    setName(exercise?.name ?? '')
    setSteps(exercise?.instructions.length ? exercise.instructions : [''])
    setSets(String(exercise?.defaults.sets ?? 3))
    setReps(String(exercise?.defaults.reps ?? 10))
    setHold(exercise?.defaults.holdSeconds ? String(exercise.defaults.holdSeconds) : '')
    setArea(exercise?.bodyParts[0] ?? null)
    setShare(exercise?.libraryShare === 'pending' || exercise?.libraryShare === 'approved')
    setSaving(false)
    setTried(false)
  }, [open, exercise])

  const uploading = progress !== null
  const newMedia = Boolean(video || photos.length)
  const hasMedia = keepExisting || newMedia

  const uploadVideo = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('video/')) return toast.error('Choose a video file.')
    if (file.size > OWN_MEDIA_LIMITS.videoBytes) return toast.error('Videos can be up to 50 MB. Record a shorter clip.')
    setProgress(0)
    try {
      const { durationSec, poster } = await inspectVideo(file)
      if (durationSec > OWN_MEDIA_LIMITS.videoSeconds) throw new Error('Keep videos under 5 minutes.')
      const uploaded = await uploadToImagekit(file, file.name || 'exercise.mp4', await getUploadAuth({ kind: 'video' }), {
        isPrivate: true,
        onProgress: (fraction) => setProgress(Math.round(fraction * 95)),
      })
      const posterFile = poster
        ? await uploadToImagekit(poster, 'poster.jpg', await getUploadAuth({ kind: 'photo' }), { isPrivate: true })
        : undefined
      setVideo({ ...uploaded, durationSec: Math.max(1, Math.round(durationSec)), poster: posterFile, preview: URL.createObjectURL(file) })
      setPhotos([])
      setKeepExisting(false)
    } catch (error) {
      toast.error(errorText(error, 'The video didn’t upload. Please try again.'))
    } finally {
      setProgress(null)
    }
  }

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    const room = OWN_MEDIA_LIMITS.photosPerExercise - (keepExisting ? 0 : photos.length)
    const chosen = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room))
    if (!chosen.length) return toast.error(room <= 0 ? 'Up to 5 photos per exercise.' : 'Choose photos.')
    setProgress(0)
    try {
      const added: NewPhoto[] = []
      for (const [i, file] of chosen.entries()) {
        const blob = await preparePhoto(file)
        const uploaded = await uploadToImagekit(blob, 'photo.jpg', await getUploadAuth({ kind: 'photo' }), {
          isPrivate: true,
          onProgress: (fraction) => setProgress(Math.round(((i + fraction) / chosen.length) * 100)),
        })
        added.push({ ...uploaded, preview: URL.createObjectURL(blob) })
      }
      setPhotos((current) => [...(keepExisting ? [] : current), ...added])
      setVideo(null)
      setKeepExisting(false)
    } catch (error) {
      toast.error(errorText(error, 'The photos didn’t upload. Please try again.'))
    } finally {
      setProgress(null)
    }
  }

  const cleanSteps = steps.map((s) => s.trim()).filter(Boolean)
  const numbersOk = [sets, reps].every((n) => /^\d+$/.test(n)) && (hold === '' || /^\d+$/.test(hold))
  const problems = {
    name: name.trim().length < 2 ? 'Give it a name.' : null,
    steps: cleanSteps.length === 0 ? 'Add at least one step.' : null,
    consent: newMedia && !consent ? 'Confirm who appears in it.' : null,
    dose: numbersOk ? null : 'Use whole numbers.',
  }
  const ready = !Object.values(problems).some(Boolean) && !uploading

  const submit = async () => {
    setTried(true)
    if (!ready || saving) return
    setSaving(true)
    try {
      const mediaChanged = Boolean(exercise?.ownMedia) !== keepExisting || newMedia
      const media = !mediaChanged
        ? undefined
        : video
          ? {
              video: {
                ...stripFile(video),
                durationSec: video.durationSec,
                ...(video.poster ? { poster: stripFile(video.poster) } : {}),
              },
            }
          : photos.length
            ? { photos: photos.map(stripFile) }
            : null
      const result = await save({
        ...(exercise ? { exerciseId: exercise._id } : {}),
        name: name.trim(),
        steps: cleanSteps,
        ...(area ? { bodyPart: area } : {}),
        sets: Number(sets),
        reps: Number(reps),
        ...(hold ? { holdSeconds: Number(hold) } : {}),
        ...(media !== undefined ? { media } : {}),
        ...(newMedia && consent ? { consent } : {}),
        shareToLibrary: share,
      })
      toast.success(exercise ? 'Exercise updated' : 'Exercise saved. You can send it to any patient.')
      onSaved?.(result.exerciseId)
      onOpenChange(false)
    } catch (error) {
      toast.error(errorText(error, 'Couldn’t save the exercise. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const tileClass =
    'flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-pt-line-strong bg-pt-sunken px-3 py-6 text-sm font-semibold text-pt-ink transition hover:border-pt-ink disabled:opacity-50'
  const label = 'mb-1.5 block text-sm font-semibold text-pt-ink'
  const error = (message: string | null) => tried && message && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{message}</p>

  return (
    <PhysioDrawer
      open={open}
      onOpenChange={(next) => !saving && onOpenChange(next)}
      title={exercise ? 'Edit exercise' : 'New exercise'}
      description="Show it once, then send it to any patient."
      footer={
        <button type="button" onClick={submit} disabled={saving || uploading} className={cn(primaryButtonClass, 'flex h-12 w-full items-center justify-center gap-2 text-[15px] font-semibold disabled:opacity-60')}>
          {(saving || uploading) && <Loader2 className="h-4 w-4 animate-spin" />}
          {uploading ? 'Uploading…' : exercise ? 'Save changes' : 'Save exercise'}
        </button>
      }
    >
      <div className="space-y-6">
        {/* 1. Show it */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className={cn(label, 'mb-0')}>Show it</span>
            <div className="inline-flex rounded-full bg-pt-sunken p-1" role="tablist" aria-label="Video or photos">
              {(['video', 'photos'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={mode === option}
                  onClick={() => setMode(option)}
                  disabled={uploading}
                  className={cn('h-8 rounded-full px-3.5 text-sm font-semibold transition', mode === option ? 'bg-pt-surface text-pt-ink shadow-sm' : 'text-pt-muted')}
                >
                  {option === 'video' ? 'Video' : 'Photos'}
                </button>
              ))}
            </div>
          </div>

          {keepExisting && exercise?.ownMedia ? (
            <div className="space-y-2">
              <OwnMediaView exerciseId={exercise._id} name={exercise.name} requestLinks={requestLinks} />
              <div className="flex justify-end">
                <button type="button" onClick={() => setKeepExisting(false)} className="text-sm font-medium text-pt-muted underline-offset-4 hover:text-pt-ink hover:underline">
                  Replace
                </button>
              </div>
            </div>
          ) : video ? (
            <div className="space-y-2">
              <video src={video.preview} controls playsInline className="aspect-video w-full rounded-2xl bg-black object-contain" />
              <div className="flex items-center justify-between text-sm text-pt-muted">
                <span>{formatDuration(video.durationSec)}</span>
                <button type="button" onClick={() => setVideo(null)} className="inline-flex items-center gap-1.5 font-medium hover:text-pt-ink">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          ) : mode === 'photos' && photos.length ? (
            <ul className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <li key={photo.fileId} className="relative aspect-square overflow-hidden rounded-xl bg-pt-sunken">
                  <Image src={photo.preview} alt={`Photo ${i + 1}`} fill unoptimized sizes="120px" className="object-cover" />
                  <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rh-ink text-[11px] font-semibold text-white">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setPhotos((list) => list.filter((p) => p.fileId !== photo.fileId))}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-rh-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
              {photos.length < OWN_MEDIA_LIMITS.photosPerExercise && (
                <li>
                  <button type="button" onClick={() => pickPhotos.current?.click()} disabled={uploading} className={cn(tileClass, 'aspect-square h-full w-full py-0')}>
                    <Plus className="h-5 w-5" />
                    Add
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={uploading} onClick={() => (mode === 'video' ? recordVideo : takePhoto).current?.click()} className={tileClass}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                  <Camera className="h-5 w-5" />
                </span>
                {mode === 'video' ? 'Record video' : 'Take photo'}
              </button>
              <button type="button" disabled={uploading} onClick={() => (mode === 'video' ? pickVideo : pickPhotos).current?.click()} className={tileClass}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pt-surface text-pt-ink ring-1 ring-pt-line">
                  <Upload className="h-5 w-5" />
                </span>
                {mode === 'video' ? 'Upload video' : 'Choose photos'}
              </button>
            </div>
          )}

          {uploading && (
            <div className="mt-3" role="status">
              <div className="h-1.5 overflow-hidden rounded-full bg-pt-sunken">
                <div className="h-full rounded-full bg-rh-lime transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-pt-muted">Uploading… {progress}%</p>
            </div>
          )}
          {!hasMedia && !uploading && (
            <p className="mt-2 text-xs text-pt-muted">Optional. A video up to 5 minutes, or up to 5 photos of the key positions.</p>
          )}

          <input ref={recordVideo} type="file" accept="video/*" capture="environment" hidden onChange={(e) => { void uploadVideo(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={pickVideo} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={(e) => { void uploadVideo(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={takePhoto} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void uploadPhotos(e.target.files); e.target.value = '' }} />
          <input ref={pickPhotos} type="file" accept="image/*" multiple hidden onChange={(e) => { void uploadPhotos(e.target.files); e.target.value = '' }} />
        </section>

        {/* 2. Who appears (only for new media) */}
        {newMedia && (
          <fieldset>
            <legend className={label}>Who appears in it?</legend>
            <div className="space-y-2">
              {(Object.keys(OWN_MEDIA_CONSENT) as OwnMediaConsent[]).map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-2xl p-3.5 text-sm leading-5 ring-1 ring-inset transition',
                    consent === option ? 'bg-pt-sunken ring-pt-ink' : 'ring-pt-line hover:bg-pt-hover'
                  )}
                >
                  <input type="radio" name="own-media-consent" checked={consent === option} onChange={() => setConsent(option)} className="mt-0.5 h-4 w-4 shrink-0 accent-rh-ink" />
                  <span className="text-pt-ink">{OWN_MEDIA_CONSENT[option]}</span>
                </label>
              ))}
            </div>
            {error(problems.consent)}
          </fieldset>
        )}

        {/* 3. Name and steps */}
        <div>
          <label htmlFor="own-exercise-name" className={label}>
            Name
          </label>
          <input id="own-exercise-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Wall slide with towel" className={cn(fieldClass, 'h-11 w-full')} />
          {error(problems.name)}
        </div>

        <div>
          <span className={label}>Steps</span>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rh-lime text-xs font-semibold text-rh-ink">{i + 1}</span>
                <textarea
                  value={step}
                  onChange={(e) => setSteps((list) => list.map((s, j) => (j === i ? e.target.value : s)))}
                  rows={2}
                  maxLength={400}
                  placeholder={i === 0 ? 'Stand facing a wall, towel under your hand.' : 'Next step'}
                  className={cn(fieldClass, 'min-h-[44px] w-full resize-none py-2.5')}
                  aria-label={`Step ${i + 1}`}
                />
                {steps.length > 1 && (
                  <button type="button" onClick={() => setSteps((list) => list.filter((_, j) => j !== i))} aria-label={`Remove step ${i + 1}`} className="mt-2.5 rounded-full p-1.5 text-pt-muted hover:bg-pt-hover hover:text-pt-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {steps.length < 12 && (
            <button type="button" onClick={() => setSteps((list) => [...list, ''])} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-pt-ink hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add a step
            </button>
          )}
          {error(problems.steps)}
        </div>

        {/* 4. Dose */}
        <div>
          <span className={label}>Usual dose</span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['Sets', sets, setSets],
                ['Reps', reps, setReps],
                ['Hold (sec)', hold, setHold],
              ] as const
            ).map(([text, value, set]) => (
              <label key={text} className="text-xs text-pt-muted">
                {text}
                <input inputMode="numeric" value={value} onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder={text === 'Hold (sec)' ? '—' : ''} className={cn(fieldClass, 'mt-1 h-11 w-full text-center text-base text-pt-ink')} />
              </label>
            ))}
          </div>
          {error(problems.dose)}
          <p className="mt-1.5 text-xs text-pt-muted">You can change it for each patient when you send it.</p>
        </div>

        {/* 5. Body area */}
        <div>
          <span className={label}>Body area</span>
          <div className="flex flex-wrap gap-1.5">
            {BODY_AREAS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={area === option}
                onClick={() => setArea(area === option ? null : option)}
                className={cn('rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition', area === option ? 'bg-rh-ink text-white ring-rh-ink dark:bg-white dark:text-rh-ink' : 'text-pt-ink ring-pt-line hover:bg-pt-hover')}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* 6. Library */}
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl bg-pt-sunken p-4">
          <span>
            <span className="block text-sm font-semibold text-pt-ink">Offer it to the Rehabify library</span>
            <span className="mt-0.5 block text-xs leading-5 text-pt-muted">
              {exercise?.libraryShare === 'approved'
                ? 'It’s in the library. Other physios can use it.'
                : 'The Rehabify team reviews it first. Then other physios can send it too.'}
            </span>
          </span>
          <Switch checked={share} onCheckedChange={setShare} disabled={exercise?.libraryShare === 'approved'} />
        </label>
      </div>
    </PhysioDrawer>
  )
}
