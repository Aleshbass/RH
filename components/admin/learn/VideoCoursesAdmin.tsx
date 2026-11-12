'use client'

/**
 * Admin > Rehabify Learn > Video courses. Admins create a course (title, what learners get,
 * cover), add lessons by uploading videos straight to ImageKit, then publish it. Paid MSK
 * learners watch published courses under "Courses" on their course page.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  ImageUp,
  Loader2,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  X,
} from '@/components/icons'
import { useConsoleRole } from '@/components/admin/shell/consoleRole'
import { VideoUploadGuideButton } from '@/components/admin/learn/VideoUploadGuide'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  AdminPage,
  cardClass,
  ConfirmDialog,
  EmptyState,
  inputClass,
  PageHeader,
  Panel,
  primaryButtonClass,
  softButtonClass,
  StatTile,
  StatusBadge,
} from '@/components/admin/ui'
import { Callout, errorMessage, LoadingBlock, textareaClass } from '@/components/admin/partners/shared'
import { AdminDrawer, Field } from '@/components/admin/learn/drawer'
import {
  formatBytes,
  formatLength,
  imagekitLoader,
  inspectVideo,
  protectedVideoApi,
  uploadToImagekit,
  videoApi,
  type VideoAssetId,
  type AdminVideoCourse,
  type CourseAccess,
  type AdminVideoLesson,
  type YoutubeInfo,
  type YoutubeVideo,
} from '@/components/learn/video/videoApi'
import { ProtectedStream, type HlsStream } from '@/components/learn/video/ProtectedStream'
import { playSound } from '@/lib/sounds'
import { COURSE_CATEGORIES, COURSE_LEVELS } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'

type CourseId = Id<'learnVideoCourses'>
type LessonId = Id<'learnVideoLessons'>

/** Shows a toast for a failed action and re-throws, so ConfirmDialog stays open. */
async function withToast(run: () => Promise<unknown>, fallback: string) {
  try {
    await run()
  } catch (err) {
    toast.error(errorMessage(err, fallback))
    throw err
  }
}

/** Shrinks a cover photo to 1600 px WebP in the browser before it's uploaded. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return await new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Couldn’t read that image.'))), 'image/webp', 0.85)
  )
}

function Thumb({ url, title, className }: { url: string | null; title: string; className?: string }) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-xl bg-rh-ink', className)}>
      {url ? (
        <Image src={url} loader={imagekitLoader} alt="" fill sizes="200px" className="object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-end p-2 text-[11px] font-semibold leading-tight text-white/85">{title}</span>
      )}
    </div>
  )
}

/** Published, or for a draft where it is in the instructor review. */
function CourseBadge({ course }: { course: AdminVideoCourse }) {
  if (course.status === 'published') return <StatusBadge tone="green">Published</StatusBadge>
  if (course.reviewStatus === 'in_review') return <StatusBadge tone="amber">In review</StatusBadge>
  if (course.reviewStatus === 'changes_requested') return <StatusBadge tone="red">Changes requested</StatusBadge>
  return <StatusBadge tone="neutral">Draft</StatusBadge>
}

// ─────────────────────────────────────────────────────────────────────────────
// YouTube: paste a link, and the video's title, length and thumbnail come with it
// ─────────────────────────────────────────────────────────────────────────────

const toYoutubeVideo = ({ videoId, durationSec, thumbnailUrl }: YoutubeInfo): YoutubeVideo => ({ videoId, durationSec, thumbnailUrl })

function YoutubeLinkField({ found, onFound }: { found: YoutubeInfo | null; onFound: (info: YoutubeInfo | null) => void }) {
  const lookUp = useAction(videoApi.youtubeInfo)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)

  const check = async (value: string) => {
    if (!value.trim()) return
    setBusy(true)
    try {
      onFound(await lookUp({ link: value }))
    } catch (err) {
      onFound(null)
      toast.error(errorMessage(err, 'Couldn’t read that YouTube link.'))
    } finally {
      setBusy(false)
    }
  }

  if (found) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-rh-honeydew p-3 dark:bg-white/[0.06]">
        <Thumb url={found.thumbnailUrl} title="" className="aspect-video w-28" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="line-clamp-2 font-medium text-rh-ink dark:text-white">{found.title || 'YouTube video'}</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {[found.channel, found.durationSec ? formatLength(found.durationSec) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onFound(null)
            setLink('')
          }}
          className="shrink-0 text-xs font-medium text-rh-ink hover:underline dark:text-white"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <Input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        // Pasting a link looks it up straight away
        onPaste={(e) => {
          const text = e.clipboardData.getData('text').trim()
          if (!text) return
          e.preventDefault()
          setLink(text)
          void check(text)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          void check(link)
        }}
        placeholder="Paste a YouTube link, e.g. https://youtu.be/…"
        aria-label="YouTube link"
        className={inputClass}
        disabled={busy}
      />
      <Button type="button" className={softButtonClass} onClick={() => void check(link)} disabled={busy || !link.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}
      </Button>
    </div>
  )
}

/** A new draft course from one YouTube video: the video is its first lesson, its thumbnail the course picture. */
function YoutubeCourseDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: CourseId) => void
}) {
  const create = useMutation(videoApi.createFromYoutube)
  const [info, setInfo] = useState<YoutubeInfo | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setInfo(null)
    setTitle('')
  }, [open])

  const submit = async () => {
    if (!info) return
    setSaving(true)
    try {
      const id = await create({ title: title.trim() || info.title, summary: info.description || undefined, youtube: toYoutubeVideo(info) })
      toast.success('Draft course created. Add what learners will get, then publish it.')
      playSound('success')
      onOpenChange(false)
      onCreated(id)
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t create the course.'))
      playSound('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg rounded-2xl dark:border-white/10 dark:bg-rh-ink-2">
        <DialogHeader>
          <DialogTitle className="text-rh-ink dark:text-white">New course from a YouTube link</DialogTitle>
          <DialogDescription>
            Paste a video. It becomes the course’s first lesson, and its YouTube thumbnail becomes the course picture. Add more lessons after.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <YoutubeLinkField
            found={info}
            onFound={(found) => {
              setInfo(found)
              if (found && !title.trim()) setTitle(found.title)
            }}
          />
          {info && (
            <Field label="Course title" htmlFor="yt-course-title">
              <Input id="yt-course-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputClass} />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className={primaryButtonClass} onClick={() => void submit()} disabled={!info || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create course
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Course details form (create and edit)
// ─────────────────────────────────────────────────────────────────────────────

function CourseForm({
  course,
  onSaved,
  onCancel,
}: {
  course: AdminVideoCourse | null
  onSaved: (id: CourseId) => void
  onCancel?: () => void
}) {
  const saveCourse = useMutation(videoApi.saveCourse)
  const uploadAuth = useAction(videoApi.uploadAuth)
  const isAdmin = useConsoleRole() === 'admin'
  // Instructors can't change a course that is live or with an admin for review
  const locked = Boolean(course && !course.canEdit)
  const [title, setTitle] = useState(course?.title ?? '')
  const [summary, setSummary] = useState(course?.summary ?? '')
  const [benefits, setBenefits] = useState<string[]>(course?.benefits.length ? course.benefits : ['', '', ''])
  const [cover, setCover] = useState<{ url: string; fileId: string } | null>(
    course?.coverUrl && course.coverFileId ? { url: course.coverUrl, fileId: course.coverFileId } : null
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // Who can watch: included for MSK learners, free for anyone who enrols, or paid
  const [access, setAccess] = useState<CourseAccess>(course?.access ?? 'msk')
  const [rehabifyPrice, setRehabifyPrice] = useState(course?.rehabifyPrice ? String(course.rehabifyPrice) : '')
  const [externalPrice, setExternalPrice] = useState(course?.externalPrice ? String(course.externalPrice) : '')
  // Catalogue card: topic, level and teacher (Learn home and /courses)
  const [category, setCategory] = useState(course?.category ?? '')
  const [level, setLevel] = useState(course?.level ?? '')
  const [instructorName, setInstructorName] = useState(course?.instructor?.name ?? '')
  const [instructorTitle, setInstructorTitle] = useState(course?.instructor?.title ?? '')
  const [instructorPhotoUrl, setInstructorPhotoUrl] = useState(course?.instructor?.photoUrl ?? '')

  const pickCover = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image (JPG, PNG or WebP).')
      return
    }
    setUploading(true)
    try {
      const blob = await shrinkImage(file)
      const auth = await uploadAuth({ kind: 'cover' })
      const uploaded = await uploadToImagekit(blob, file.name.replace(/\.[^.]+$/, '.webp'), auth, { isPrivate: false })
      setCover({ url: uploaded.url, fileId: uploaded.fileId })
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t upload the cover.'))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const id = await saveCourse({
        courseId: course?.id,
        title,
        summary,
        benefits: benefits.map((b) => b.trim()).filter(Boolean),
        coverUrl: cover?.url,
        coverFileId: cover?.fileId,
        // Who can watch and the prices are set by an admin
        ...(isAdmin
          ? {
              access,
              rehabifyPrice: access === 'paid' ? Number(rehabifyPrice.replace(/[^\d.]/g, '')) || undefined : undefined,
              externalPrice: access === 'paid' ? Number(externalPrice.replace(/[^\d.]/g, '')) || undefined : undefined,
            }
          : {}),
        details: {
          category: category || undefined,
          level: level || undefined,
          instructorName: instructorName.trim() || undefined,
          instructorTitle: instructorTitle.trim() || undefined,
          instructorPhotoUrl: instructorPhotoUrl.trim() || undefined,
        },
      })
      toast.success(course ? 'Course saved' : 'Course created. Now add its lessons.')
      playSound('success')
      onSaved(id)
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t save the course.'))
      playSound('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      title={course ? 'Course details' : 'New course'}
      description="What learners see on the course card and course page."
      bodyClassName="px-5 pb-5 pt-3"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Field label="Title" htmlFor="vc-title">
            <Input
              id="vc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Managing knee osteoarthritis"
              className={inputClass}
            />
          </Field>
          <Field label="Short description" htmlFor="vc-summary" hint="Two or three sentences: who it's for and what it covers.">
            <textarea
              id="vc-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={600}
              rows={3}
              className={textareaClass}
            />
          </Field>
          <Field label="What learners will get" hint="One benefit per line. Shown as a checklist on the course page.">
            <div className="space-y-2">
              {benefits.map((benefit, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={benefit}
                    onChange={(e) => setBenefits((list) => list.map((b, j) => (j === i ? e.target.value : b)))}
                    maxLength={160}
                    placeholder={i === 0 ? 'Assess knee OA with confidence' : 'Another benefit'}
                    aria-label={`Benefit ${i + 1}`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setBenefits((list) => list.filter((_, j) => j !== i))}
                    disabled={benefits.length === 1}
                    aria-label={`Remove benefit ${i + 1}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-rh-canvas hover:text-rh-ink disabled:opacity-30 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {benefits.length < 12 && (
                <button
                  type="button"
                  onClick={() => setBenefits((list) => [...list, ''])}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-rh-ink hover:underline dark:text-rh-lime"
                >
                  <Plus className="h-3.5 w-3.5" /> Add a benefit
                </button>
              )}
            </div>
          </Field>
          {isAdmin && (
          <>
          <Field
            label="Who can watch"
            hint={
              access === 'msk'
                ? 'Included for paid MSK Specialist learners, as before.'
                : access === 'free'
                  ? 'Anyone with a Rehabify login enrols in one tap at /learn/courses.'
                  : 'Learners pay with Paystack. Approved Rehabify physiotherapists pay the Rehabify rate.'
            }
          >
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['msk', 'MSK learners'],
                  ['free', 'Free'],
                  ['paid', 'Paid'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAccess(value)}
                  aria-pressed={access === value}
                  className={
                    access === value
                      ? 'rounded-full bg-rh-ink px-4 py-1.5 text-sm font-medium text-white dark:bg-rh-lime dark:text-rh-ink'
                      : 'rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium text-rh-ink hover:border-black/25 dark:border-white/15 dark:text-white'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
          {access === 'paid' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Rehabify physio rate (₦)" htmlFor="vc-price-rehabify">
                <Input
                  id="vc-price-rehabify"
                  inputMode="numeric"
                  value={rehabifyPrice}
                  onChange={(e) => setRehabifyPrice(e.target.value)}
                  placeholder="15000"
                  className={inputClass}
                />
              </Field>
              <Field label="External rate (₦)" htmlFor="vc-price-external">
                <Input
                  id="vc-price-external"
                  inputMode="numeric"
                  value={externalPrice}
                  onChange={(e) => setExternalPrice(e.target.value)}
                  placeholder="25000"
                  className={inputClass}
                />
              </Field>
            </div>
          )}
          </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Topic" htmlFor="vc-category" hint="Where it shows under Browse by topic on Learn.">
              <select id="vc-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="">No topic</option>
                {COURSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Level" htmlFor="vc-level">
              <select id="vc-level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
                <option value="">Not set</option>
                {COURSE_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teacher" htmlFor="vc-teacher" hint="Shown on the course card. Leave empty to hide.">
              <Input
                id="vc-teacher"
                value={instructorName}
                onChange={(e) => setInstructorName(e.target.value)}
                maxLength={80}
                placeholder="Mary Akinwola"
                className={inputClass}
              />
            </Field>
            <Field label="Teacher's credentials" htmlFor="vc-teacher-title">
              <Input
                id="vc-teacher-title"
                value={instructorTitle}
                onChange={(e) => setInstructorTitle(e.target.value)}
                maxLength={80}
                placeholder="BPT, MSc (Oxford)"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Teacher's photo link" htmlFor="vc-teacher-photo" hint="Optional. Copy an image link from Admin › Blog › Media (ik.imagekit.io).">
            <Input
              id="vc-teacher-photo"
              value={instructorPhotoUrl}
              onChange={(e) => setInstructorPhotoUrl(e.target.value)}
              placeholder="https://ik.imagekit.io/…"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Cover image" hint="Landscape works best. Without one, the first lesson's frame is used.">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-rh-canvas dark:bg-white/[0.04]">
            {cover ? (
              <Image src={cover.url} loader={imagekitLoader} alt="" fill sizes="300px" className="object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-400">
                <ImageUp className="h-7 w-7" />
                <span className="text-xs">No cover yet</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-rh-ink/70">
                <Loader2 className="h-6 w-6 animate-spin text-rh-ink dark:text-white" />
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="ghost" className={softButtonClass} disabled={uploading} onClick={() => fileInput.current?.click()}>
              <ImageUp className="mr-2 h-4 w-4" /> {cover ? 'Change' : 'Upload'}
            </Button>
            {cover && (
              <Button type="button" variant="ghost" className="rounded-xl" disabled={uploading} onClick={() => setCover(null)}>
                Remove
              </Button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void pickCover(e.target.files?.[0])} />
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-black/[0.05] pt-5 dark:border-white/[0.06]">
        <Button onClick={save} disabled={saving || uploading || locked} className={primaryButtonClass}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {course ? 'Save details' : 'Create course'}
        </Button>
        {locked && (
          <p className="self-center text-xs text-neutral-500">
            {course?.status === 'published' ? 'Live courses are changed by an admin.' : 'Withdraw it from review to make changes.'}
          </p>
        )}
        {onCancel && (
          <Button variant="ghost" className="rounded-xl" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Panel>
  )
}

/** The encoder takes long lessons; R2 stores up to 8 GB per source here. */
const MAX_PROTECTED_SOURCE_BYTES = 8 * 1024 * 1024 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// Lesson drawer: upload a video (with progress), title and notes
// ─────────────────────────────────────────────────────────────────────────────

type UploadState =
  | { stage: 'idle' }
  | { stage: 'reading'; name: string }
  | { stage: 'uploading'; name: string; sizeBytes: number; fraction: number }
  // Uploaded to the private bucket; the encoder makes the protected stream from it
  | { stage: 'done'; name: string; assetId: VideoAssetId; sizeBytes: number; durationSec: number }

/** One part of a multipart upload, with progress (XHR: fetch can't report upload progress). */
function putPart(url: string, blob: Blob, onBytes: (sent: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => onBytes(e.loaded)
    const onAbort = () => xhr.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    xhr.onload = () => {
      signal.removeEventListener('abort', onAbort)
      const etag = xhr.getResponseHeader('ETag')
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag)
      else reject(new Error(etag ? `Upload failed (${xhr.status}).` : 'The storage bucket isn’t set up for browser uploads yet (CORS).'))
    }
    xhr.onerror = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('The connection dropped during the upload.'))
    }
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    xhr.send(blob)
  })
}

/** The whole file to the private R2 bucket in parts (3 at a time, each retried). */
async function uploadInParts(
  file: File,
  parts: { partNumber: number; url: string }[],
  partBytes: number,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
) {
  const sent = new Map<number, number>()
  const report = () => onProgress([...sent.values()].reduce((a, b) => a + b, 0) / file.size)
  const etags: { partNumber: number; etag: string }[] = []
  const queue = [...parts]
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let part = queue.shift(); part; part = queue.shift()) {
        const blob = file.slice((part.partNumber - 1) * partBytes, part.partNumber * partBytes)
        for (let attempt = 1; ; attempt++) {
          try {
            const etag = await putPart(part.url, blob, (n) => (sent.set(part!.partNumber, n), report()), signal)
            etags.push({ partNumber: part.partNumber, etag })
            break
          } catch (err) {
            if ((err instanceof DOMException && err.name === 'AbortError') || attempt >= 4) throw err
            await new Promise((r) => setTimeout(r, 1500 * attempt))
          }
        }
      }
    })
  )
  return etags
}

function LessonDrawer({
  open,
  onOpenChange,
  courseId,
  lesson,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  courseId: CourseId
  lesson: AdminVideoLesson | null
}) {
  const saveLesson = useMutation(videoApi.saveLesson)
  const startUpload = useAction(protectedVideoApi.startUpload)
  const finishUpload = useAction(protectedVideoApi.finishUpload)
  const abortUpload = useAction(protectedVideoApi.abortUpload)
  const setup = useQuery(protectedVideoApi.setup, open ? {} : 'skip')
  const assets = useQuery(protectedVideoApi.assets, open ? {} : 'skip')
  const [picked, setPicked] = useState<VideoAssetId | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [upload, setUpload] = useState<UploadState>({ stage: 'idle' })
  // Where the lesson plays from: a video uploaded here, or a YouTube video
  const [source, setSource] = useState<'upload' | 'youtube'>('upload')
  const [youtube, setYoutube] = useState<YoutubeInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(lesson?.title ?? '')
    setDescription(lesson?.description ?? '')
    setUpload({ stage: 'idle' })
    setSource(lesson?.youtubeId ? 'youtube' : 'upload')
    setYoutube(null)
    setPicked(null)
  }, [open, lesson])

  const busy = upload.stage === 'reading' || upload.stage === 'uploading'

  const pickVideo = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      toast.error('Choose a video file (MP4 or MOV).')
      return
    }
    if (!setup?.ready) {
      toast.error('Protected video storage isn’t set up yet.')
      return
    }
    if (file.size > MAX_PROTECTED_SOURCE_BYTES) {
      toast.error(`This video is ${formatBytes(file.size)}. Videos must be 8 GB or smaller.`)
      return
    }
    const lessonTitle = title.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
    if (!title.trim()) setTitle(lessonTitle)

    const controller = new AbortController()
    abort.current = controller
    let assetId: VideoAssetId | null = null
    try {
      setUpload({ stage: 'reading', name: file.name })
      const { durationSec } = await inspectVideo(file)
      setUpload({ stage: 'uploading', name: file.name, sizeBytes: file.size, fraction: 0 })
      const started = await startUpload({ title: lessonTitle, fileName: file.name, contentType: file.type, sizeBytes: file.size })
      assetId = started.assetId
      const parts = await uploadInParts(
        file,
        started.parts,
        started.partBytes,
        (fraction) => setUpload({ stage: 'uploading', name: file.name, sizeBytes: file.size, fraction }),
        controller.signal
      )
      await finishUpload({ assetId: started.assetId, parts })
      setUpload({ stage: 'done', name: file.name, assetId: started.assetId, sizeBytes: file.size, durationSec })
      playSound('success')
    } catch (err) {
      if (assetId) void abortUpload({ assetId }).catch(() => {})
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast('Upload cancelled')
      } else {
        toast.error(errorMessage(err, 'The upload failed. Please try again.'))
        playSound('error')
      }
      setUpload({ stage: 'idle' })
    } finally {
      abort.current = null
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveLesson({
        courseId,
        lessonId: lesson?.id,
        title,
        description: description || undefined,
        hlsAssetId: source === 'upload' ? (upload.stage === 'done' ? upload.assetId : (picked ?? undefined)) : undefined,
        youtube: source === 'youtube' && youtube ? toYoutubeVideo(youtube) : undefined,
      })
      toast.success(lesson ? 'Lesson saved' : 'Lesson added')
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t save the lesson.'))
      playSound('error')
    } finally {
      setSaving(false)
    }
  }

  const close = (next: boolean) => {
    if (!next && busy) {
      abort.current?.abort()
    }
    onOpenChange(next)
  }

  // Editing without a new video keeps the current one, as long as it's the same kind
  const hasVideo =
    source === 'youtube'
      ? Boolean(youtube) || Boolean(lesson?.youtubeId)
      : upload.stage === 'done' || Boolean(picked) || Boolean(lesson && !lesson.youtubeId)
  const canSave = Boolean(title.trim()) && !busy && hasVideo

  return (
    <AdminDrawer
      open={open}
      onOpenChange={close}
      title={lesson ? 'Edit lesson' : 'Add a lesson'}
      description="Upload a video (protected: encrypted, only enrolled learners can play it, with their name on screen) or use a YouTube video."
      footer={
        <>
          <Button onClick={save} disabled={!canSave || saving} className={primaryButtonClass}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {lesson ? 'Save lesson' : 'Add lesson'}
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => close(false)}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Video"
          hint={
            source === 'upload'
              ? 'MP4 or MOV, up to 8 GB. After the upload it’s encoded (480p and 720p) and encrypted; the lesson plays once that finishes.'
              : 'A public or unlisted video that allows embedding. Its title, length and thumbnail come from YouTube. Anyone with the link can also watch it on YouTube.'
          }
        >
          <div className="mb-3 inline-flex rounded-full bg-rh-canvas p-1 dark:bg-white/[0.06]" role="radiogroup" aria-label="Where the video comes from">
            {(
              [
                { value: 'upload', label: 'Upload a video' },
                { value: 'youtube', label: 'YouTube link' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={source === option.value}
                onClick={() => setSource(option.value)}
                disabled={busy}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                  source === option.value ? 'bg-white text-rh-ink shadow-sm dark:bg-rh-ink-3 dark:text-white' : 'text-neutral-500 hover:text-rh-ink dark:hover:text-white'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {source === 'youtube' ? (
            <div className="space-y-3">
              {lesson?.youtubeId && !youtube && (
                <div className="flex items-center gap-3 rounded-2xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
                  <Thumb url={lesson.posterUrl} title="" className="aspect-video w-28" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-rh-ink dark:text-white">Current YouTube video</p>
                    <p className="text-xs text-neutral-500">{lesson.durationSec ? formatLength(lesson.durationSec) : 'Length not given by YouTube'}</p>
                  </div>
                </div>
              )}
              <YoutubeLinkField
                found={youtube}
                onFound={(info) => {
                  setYoutube(info)
                  if (info && !title.trim()) setTitle(info.title)
                }}
              />
            </div>
          ) : upload.stage === 'uploading' || upload.stage === 'reading' ? (
            <div className="rounded-2xl border border-black/[0.06] p-4 dark:border-white/10">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-rh-ink dark:text-white">{upload.name}</span>
                <span className="shrink-0 tabular-nums text-neutral-500">
                  {upload.stage === 'reading' ? 'Preparing…' : `${Math.round(upload.fraction * 100)}%`}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-rh-canvas dark:bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-rh-lime transition-[width] duration-300"
                  style={{ width: `${upload.stage === 'uploading' ? Math.max(2, upload.fraction * 100) : 2}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-neutral-500">
                <span>{upload.stage === 'uploading' ? `${formatBytes(upload.sizeBytes * upload.fraction)} of ${formatBytes(upload.sizeBytes)}` : 'Reading the video'}</span>
                <button type="button" onClick={() => abort.current?.abort()} className="font-medium text-rh-ink hover:underline dark:text-white">
                  Cancel upload
                </button>
              </div>
            </div>
          ) : upload.stage === 'done' ? (
            <div className="flex items-center gap-3 rounded-2xl bg-rh-honeydew p-3 dark:bg-white/[0.06]">
              <Thumb url={null} title="" className="aspect-video w-28" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium text-rh-ink dark:text-white">{upload.name}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Uploaded · {formatLength(upload.durationSec)} · {formatBytes(upload.sizeBytes)} · encoding next
                </p>
              </div>
              <button type="button" onClick={() => fileInput.current?.click()} className="shrink-0 text-xs font-medium text-rh-ink hover:underline dark:text-white">
                Replace
              </button>
            </div>
          ) : (
            <>
              {lesson && !lesson.youtubeId && (
                <div className="mb-3 flex items-center gap-3 rounded-2xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
                  <Thumb url={lesson.posterUrl} title="" className="aspect-video w-28" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium text-rh-ink dark:text-white">Current video</p>
                    <p className="text-xs text-neutral-500">
                      {formatLength(lesson.durationSec)} · {formatBytes(lesson.sizeBytes)}
                    </p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  void pickVideo(e.dataTransfer.files?.[0])
                }}
                className={cn(
                  'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition',
                  dragging
                    ? 'border-rh-lime bg-rh-honeydew dark:bg-white/[0.06]'
                    : 'border-black/10 hover:border-rh-ink/30 hover:bg-rh-canvas dark:border-white/15 dark:hover:bg-white/[0.04]'
                )}
              >
                <UploadCloud className="h-7 w-7 text-rh-ink dark:text-white" />
                <span className="text-sm font-medium text-rh-ink dark:text-white">
                  {lesson && !lesson.youtubeId ? 'Replace the video' : 'Choose a video or drop it here'}
                </span>
                <span className="text-xs text-neutral-500">MP4 or MOV · encrypted after upload</span>
              </button>
              {setup && !setup.ready && (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                  Protected video isn’t set up yet. Missing on Convex: {setup.missing.join('; ')}.
                </p>
              )}
              {(() => {
                const free = (assets ?? []).filter((a) => a.status === 'ready' && (!a.lessonId || a.lessonId === lesson?.id))
                if (free.length === 0) return null
                return (
                  <label className="mt-3 block text-xs text-neutral-500">
                    Or choose a video published from the laptop (npm run video:publish)
                    <select
                      value={picked ?? ''}
                      onChange={(e) => setPicked((e.target.value || null) as VideoAssetId | null)}
                      className={cn(inputClass, 'mt-1.5')}
                    >
                      <option value="">Choose a published video</option>
                      {free.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} · {formatLength(a.durationSec)}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })()}
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            className="hidden"
            onChange={(e) => void pickVideo(e.target.files?.[0])}
          />
        </Field>

        <Field label="Lesson title" htmlFor="vl-title">
          <Input id="vl-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={inputClass} />
        </Field>
        <Field label="Notes (optional)" htmlFor="vl-notes" hint="Shown under the video: key points, timestamps or reading.">
          <textarea
            id="vl-notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1500}
            rows={5}
            className={textareaClass}
          />
        </Field>
      </div>
    </AdminDrawer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview a lesson as learners will see it (admins can always play)
// ─────────────────────────────────────────────────────────────────────────────

function PreviewDialog({ lesson, onClose }: { lesson: AdminVideoLesson | null; onClose: () => void }) {
  const getPlayback = useAction(videoApi.playback)
  const [url, setUrl] = useState<string | null>(null)
  const [stream, setStream] = useState<HlsStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUrl(null)
    setStream(null)
    setError(null)
    // YouTube lessons play in YouTube's own player; uploads need a signed link or a protected stream
    if (!lesson || lesson.youtubeId) return
    let live = true
    getPlayback({ lessonId: lesson.id as LessonId })
      .then((r) => {
        if (!live) return
        if (r.hls) setStream(r.hls)
        else setUrl(r.url ?? null)
      })
      .catch((err) => live && setError(errorMessage(err, 'Couldn’t load the video.')))
    return () => {
      live = false
    }
  }, [lesson, getPlayback])

  return (
    <Dialog open={Boolean(lesson)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden rounded-2xl p-0 dark:border-white/10 dark:bg-rh-ink-2">
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle className="pr-6 text-rh-ink dark:text-white">{lesson?.title}</DialogTitle>
          <DialogDescription>Preview. Watching here doesn&apos;t count towards learner numbers.</DialogDescription>
        </DialogHeader>
        <div ref={frameRef} className="relative aspect-video bg-rh-ink">
          {lesson?.youtubeId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
              title={lesson.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          ) : stream && lesson && !error ? (
            <>
              <video ref={videoRef} poster={lesson.posterUrl ?? undefined} controls autoPlay playsInline disablePictureInPicture className="h-full w-full" />
              <ProtectedStream
                stream={stream}
                videoRef={videoRef}
                frameRef={frameRef}
                refresh={async () => (await getPlayback({ lessonId: lesson.id as LessonId })).hls ?? null}
                onFatal={setError}
                onTamper={() => setError('Paused: the watermark was hidden.')}
              />
            </>
          ) : url ? (
            <video src={url} poster={lesson?.posterUrl ?? undefined} controls autoPlay playsInline className="h-full w-full" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/70">
              {error ?? <Loader2 className="h-6 w-6 animate-spin text-white" />}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// One course: publish, details, lessons
// ─────────────────────────────────────────────────────────────────────────────

function CourseManager({ course, onBack }: { course: AdminVideoCourse; onBack: () => void }) {
  const setStatus = useMutation(videoApi.setStatus)
  const deleteCourse = useMutation(videoApi.deleteCourse)
  const moveLesson = useMutation(videoApi.moveLesson)
  const deleteLesson = useMutation(videoApi.deleteLesson)
  const submitCourse = useMutation(videoApi.submitCourse)
  const withdrawCourse = useMutation(videoApi.withdrawCourse)
  const requestChanges = useMutation(videoApi.requestChanges)
  const isAdmin = useConsoleRole() === 'admin'
  const [drawer, setDrawer] = useState<{ lesson: AdminVideoLesson | null } | null>(null)
  const [preview, setPreview] = useState<AdminVideoLesson | null>(null)
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | 'delete' | { lesson: AdminVideoLesson } | null>(null)
  const [changesOpen, setChangesOpen] = useState(false)
  const [changesNote, setChangesNote] = useState('')
  const [busy, setBusy] = useState(false)
  const published = course.status === 'published'
  const inReview = course.reviewStatus === 'in_review'
  const editable = course.canEdit

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(done)
      playSound('success')
    } catch (err) {
      toast.error(errorMessage(err, 'Something went wrong. Please try again.'))
      playSound('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-rh-ink dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All courses
      </button>

      <div className={cn(cardClass, 'flex flex-col gap-4 p-5 sm:flex-row sm:items-center')}>
        <Thumb url={course.coverUrl ?? course.lessons[0]?.posterUrl ?? null} title={course.title} className="aspect-[16/10] w-full sm:w-44" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-rh-ink dark:text-white">{course.title}</h2>
            <CourseBadge course={course} />
          </div>
          {isAdmin && course.instructorName ? (
            <p className="mt-0.5 text-xs font-medium text-neutral-500">By {course.instructorName}, Learn instructor</p>
          ) : null}
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'} · {formatLength(course.durationSec)} ·{' '}
            {course.learnerCount} {course.learnerCount === 1 ? 'learner' : 'learners'} · {course.completedCount} completed
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {isAdmin
              ? published
                ? 'Learners can watch this now.'
                : 'Only admins can see it until you publish.'
              : published
                ? 'Live on Rehabify Learn. To change it, ask an admin to unpublish it.'
                : inReview
                  ? 'With an admin for review. They publish it or send it back with notes.'
                  : 'Only you and the admins can see it. Send it for review when it is ready.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isAdmin ? (
            published ? null : inReview ? (
              <Button variant="ghost" className={softButtonClass} disabled={busy} onClick={() => run(() => withdrawCourse({ courseId: course.id }), 'Taken back from review')}>
                Withdraw
              </Button>
            ) : (
              <>
                <Button
                  className={primaryButtonClass}
                  disabled={busy || course.lessonCount === 0}
                  onClick={() => run(() => submitCourse({ courseId: course.id }), 'Sent for review. An admin will publish it or send notes.')}
                >
                  <Send className="mr-2 h-4 w-4" /> Send for review
                </Button>
                <Button variant="ghost" className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-white/[0.06]" onClick={() => setConfirm('delete')}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              </>
            )
          ) : published ? (
            <Button variant="ghost" className={softButtonClass} onClick={() => setConfirm('unpublish')}>
              Unpublish
            </Button>
          ) : (
            <>
              <Button className={primaryButtonClass} disabled={course.lessonCount === 0} onClick={() => setConfirm('publish')}>
                Publish
              </Button>
              {inReview && (
                <Button variant="ghost" className={softButtonClass} onClick={() => setChangesOpen(true)}>
                  Ask for changes
                </Button>
              )}
              <Button variant="ghost" className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-white/[0.06]" onClick={() => setConfirm('delete')}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {course.reviewStatus === 'changes_requested' && course.reviewNote && (
        <Callout title="Changes requested">{course.reviewNote}</Callout>
      )}
      {!published && course.lessonCount === 0 && (
        <Callout title={isAdmin ? 'Add a lesson to publish' : 'Add a lesson first'}>
          {isAdmin ? 'Upload at least one lesson video, then publish the course.' : 'Upload at least one lesson video, then send the course for review.'}
        </Callout>
      )}

      <Panel
        title="Lessons"
        description="Played in this order. Learners resume where they stopped."
        actions={
          editable ? (
            <Button className={primaryButtonClass} onClick={() => setDrawer({ lesson: null })}>
              <Plus className="mr-2 h-4 w-4" /> Add lesson
            </Button>
          ) : undefined
        }
      >
        {course.lessons.length === 0 ? (
          <EmptyState icon={<PlayCircle />} title="No lessons yet" description="Upload the first video. Learners see lessons in the order you set here." />
        ) : (
          <ol className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {course.lessons.map((lesson, i) => (
              <li key={lesson.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 shrink-0 text-center text-sm tabular-nums text-neutral-400">{i + 1}</span>
                <button type="button" onClick={() => setPreview(lesson)} className="group relative shrink-0" aria-label={`Preview ${lesson.title}`}>
                  <Thumb url={lesson.posterUrl} title="" className="aspect-video w-24" />
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-rh-ink/30 opacity-0 transition group-hover:opacity-100">
                    <Play className="h-4 w-4 text-white" />
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-rh-ink dark:text-white">{lesson.title}</p>
                  <p className="text-xs text-neutral-500">
                    {lesson.youtubeId
                      ? [lesson.durationSec ? formatLength(lesson.durationSec) : null, 'YouTube'].filter(Boolean).join(' · ')
                      : lesson.hosting === 'protected'
                        ? [lesson.durationSec ? formatLength(lesson.durationSec) : null, 'Protected'].filter(Boolean).join(' · ')
                        : `${formatLength(lesson.durationSec)} · ${formatBytes(lesson.sizeBytes)}`}
                  </p>
                  {lesson.processing && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-rh-amber">
                      <Loader2 className="h-3 w-3 animate-spin" /> Encoding and encrypting. It plays once this finishes.
                    </p>
                  )}
                  {lesson.failed && (
                    <p className="mt-0.5 text-xs font-medium text-rose-600">This video couldn&apos;t be encoded. Edit the lesson and upload it again.</p>
                  )}
                </div>
                <div className={cn('flex shrink-0 items-center gap-0.5', !editable && '[&>button:not([aria-label=Preview])]:hidden')}>
                  <IconButton label="Move up" disabled={i === 0} onClick={() => moveLesson({ lessonId: lesson.id, direction: 'up' })}>
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={i === course.lessons.length - 1}
                    onClick={() => moveLesson({ lessonId: lesson.id, direction: 'down' })}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Preview" onClick={() => setPreview(lesson)} className="hidden sm:flex">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Edit" onClick={() => setDrawer({ lesson })}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Delete" onClick={() => setConfirm({ lesson })}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <CourseForm key={course.id} course={course} onSaved={() => {}} />

      <LessonDrawer
        open={drawer !== null}
        onOpenChange={(o) => !o && setDrawer(null)}
        courseId={course.id}
        lesson={drawer?.lesson ?? null}
      />
      <PreviewDialog lesson={preview} onClose={() => setPreview(null)} />

      <Dialog open={changesOpen} onOpenChange={(o) => !busy && setChangesOpen(o)}>
        <DialogContent className="rounded-2xl sm:max-w-lg dark:border-white/10 dark:bg-rh-ink-2">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Ask for changes</DialogTitle>
            <DialogDescription>The instructor sees this note on the course and gets a notification.</DialogDescription>
          </DialogHeader>
          <textarea
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="e.g. Please re-record lesson 2 with clearer audio and add a summary at the end."
            className={textareaClass}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setChangesOpen(false)}>
              Cancel
            </Button>
            <Button
              className={primaryButtonClass}
              disabled={busy || !changesNote.trim()}
              onClick={async () => {
                await run(() => requestChanges({ courseId: course.id, note: changesNote }), 'Sent back to the instructor')
                setChangesOpen(false)
                setChangesNote('')
              }}
            >
              Send to the instructor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === 'publish'
            ? `Publish ${course.title}?`
            : confirm === 'unpublish'
              ? `Unpublish ${course.title}?`
              : confirm === 'delete'
                ? `Delete ${course.title}?`
                : `Delete ${confirm && typeof confirm === 'object' ? confirm.lesson.title : 'this lesson'}?`
        }
        description={
          confirm === 'publish'
            ? 'Learners who can watch it see it under Courses straight away.'
            : confirm === 'unpublish'
              ? 'Learners won’t see it any more. Their progress is kept if you publish it again.'
              : confirm === 'delete'
                ? 'This removes the course, its lessons, their videos and everyone’s progress. It can’t be undone.'
                : 'The video is removed too. It can’t be undone.'
        }
        confirmLabel={confirm === 'publish' ? 'Publish' : confirm === 'unpublish' ? 'Unpublish' : 'Delete'}
        destructive={confirm === 'delete' || (confirm !== null && typeof confirm === 'object')}
        onConfirm={() =>
          withToast(async () => {
            if (confirm === 'publish' || confirm === 'unpublish') {
              await setStatus({ courseId: course.id, status: confirm === 'publish' ? 'published' : 'draft' })
              toast.success(confirm === 'publish' ? 'Course published' : 'Course unpublished')
              playSound('success')
            } else if (confirm === 'delete') {
              await deleteCourse({ courseId: course.id })
              toast.success('Course deleted')
              onBack()
            } else if (confirm) {
              await deleteLesson({ lessonId: confirm.lesson.id })
              toast.success('Lesson deleted')
            }
          }, 'Something went wrong. Please try again.')
        }
      />
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-rh-canvas hover:text-rh-ink disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-white/[0.06] dark:hover:text-white',
        className
      )}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The page
// ─────────────────────────────────────────────────────────────────────────────

export function VideoCoursesAdmin() {
  const courses = useQuery(videoApi.adminCourses, {})
  const moveCourse = useMutation(videoApi.moveCourse)
  const isAdmin = useConsoleRole() === 'admin'
  const [selected, setSelected] = useState<CourseId | 'new' | null>(null)
  const [fromYoutube, setFromYoutube] = useState(false)

  const header = (
    <>
      <PageHeader
        eyebrow="Rehabify Learn"
        title={isAdmin ? 'Video courses' : 'My courses'}
        description={
          isAdmin
            ? 'On-demand courses on Rehabify Learn. Courses from Learn instructors arrive here for review before you publish them.'
            : 'Build your video courses here. When one is ready, send it for review; an admin sets who can watch and publishes it.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {/* Always on hand: how to add a protected lesson video */}
            <VideoUploadGuideButton />
            {selected === null && courses && courses.length > 0 && (
              <>
                <Button className={softButtonClass} onClick={() => setFromYoutube(true)}>
                  <PlayCircle className="mr-2 h-4 w-4" /> From a YouTube link
                </Button>
                <Button className={primaryButtonClass} onClick={() => setSelected('new')}>
                  <Plus className="mr-2 h-4 w-4" /> New course
                </Button>
              </>
            )}
          </div>
        }
      />
      <YoutubeCourseDialog open={fromYoutube} onOpenChange={setFromYoutube} onCreated={(id) => setSelected(id)} />
    </>
  )

  if (courses === undefined) {
    return (
      <AdminPage>
        {header}
        <LoadingBlock />
      </AdminPage>
    )
  }

  if (selected === 'new') {
    return (
      <AdminPage>
        {header}
        <CourseForm course={null} onSaved={(id) => setSelected(id)} onCancel={() => setSelected(null)} />
      </AdminPage>
    )
  }

  const current = selected ? courses.find((c) => c.id === selected) : null
  if (current) {
    return (
      <AdminPage>
        {header}
        <CourseManager course={current} onBack={() => setSelected(null)} />
      </AdminPage>
    )
  }

  const published = courses.filter((c) => c.status === 'published')
  return (
    <AdminPage>
      {header}

      {courses.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon={<PlayCircle />}
            title="No video courses yet"
            description="Create a course and upload its lessons, or start from a YouTube link. Then publish it for paid MSK learners."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button className={primaryButtonClass} onClick={() => setSelected('new')}>
                  <Plus className="mr-2 h-4 w-4" /> Create the first course
                </Button>
                <Button className={softButtonClass} onClick={() => setFromYoutube(true)}>
                  <PlayCircle className="mr-2 h-4 w-4" /> From a YouTube link
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Published" value={`${published.length} of ${courses.length}`} hint="Courses learners can see" />
            <StatTile label="Lessons" value={courses.reduce((n, c) => n + c.lessonCount, 0)} hint={formatLength(courses.reduce((n, c) => n + c.durationSec, 0))} />
            <StatTile label="Learners" value={courses.reduce((n, c) => n + c.learnerCount, 0)} hint="Started a course, counted per course" />
            <StatTile label="Completions" value={courses.reduce((n, c) => n + c.completedCount, 0)} hint="Watched every lesson" />
          </div>

          <div className={cn(cardClass, 'divide-y divide-black/[0.05] overflow-hidden dark:divide-white/[0.06]')}>
            {courses.map((course, i) => (
              <div key={course.id} className="flex items-center gap-4 p-4">
                <button type="button" onClick={() => setSelected(course.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                  <Thumb url={course.coverUrl ?? course.lessons[0]?.posterUrl ?? null} title={course.title} className="aspect-[16/10] w-28 sm:w-36" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-rh-ink dark:text-white">{course.title}</span>
                      <CourseBadge course={course} />
                      {isAdmin && course.instructorName ? (
                        <span className="text-xs font-medium text-neutral-500">by {course.instructorName}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'} · {formatLength(course.durationSec)} ·{' '}
                      {course.access === 'msk'
                        ? 'MSK learners'
                        : course.access === 'free'
                          ? 'Free'
                          : `Paid · ₦${(course.rehabifyPrice ?? 0).toLocaleString('en-NG')} / ₦${(course.externalPrice ?? 0).toLocaleString('en-NG')}`}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {course.access !== 'msk' && `${course.enrolledCount} enrolled · `}
                      {course.learnerCount} {course.learnerCount === 1 ? 'learner' : 'learners'} · {course.completedCount} completed
                    </p>
                  </div>
                </button>
                <div className={cn('flex shrink-0 items-center gap-0.5', !isAdmin && '[&>button:not([aria-label=Open])]:hidden')}>
                  <IconButton label="Move up" disabled={i === 0} onClick={() => moveCourse({ courseId: course.id, direction: 'up' })}>
                    <ArrowUp className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Move down" disabled={i === courses.length - 1} onClick={() => moveCourse({ courseId: course.id, direction: 'down' })}>
                    <ArrowDown className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Open" onClick={() => setSelected(course.id)}>
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminPage>
  )
}
