'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, ImageIcon, Loader2, Mic, Paperclip, Square, Trash2, X } from '@/components/icons'
import { toast } from 'sonner'
import type { Id } from '@/convex/_generated/dataModel'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import { cn } from '@/lib/utils'

const MAX_ATTACHMENTS = 10
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_RECORDING_SECONDS = 10 * 60
const ACCEPT = 'image/*,application/pdf,.doc,.docx'

type Attachment = { storageId: Id<'_storage'>; name: string; size: number }
type VoiceNote = { storageId: Id<'_storage'>; previewUrl: string; seconds: number }

function pickAudioType() {
  if (typeof MediaRecorder === 'undefined') return undefined
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((type) => MediaRecorder.isTypeSupported(type))
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Voice note + attachment state for a clinical note. Upload happens as soon as a file is picked or a recording stops. */
export function useNoteMedia() {
  const { uploadFile } = useFileUpload()
  const [voice, setVoice] = useState<VoiceNote | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [uploading, setUploading] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewRef = useRef<string | null>(null)

  const canRecord =
    typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.onstop = null
        recorderRef.current.stop()
      }
      releaseMic()
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [releaseMic]
  )

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const startRecording = useCallback(async () => {
    if (!canRecord) {
      toast.error('This browser can’t record audio. Try Chrome, Edge or Safari.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      toast.error('Allow microphone access in your browser to record a voice note.')
      return
    }
    streamRef.current = stream
    const mimeType = pickAudioType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks: Blob[] = []
    const startedAt = Date.now()

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = async () => {
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      releaseMic()
      setRecording(false)
      const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0]
      const blob = new Blob(chunks, { type })
      if (blob.size === 0) {
        toast.error('Nothing was recorded. Check your microphone and try again.')
        return
      }
      const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `voice-note-${startedAt}.${extension}`, { type })
      setUploading(true)
      try {
        const { storageId } = await uploadFile(file)
        if (previewRef.current) URL.revokeObjectURL(previewRef.current)
        previewRef.current = URL.createObjectURL(blob)
        setVoice({ storageId, previewUrl: previewRef.current, seconds })
      } catch {
        toast.error('Couldn’t upload the voice note. Try recording again.')
      } finally {
        setUploading(false)
      }
    }

    recorderRef.current = recorder
    recorder.start()
    setElapsed(0)
    setRecording(true)
    timerRef.current = setInterval(() => {
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_RECORDING_SECONDS) recorder.stop()
    }, 250)
  }, [canRecord, releaseMic, uploadFile])

  const removeVoice = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setVoice(null)
  }, [])

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      const room = MAX_ATTACHMENTS - attachments.length
      const picked = Array.from(files)
      if (picked.length > room) toast.error(`You can attach up to ${MAX_ATTACHMENTS} files to a note.`)
      setUploading(true)
      try {
        for (const file of picked.slice(0, Math.max(0, room))) {
          if (file.size > MAX_FILE_BYTES) {
            toast.error(`${file.name} is larger than 20 MB.`)
            continue
          }
          try {
            const { storageId } = await uploadFile(file)
            setAttachments((current) => [...current, { storageId, name: file.name, size: file.size }])
          } catch {
            toast.error(`Couldn’t upload ${file.name}.`)
          }
        }
      } finally {
        setUploading(false)
      }
    },
    [attachments.length, uploadFile]
  )

  const removeAttachment = useCallback((storageId: Id<'_storage'>) => {
    setAttachments((current) => current.filter((a) => a.storageId !== storageId))
  }, [])

  const reset = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null
      recorderRef.current.stop()
    }
    releaseMic()
    setRecording(false)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setVoice(null)
    setAttachments([])
  }, [releaseMic])

  return {
    reset,
    voice,
    attachments,
    recording,
    elapsed,
    uploading,
    busy: recording || uploading,
    canRecord,
    startRecording,
    stopRecording,
    removeVoice,
    addFiles,
    removeAttachment,
    hasMedia: Boolean(voice) || attachments.length > 0,
    voiceStorageId: voice?.storageId,
    attachmentIds: attachments.map((a) => a.storageId),
  }
}

export type NoteMedia = ReturnType<typeof useNoteMedia>

/** Record / attach buttons plus what's been added so far. */
export function NoteMediaControls({ media, className }: { media: NoteMedia; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const chip =
    'inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3.5 py-2 text-sm font-medium text-rh-night transition-all hover:border-rh-teal/40 hover:bg-rh-mist active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]'

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {media.recording ? (
          <button type="button" onClick={media.stopRecording} className={cn(chip, 'border-rose-300 bg-rh-blush text-rose-700 dark:bg-rose-500/10 dark:text-rose-300')}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
            </span>
            Stop · {formatSeconds(media.elapsed)}
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={media.startRecording}
            disabled={media.uploading || Boolean(media.voice) || !media.canRecord}
            title={!media.canRecord ? 'Recording isn’t supported in this browser' : media.voice ? 'Remove the current voice note to record a new one' : undefined}
            className={chip}
          >
            <Mic className="h-4 w-4 text-rh-teal dark:text-rh-aqua" />
            Voice note
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={media.busy || media.attachments.length >= MAX_ATTACHMENTS}
          className={chip}
        >
          <Paperclip className="h-4 w-4 text-rh-teal dark:text-rh-aqua" />
          Attach files
        </button>
        {media.uploading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void media.addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {media.voice && (
        <div className="flex items-center gap-2 rounded-2xl bg-rh-mist p-2 pl-3 dark:bg-white/[0.05]">
          <Mic className="h-4 w-4 shrink-0 text-rh-teal dark:text-rh-aqua" />
          <audio controls src={media.voice.previewUrl} className="h-9 min-w-0 flex-1" />
          <button
            type="button"
            onClick={media.removeVoice}
            aria-label="Remove voice note"
            className="rounded-full p-2 text-neutral-500 hover:bg-white hover:text-rose-600 dark:hover:bg-white/10"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {media.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {media.attachments.map((file) => (
            <li
              key={file.storageId}
              className="inline-flex max-w-full items-center gap-2 rounded-full bg-rh-canvas py-1.5 pl-3 pr-1.5 text-xs text-rh-night dark:bg-white/[0.05] dark:text-white"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-rh-teal dark:text-rh-aqua" />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-neutral-400">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => media.removeAttachment(file.storageId)}
                aria-label={`Remove ${file.name}`}
                className="rounded-full p-1 text-neutral-500 hover:bg-white hover:text-rose-600 dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Read-only view of a saved note's voice note and attachments. */
export function NoteMediaView({
  voiceNote,
  attachments,
}: {
  voiceNote?: string | null
  attachments?: { url: string; contentType: string | null; size: number }[]
}) {
  if (!voiceNote && !attachments?.length) return null
  return (
    <div className="space-y-2 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
      {voiceNote && (
        <div className="flex items-center gap-2 rounded-2xl bg-rh-mist p-2 pl-3 dark:bg-white/[0.05]">
          <Mic className="h-4 w-4 shrink-0 text-rh-teal dark:text-rh-aqua" />
          <audio controls preload="none" src={voiceNote} className="h-9 min-w-0 flex-1" />
        </div>
      )}
      {attachments && attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((file, index) => {
            const isImage = file.contentType?.startsWith('image/')
            const kind = isImage ? 'Image' : file.contentType === 'application/pdf' ? 'PDF' : 'File'
            const Icon = isImage ? ImageIcon : FileText
            return (
              <li key={file.url}>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-rh-canvas px-3 py-1.5 text-xs font-medium text-rh-night transition-colors hover:bg-rh-mist dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/10"
                >
                  <Icon className="h-3.5 w-3.5 text-rh-teal dark:text-rh-aqua" />
                  {kind} {index + 1}
                  <span className="text-neutral-400">{formatBytes(file.size)}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
