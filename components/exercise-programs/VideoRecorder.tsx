'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, SwitchCamera, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { extensionFor, recorderOptions } from '@/lib/video/shrink'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const MAX_SECONDS = 90

/**
 * Records an exercise video in the app, full screen: live camera, a 3-second countdown, up to
 * 90 seconds at 720p and about 1.6 Mbps (under 20 MB). Phones' own camera apps record far bigger
 * files, so this is the main way to film an exercise. Hands back a File when done.
 */
export function VideoRecorder({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (file: File) => void }) {
  const preview = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  // Closing mid-recording throws the clip away
  const discard = useRef(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [phase, setPhase] = useState<'starting' | 'ready' | 'countdown' | 'recording' | 'saving' | 'error'>('starting')
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase('starting')
    setError(null)
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        audio: true,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stopStream()
        stream.current = s
        if (preview.current) {
          preview.current.srcObject = s
          void preview.current.play().catch(() => undefined)
        }
        setPhase('ready')
      })
      .catch(() => {
        if (cancelled) return
        setError('Allow camera and microphone access in your browser settings, then try again.')
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [open, facing, stopStream])

  // Release the camera when the recorder closes
  useEffect(() => {
    if (open) {
      discard.current = false
      return
    }
    discard.current = true
    if (recorder.current?.state === 'recording') recorder.current.stop()
    stopStream()
    setElapsed(0)
  }, [open, stopStream])

  const finish = useCallback(() => {
    if (recorder.current?.state === 'recording') {
      setPhase('saving')
      recorder.current.stop()
    }
  }, [])

  useEffect(() => {
    if (phase === 'countdown') {
      if (count === 0) {
        const s = stream.current
        if (!s) return
        chunks.current = []
        const options = recorderOptions()
        const r = new MediaRecorder(s, options)
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
        r.onstop = () => {
          if (discard.current) return stopStream()
          const type = (r.mimeType || options.mimeType || 'video/webm').split(';')[0]
          const file = new File([new Blob(chunks.current, { type })], `exercise.${extensionFor(type)}`, { type })
          stopStream()
          playSound('success')
          onDone(file)
        }
        recorder.current = r
        r.start(1000)
        setElapsed(0)
        setPhase('recording')
        return
      }
      const t = setTimeout(() => setCount((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
    if (phase === 'recording') {
      const t = setInterval(() => setElapsed((e) => e + 1), 1000)
      return () => clearInterval(t)
    }
  }, [phase, count, onDone, stopStream])

  useEffect(() => {
    if (phase === 'recording' && elapsed >= MAX_SECONDS) finish()
  }, [phase, elapsed, finish])

  if (!open) return null
  const left = MAX_SECONDS - elapsed

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Record an exercise video">
      <div className="relative min-h-0 flex-1">
        <video ref={preview} muted playsInline className={cn('h-full w-full object-cover', facing === 'user' && '-scale-x-100')} />
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="text-[120px] font-semibold tabular-nums leading-none">{count}</span>
          </div>
        )}
        {(phase === 'starting' || phase === 'saving') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-sm">
            <Loader2 className="h-6 w-6 animate-spin" />
            {phase === 'saving' ? 'Saving your video…' : 'Opening the camera…'}
          </div>
        )}
        {phase === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-[15px] leading-relaxed">{error}</div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
          {phase === 'recording' && (
            <span className="inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-sm font-semibold tabular-nums">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              <span className="font-normal opacity-70">· {left}s left</span>
            </span>
          )}
          {phase === 'ready' ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              aria-label="Switch camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>
          ) : (
            <span className="h-10 w-10" />
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-3 bg-black px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <p className="text-center text-xs text-white/60">
          {phase === 'recording' ? 'Tap to stop' : 'Prop the phone up, step back, and show the whole movement. Up to 90 seconds.'}
        </p>
        <button
          type="button"
          disabled={phase !== 'ready' && phase !== 'recording'}
          onClick={() => {
            if (phase === 'ready') {
              setCount(3)
              setPhase('countdown')
            } else if (phase === 'recording') finish()
          }}
          aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white/90 transition active:scale-95 disabled:opacity-40"
        >
          <span className={cn('bg-rose-500 transition-all', phase === 'recording' ? 'h-7 w-7 rounded-md' : 'h-[58px] w-[58px] rounded-full')} />
        </button>
      </div>
    </div>
  )
}
