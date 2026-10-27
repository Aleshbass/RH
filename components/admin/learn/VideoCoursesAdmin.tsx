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
  Trash2,
  UploadCloud,
  X,
} from '@/components/icons'
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
  MAX_VIDEO_BYTES,
  uploadToImagekit,
  videoApi,
  type AdminVideoCourse,
  type AdminVideoLesson,
  type UploadedVideo,
} from '@/components/learn/video/videoApi'
import { playSound } from '@/lib/sounds'
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
  const [title, setTitle] = useState(course?.title ?? '')
  const [summary, setSummary] = useState(course?.summary ?? '')
  const [benefits, setBenefits] = useState<string[]>(course?.benefits.length ? course.benefits : ['', '', ''])
  const [cover, setCover] = useState<{ url: string; fileId: string } | null>(
    course?.coverUrl && course.coverFileId ? { url: course.coverUrl, fileId: course.coverFileId } : null
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

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
        <Button onClick={save} disabled={saving || uploading} className={primaryButtonClass}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {course ? 'Save details' : 'Create course'}
        </Button>
        {onCancel && (
          <Button variant="ghost" className="rounded-xl" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesson drawer: upload a video (with progress), title and notes
// ─────────────────────────────────────────────────────────────────────────────

type UploadState =
  | { stage: 'idle' }
  | { stage: 'reading'; name: string }
  | { stage: 'uploading'; name: string; sizeBytes: number; fraction: number }
  | { stage: 'done'; video: UploadedVideo; name: string }

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
  const uploadAuth = useAction(videoApi.uploadAuth)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [upload, setUpload] = useState<UploadState>({ stage: 'idle' })
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const abort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(lesson?.title ?? '')
    setDescription(lesson?.description ?? '')
    setUpload({ stage: 'idle' })
  }, [open, lesson])

  const busy = upload.stage === 'reading' || upload.stage === 'uploading'

  const pickVideo = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      toast.error('Choose a video file (MP4 works everywhere).')
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(
        `This video is ${formatBytes(file.size)}. Videos must be 100 MB or smaller: export it at 720p, or split it into shorter lessons.`,
        { duration: 9000 }
      )
      return
    }
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim())

    const controller = new AbortController()
    abort.current = controller
    try {
      setUpload({ stage: 'reading', name: file.name })
      const { durationSec, poster } = await inspectVideo(file)
      if (!durationSec) throw new Error('We couldn’t read this video’s length. Try exporting it again as MP4.')

      setUpload({ stage: 'uploading', name: file.name, sizeBytes: file.size, fraction: 0 })
      const videoAuth = await uploadAuth({ kind: 'video' })
      const uploaded = await uploadToImagekit(file, file.name, videoAuth, {
        isPrivate: true,
        signal: controller.signal,
        onProgress: (fraction) => setUpload({ stage: 'uploading', name: file.name, sizeBytes: file.size, fraction }),
      })

      let posterFile: { url: string; fileId: string } | null = null
      if (poster) {
        try {
          const posterAuth = await uploadAuth({ kind: 'poster' })
          posterFile = await uploadToImagekit(poster, file.name.replace(/\.[^.]+$/, '.jpg'), posterAuth, { isPrivate: false })
        } catch {
          // The lesson works without a poster
        }
      }

      setUpload({
        stage: 'done',
        name: file.name,
        video: {
          fileId: uploaded.fileId,
          filePath: uploaded.filePath,
          url: uploaded.url,
          sizeBytes: uploaded.size,
          durationSec,
          posterUrl: posterFile?.url,
          posterFileId: posterFile?.fileId,
        },
      })
      playSound('success')
    } catch (err) {
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
        video: upload.stage === 'done' ? upload.video : undefined,
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

  const canSave = Boolean(title.trim()) && !busy && (Boolean(lesson) || upload.stage === 'done')

  return (
    <AdminDrawer
      open={open}
      onOpenChange={close}
      title={lesson ? 'Edit lesson' : 'Add a lesson'}
      description="Videos upload straight to our video host and stay private: only paid learners can play them."
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
        <Field label="Video" hint="MP4, up to 100 MB. About 15 minutes at 720p fits comfortably.">
          {upload.stage === 'uploading' || upload.stage === 'reading' ? (
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
              <Thumb url={upload.video.posterUrl ?? null} title="" className="aspect-video w-28" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium text-rh-ink dark:text-white">{upload.name}</p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Uploaded · {formatLength(upload.video.durationSec)} · {formatBytes(upload.video.sizeBytes)}
                </p>
              </div>
              <button type="button" onClick={() => fileInput.current?.click()} className="shrink-0 text-xs font-medium text-rh-ink hover:underline dark:text-white">
                Replace
              </button>
            </div>
          ) : (
            <>
              {lesson && (
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
                <span className="text-sm font-medium text-rh-ink dark:text-white">{lesson ? 'Replace the video' : 'Choose a video or drop it here'}</span>
                <span className="text-xs text-neutral-500">MP4 · 100 MB max</span>
              </button>
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    setError(null)
    if (!lesson) return
    let live = true
    getPlayback({ lessonId: lesson.id as LessonId })
      .then((r) => live && setUrl(r.url))
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
        <div className="relative aspect-video bg-rh-ink">
          {url ? (
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
  const [drawer, setDrawer] = useState<{ lesson: AdminVideoLesson | null } | null>(null)
  const [preview, setPreview] = useState<AdminVideoLesson | null>(null)
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | 'delete' | { lesson: AdminVideoLesson } | null>(null)
  const published = course.status === 'published'

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
            <StatusBadge tone={published ? 'green' : 'neutral'}>{published ? 'Published' : 'Draft'}</StatusBadge>
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'} · {formatLength(course.durationSec)} ·{' '}
            {course.learnerCount} {course.learnerCount === 1 ? 'learner' : 'learners'} · {course.completedCount} completed
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {published ? 'Paid MSK learners can watch this now.' : 'Only admins can see it until you publish.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {published ? (
            <Button variant="ghost" className={softButtonClass} onClick={() => setConfirm('unpublish')}>
              Unpublish
            </Button>
          ) : (
            <>
              <Button className={primaryButtonClass} disabled={course.lessonCount === 0} onClick={() => setConfirm('publish')}>
                Publish
              </Button>
              <Button variant="ghost" className="rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-white/[0.06]" onClick={() => setConfirm('delete')}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {!published && course.lessonCount === 0 && (
        <Callout title="Add a lesson to publish">Upload at least one lesson video, then publish the course.</Callout>
      )}

      <Panel
        title="Lessons"
        description="Played in this order. Learners resume where they stopped."
        actions={
          <Button className={primaryButtonClass} onClick={() => setDrawer({ lesson: null })}>
            <Plus className="mr-2 h-4 w-4" /> Add lesson
          </Button>
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
                    {formatLength(lesson.durationSec)} · {formatBytes(lesson.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
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
            ? 'Paid MSK learners will see it under Courses straight away.'
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
  const [selected, setSelected] = useState<CourseId | 'new' | null>(null)

  const header = (
    <PageHeader
      eyebrow="Rehabify Learn"
      title="Video courses"
      description="On-demand courses for physios who paid for the MSK Specialist Program. They watch them under Courses on their course page."
      actions={
        selected === null && courses && courses.length > 0 ? (
          <Button className={primaryButtonClass} onClick={() => setSelected('new')}>
            <Plus className="mr-2 h-4 w-4" /> New course
          </Button>
        ) : undefined
      }
    />
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
            description="Create a course, upload its lessons, then publish it for paid MSK learners."
            action={
              <Button className={primaryButtonClass} onClick={() => setSelected('new')}>
                <Plus className="mr-2 h-4 w-4" /> Create the first course
              </Button>
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
                      <StatusBadge tone={course.status === 'published' ? 'green' : 'neutral'}>
                        {course.status === 'published' ? 'Published' : 'Draft'}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                      {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'} · {formatLength(course.durationSec)}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {course.learnerCount} {course.learnerCount === 1 ? 'learner' : 'learners'} · {course.completedCount} completed
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
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
