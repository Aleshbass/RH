/**
 * Video size helpers for physios' own exercise videos (20 MB each, lib/ownExerciseMedia.ts).
 *
 * - recorderOptions(): what MediaRecorder should record so a clip stays small (720p, about
 *   1.6 Mbps, which is about 12 MB a minute).
 * - shrinkVideo(): re-encodes a file that's too big, in the browser. It plays the video into a
 *   canvas at up to 720p and records that at a bitrate worked out from the length, so it takes
 *   as long as the video does. Phones' own camera apps record around 100 MB a minute, which is
 *   why the in-app recorder is the main way in and this is the fallback.
 */

export const RECORD_VIDEO_BPS = 1_600_000
export const RECORD_AUDIO_BPS = 64_000

const TYPES = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

export function canRecordInApp() {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function recorderMimeType() {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return undefined
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t))
}

export function recorderOptions(videoBitsPerSecond = RECORD_VIDEO_BPS): MediaRecorderOptions {
  const mimeType = recorderMimeType()
  return { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond, audioBitsPerSecond: RECORD_AUDIO_BPS }
}

export function extensionFor(mimeType: string) {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

/** Whether this browser can shrink a video (canvas capture and MediaRecorder). */
export function canShrinkVideo() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  )
}

/**
 * Re-encodes `file` to fit `maxBytes` (with a little headroom). `onProgress` gets 0–1 as it plays
 * through. Throws if the browser can't, or if the result is still too big.
 */
export async function shrinkVideo(file: File, maxBytes: number, onProgress?: (fraction: number) => void): Promise<File> {
  if (!canShrinkVideo()) throw new Error('This browser can’t shrink videos.')
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.playsInline = true
  video.preload = 'auto'
  // Sound goes into the recording only (through Web Audio), not out of the speakers
  video.muted = false
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('That video couldn’t be read.'))
    })
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('That video couldn’t be read.')

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2)
    canvas.height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2)
    const draw = canvas.getContext('2d')!

    // Leave 8% headroom for the container and audio
    const bps = Math.max(400_000, Math.min(RECORD_VIDEO_BPS, Math.floor(((maxBytes * 8) / duration) * 0.92) - RECORD_AUDIO_BPS))
    const stream = canvas.captureStream(30)
    let audio: AudioContext | null = null
    try {
      audio = new AudioContext()
      const source = audio.createMediaElementSource(video)
      const destination = audio.createMediaStreamDestination()
      source.connect(destination)
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track))
    } catch {
      // No audio track: the video still shrinks
    }

    const options = recorderOptions(bps)
    const recorder = new MediaRecorder(stream, options)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))

    let frame = 0
    const paint = () => {
      draw.drawImage(video, 0, 0, canvas.width, canvas.height)
      onProgress?.(Math.min(1, video.currentTime / duration))
      if (!video.ended) frame = requestAnimationFrame(paint)
    }
    recorder.start(1000)
    try {
      await video.play()
    } catch {
      // Autoplay with sound refused: shrink it without sound rather than not at all
      video.muted = true
      await video.play()
    }
    paint()
    await new Promise<void>((resolve) => (video.onended = () => resolve()))
    cancelAnimationFrame(frame)
    recorder.stop()
    await stopped
    await audio?.close().catch(() => undefined)
    stream.getTracks().forEach((t) => t.stop())

    const type = options.mimeType?.split(';')[0] ?? 'video/webm'
    const blob = new Blob(chunks, { type })
    if (blob.size > maxBytes) throw new Error('Still too big after shrinking. Trim it to under a minute and try again.')
    const base = file.name.replace(/\.[^.]+$/, '') || 'exercise'
    return new File([blob], `${base}-small.${extensionFor(type)}`, { type })
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}
