/**
 * Video courses: Convex function references, types, ImageKit uploads and small formatters,
 * shared by the learner's Courses tab and the admin page.
 */

import { makeFunctionReference } from 'convex/server'
import type { adminVideoCourses, getCourseCatalog, getCourseOfferPage, getVideoCourse, getVideoLibrary } from '@/convex/learn'
import type { Id } from '@/convex/_generated/dataModel'
import type { QueryResult } from '@/lib/convexUntyped'

export type VideoLibrary = QueryResult<typeof getVideoLibrary>
export type VideoCourseCard = Extract<VideoLibrary, { state: 'ok' }>['courses'][number]
export type VideoCourse = NonNullable<QueryResult<typeof getVideoCourse>>
export type VideoLesson = VideoCourse['lessons'][number]
export type AdminVideoCourse = QueryResult<typeof adminVideoCourses>[number]
export type AdminVideoLesson = AdminVideoCourse['lessons'][number]
export type CourseOffer = QueryResult<typeof getCourseCatalog>[number]
export type CourseOfferPage = NonNullable<QueryResult<typeof getCourseOfferPage>>
export type CourseAccess = 'msk' | 'free' | 'paid'

type CourseId = Id<'learnVideoCourses'>
type LessonId = Id<'learnVideoLessons'>
type Direction = 'up' | 'down'

/** A YouTube video as a lesson: its id, length (0 when YouTube didn't say) and YouTube's thumbnail. */
export type YoutubeVideo = { videoId: string; durationSec: number; thumbnailUrl: string }
export type YoutubeInfo = YoutubeVideo & { title: string; channel: string; description: string }

export type UploadedVideo = {
  fileId: string
  filePath: string
  url: string
  sizeBytes: number
  durationSec: number
  posterUrl?: string
  posterFileId?: string
}

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
export const videoApi = {
  library: makeFunctionReference<'query', Record<string, never>, VideoLibrary>('learn:getVideoLibrary'),
  course: makeFunctionReference<'query', { courseId: CourseId }, VideoCourse | null>('learn:getVideoCourse'),
  playback: makeFunctionReference<'action', { lessonId: LessonId }, { url: string; expiresAt: number }>('learn:getLessonPlayback'),
  // Enrolment: the public catalogue, one course's page, a free enrol and Paystack for paid ones
  catalog: makeFunctionReference<'query', Record<string, never>, CourseOffer[]>('learn:getCourseCatalog'),
  offer: makeFunctionReference<'query', { courseId: string }, CourseOfferPage | null>('learn:getCourseOfferPage'),
  enrolFree: makeFunctionReference<'mutation', { courseId: CourseId }, { enrolled: boolean; alreadyEnrolled: boolean }>(
    'learn:enrollInFreeCourse'
  ),
  startPayment: makeFunctionReference<
    'action',
    { courseId: CourseId; returnOrigin?: string },
    { authorizationUrl: string; reference: string }
  >('learn:startCoursePayment'),
  verifyPayment: makeFunctionReference<'action', { reference: string }, { status: 'paid' | 'pending' | 'failed' }>(
    'learn:verifyCoursePayment'
  ),
  saveProgress: makeFunctionReference<
    'mutation',
    { lessonId: LessonId; positionSec: number; completed: boolean },
    { completedCourse: boolean }
  >('learn:saveLessonProgress'),

  adminCourses: makeFunctionReference<'query', Record<string, never>, AdminVideoCourse[]>('learn:adminVideoCourses'),
  uploadAuth: makeFunctionReference<
    'action',
    { kind: 'video' | 'poster' | 'cover' },
    { token: string; expire: number; signature: string; publicKey: string; folder: string }
  >('learn:adminVideoUploadAuth'),
  saveCourse: makeFunctionReference<
    'mutation',
    {
      courseId?: CourseId
      title: string
      summary: string
      benefits: string[]
      coverUrl?: string
      coverFileId?: string
      access?: CourseAccess
      rehabifyPrice?: number
      externalPrice?: number
    },
    CourseId
  >('learn:adminSaveVideoCourse'),
  setStatus: makeFunctionReference<'mutation', { courseId: CourseId; status: 'draft' | 'published' }, null>(
    'learn:adminSetVideoCourseStatus'
  ),
  moveCourse: makeFunctionReference<'mutation', { courseId: CourseId; direction: Direction }, null>('learn:adminMoveVideoCourse'),
  deleteCourse: makeFunctionReference<'mutation', { courseId: CourseId }, null>('learn:adminDeleteVideoCourse'),
  // Learn instructors send a draft for review; an admin publishes it or asks for changes
  submitCourse: makeFunctionReference<'mutation', { courseId: CourseId }, null>('learn:submitVideoCourse'),
  withdrawCourse: makeFunctionReference<'mutation', { courseId: CourseId }, null>('learn:withdrawVideoCourse'),
  requestChanges: makeFunctionReference<'mutation', { courseId: CourseId; note: string }, null>('learn:requestVideoCourseChanges'),
  saveLesson: makeFunctionReference<
    'mutation',
    { courseId: CourseId; lessonId?: LessonId; title: string; description?: string; video?: UploadedVideo; youtube?: YoutubeVideo },
    LessonId
  >('learn:adminSaveVideoLesson'),
  youtubeInfo: makeFunctionReference<'action', { link: string }, YoutubeInfo>('learn:adminYoutubeInfo'),
  createFromYoutube: makeFunctionReference<'mutation', { title: string; summary?: string; youtube: YoutubeVideo }, CourseId>(
    'learn:adminCreateCourseFromYoutube'
  ),
  moveLesson: makeFunctionReference<'mutation', { lessonId: LessonId; direction: Direction }, null>('learn:adminMoveVideoLesson'),
  deleteLesson: makeFunctionReference<'mutation', { lessonId: LessonId }, null>('learn:adminDeleteVideoLesson'),
}

/** ImageKit's free plan limit for one video file. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024

/** next/image loader: ImageKit resizes and compresses covers and posters itself. */
export function imagekitLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  return `${src}${src.includes('?') ? '&' : '?'}tr=w-${width},q-${quality ?? 75}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/** "1 h 45 min", "12 min", "45 sec": for course and lesson lengths. */
export function formatLength(totalSec: number) {
  const sec = Math.max(0, Math.round(totalSec))
  if (sec < 60) return `${sec} sec`
  const minutes = Math.round(sec / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "4:32" or "1:02:10": a clock-style time for resume points. */
export function formatClock(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** "128 physios have taken this" style count; null when nobody has started yet. */
export function learnersLabel(count: number) {
  if (count <= 0) return null
  return `${count.toLocaleString('en-NG')} ${count === 1 ? 'physio has' : 'physios have'} taken this`
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploads (admin only: the signature comes from an admin-checked action)
// ─────────────────────────────────────────────────────────────────────────────

type UploadAuth = { token: string; expire: number; signature: string; publicKey: string; folder: string }
export type ImagekitFile = { fileId: string; filePath: string; url: string; size: number }

/** ImageKit keeps the name in the URL, so keep it to safe characters. */
function safeName(name: string, fallbackExt: string) {
  const dot = name.lastIndexOf('.')
  const ext = (dot > 0 ? name.slice(dot + 1) : fallbackExt).toLowerCase().replace(/[^a-z0-9]/g, '') || fallbackExt
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'file'}.${ext}`
}

/**
 * Uploads one file straight from the browser to ImageKit, reporting progress (0 to 1).
 * `isPrivate` files can only be opened through signed links.
 */
export function uploadToImagekit(
  file: Blob,
  name: string,
  auth: UploadAuth,
  options: { isPrivate: boolean; onProgress?: (fraction: number) => void; signal?: AbortSignal }
): Promise<ImagekitFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('fileName', safeName(name, file.type.startsWith('video/') ? 'mp4' : 'jpg'))
    form.append('publicKey', auth.publicKey)
    form.append('signature', auth.signature)
    form.append('expire', String(auth.expire))
    form.append('token', auth.token)
    form.append('folder', auth.folder)
    form.append('useUniqueFileName', 'true')
    if (options.isPrivate) form.append('isPrivateFile', 'true')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // handled below
      }
      if (xhr.status >= 200 && xhr.status < 300 && typeof body.fileId === 'string' && typeof body.url === 'string') {
        resolve({
          fileId: body.fileId,
          filePath: String(body.filePath ?? ''),
          url: body.url,
          size: Number(body.size) || file.size,
        })
      } else {
        reject(new Error(typeof body.message === 'string' ? body.message : 'The upload failed. Please try again.'))
      }
    }
    xhr.onerror = () => reject(new Error('The upload stopped. Check your connection and try again.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(form)
  })
}

/**
 * Reads a video's length and grabs a frame for its poster, in the browser, so nothing extra
 * has to be processed (or paid for) on the video host.
 */
export function inspectVideo(file: File): Promise<{ durationSec: number; poster: Blob | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = url
    const done = (result: { durationSec: number; poster: Blob | null }) => {
      URL.revokeObjectURL(url)
      resolve(result)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This file can’t be played in the browser. Use an MP4 (H.264) video.'))
    }
    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) ? video.duration : 0
      if (!durationSec) return done({ durationSec: 0, poster: null })
      // A frame a little way in avoids black opening frames
      video.currentTime = Math.min(Math.max(durationSec * 0.1, 1), durationSec / 2)
      video.onseeked = () => {
        const width = Math.min(1280, video.videoWidth || 1280)
        const height = Math.round(width * ((video.videoHeight || 720) / (video.videoWidth || 1280)))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) return done({ durationSec, poster: null })
        context.drawImage(video, 0, 0, width, height)
        canvas.toBlob((blob) => done({ durationSec, poster: blob }), 'image/jpeg', 0.82)
      }
    }
  })
}
