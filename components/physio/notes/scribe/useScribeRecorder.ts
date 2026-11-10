'use client'

/**
 * Records one AI scribe session in the browser: one LiveTranscriber per microphone (one for an
 * in-person session or dictation; the physio and the patient separately on a video call, so each
 * line knows who said it), the transcript as it builds, the recording time, and saving the
 * transcript to Convex every few seconds (scribe.appendTranscript) so a closed tab or a dead
 * battery loses at most a few seconds. Keeps the screen awake while recording and warns before
 * the page is left mid-recording.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { LiveTranscriber, ScribeFatalError, type TranscriberMode } from './liveTranscriber'
import { scribeApi, scribeError, type ScribeChannel, type ScribeSessionId, type ScribeSpeaker } from './scribeApi'

export type ScribeInput = { channel: ScribeChannel; speaker?: ScribeSpeaker; stream: MediaStream | null }
export type ScribeLine = { id: string; speaker?: ScribeSpeaker; text: string; final: boolean; at: number }
export type RecorderState = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'stopped'
export type RecorderMode = 'connecting' | 'live' | 'backup' | null

const SAVE_EVERY_MS = 3000
/** A line still not final after this long is saved as it stands (its last words never came) */
const STUCK_LINE_MS = 30_000
const MAX_LINES_PER_SAVE = 50
const MAX_SECONDS_PER_SAVE = 900

/** Opens the microphone for the scribe, with words a physio can act on when it can't. */
export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t use a microphone. Try Chrome on your phone or computer.')
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
  } catch (error) {
    const name = (error as { name?: string } | null)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Allow the microphone for this site (the lock or settings icon by the address), then try again.')
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('No microphone was found. Plug one in or use your phone.')
    if (name === 'NotReadableError') throw new Error('Another app is using the microphone. Close it and try again.')
    throw new Error('The microphone couldn’t start. Try again.')
  }
}

type WakeLockLike = { release: () => Promise<void> }

/** The server said no (switched off, daily limit): retrying won't help. A network error might. */
const fatalFrom = (error: unknown) => (error instanceof ConvexError ? new ScribeFatalError(scribeError(error, 'The scribe stopped.')) : error)

export function useScribeRecorder() {
  const getToken = useAction(scribeApi.token)
  const transcribe = useAction(scribeApi.chunk)
  const append = useMutation(scribeApi.append)

  const [state, setState] = useState<RecorderState>('idle')
  const [mode, setMode] = useState<RecorderMode>(null)
  const [lines, setLines] = useState<ScribeLine[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const sessionId = useRef<ScribeSessionId | null>(null)
  const transcribers = useRef(new Map<ScribeChannel, LiveTranscriber>())
  const modes = useRef(new Map<ScribeChannel, TranscriberMode>())
  const lineMap = useRef(new Map<string, ScribeLine>())
  const saved = useRef(new Set<string>())
  const savedSeconds = useRef(0)
  const baseSeconds = useRef(0)
  const runningSince = useRef<number | null>(null)
  const saving = useRef(false)
  const wakeLock = useRef<WakeLockLike | null>(null)
  const stateRef = useRef<RecorderState>('idle')
  stateRef.current = state

  const seconds = useCallback(() => baseSeconds.current + (runningSince.current ? (Date.now() - runningSince.current) / 1000 : 0), [])

  const publishLines = useCallback(() => {
    setLines([...lineMap.current.values()].sort((a, b) => a.at - b.at))
  }, [])

  const recomputeMode = useCallback(() => {
    const all = [...modes.current.values()].filter((m) => m !== 'stopped')
    setMode(all.length === 0 ? null : all.includes('backup') ? 'backup' : all.every((m) => m === 'live') ? 'live' : 'connecting')
  }, [])

  /** Saves the finished lines not saved yet, in order, with the recording time since the last save. */
  const flush = useCallback(
    async (everything: boolean) => {
      const id = sessionId.current
      if (!id || saving.current) return
      const now = performance.now()
      const ready: ScribeLine[] = []
      for (const line of [...lineMap.current.values()].sort((a, b) => a.at - b.at)) {
        if (saved.current.has(line.id)) continue
        if (!line.final && !everything && now - line.at < STUCK_LINE_MS) break
        ready.push(line)
        if (ready.length >= MAX_LINES_PER_SAVE) break
      }
      const newSeconds = Math.min(MAX_SECONDS_PER_SAVE, Math.max(0, Math.floor(seconds() - savedSeconds.current)))
      if (!ready.length && newSeconds < 30 && !everything) return
      if (!ready.length && newSeconds === 0) return
      saving.current = true
      try {
        await append({
          scribeSessionId: id,
          lines: ready.filter((l) => l.text.trim()).map((l) => ({ speaker: l.speaker, text: l.text.trim() })),
          audioSeconds: newSeconds,
        })
        for (const line of ready) saved.current.add(line.id)
        savedSeconds.current += newSeconds
        setSaveError(null)
      } catch (error) {
        setSaveError(scribeError(error, 'The transcript couldn’t be saved just now. It’s kept here and will try again.'))
      } finally {
        saving.current = false
      }
    },
    [append, seconds]
  )
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Save every few seconds while there's a session, and tick the clock
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused') return
    const save = setInterval(() => void flush(false), SAVE_EVERY_MS)
    const tick = setInterval(() => setElapsed(Math.floor(seconds())), 500)
    return () => {
      clearInterval(save)
      clearInterval(tick)
    }
  }, [state, flush, seconds])

  // Warn before leaving the page mid-recording
  useEffect(() => {
    if (state !== 'recording' && state !== 'paused' && state !== 'stopping') return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  const holdScreen = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } }
      wakeLock.current = (await nav.wakeLock?.request('screen')) ?? null
    } catch {
      wakeLock.current = null
    }
  }, [])
  const releaseScreen = useCallback(() => {
    void wakeLock.current?.release().catch(() => undefined)
    wakeLock.current = null
  }, [])
  // A phone gives the screen lock back when the tab is hidden; take it again on return
  useEffect(() => {
    if (state !== 'recording') return
    const again = () => {
      if (document.visibilityState === 'visible' && !wakeLock.current) void holdScreen()
    }
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [state, holdScreen])

  /** Starts recording these inputs into the scribe session. */
  const start = useCallback(
    async (id: ScribeSessionId, inputs: ScribeInput[], startSeconds = 0) => {
      sessionId.current = id
      lineMap.current = new Map()
      saved.current = new Set()
      modes.current = new Map()
      transcribers.current = new Map()
      baseSeconds.current = startSeconds
      savedSeconds.current = startSeconds
      setLines([])
      setNotice(null)
      setFatal(null)
      setSaveError(null)
      setElapsed(Math.floor(startSeconds))
      setState('starting')
      for (const input of inputs) {
        const transcriber = new LiveTranscriber(
          input.channel,
          {
            getToken: async () => {
              try {
                return await getToken({ scribeSessionId: id, channel: input.channel })
              } catch (error) {
                throw fatalFrom(error)
              }
            },
            transcribeChunk: async (wav) => {
              try {
                return (await transcribe({ scribeSessionId: id, audio: wav, channel: input.channel })).text
              } catch (error) {
                throw fatalFrom(error)
              }
            },
          },
          {
            onSegment: (segment) => {
              lineMap.current.set(segment.id, { ...segment, speaker: input.speaker })
              publishLines()
            },
            onSpeaking: setSpeaking,
            onMode: (m) => {
              modes.current.set(input.channel, m)
              recomputeMode()
            },
            onNotice: setNotice,
            onFatal: (message) => {
              setFatal(message)
              runningSince.current = null
              setState('stopped')
              releaseScreen()
            },
          }
        )
        transcribers.current.set(input.channel, transcriber)
      }
      runningSince.current = Date.now()
      setState('recording')
      void holdScreen()
      await Promise.all(inputs.map((input) => transcribers.current.get(input.channel)!.start(input.stream)))
    },
    [getToken, transcribe, publishLines, recomputeMode, holdScreen, releaseScreen]
  )

  /** The audio for one input changed (mic unmuted, patient rejoined). */
  const setInputStream = useCallback((channel: ScribeChannel, stream: MediaStream | null) => {
    void transcribers.current.get(channel)?.setStream(stream)
  }, [])

  const pause = useCallback(() => {
    if (stateRef.current !== 'recording') return
    for (const t of transcribers.current.values()) t.pause()
    baseSeconds.current = seconds()
    runningSince.current = null
    setState('paused')
    releaseScreen()
  }, [releaseScreen, seconds])

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return
    for (const t of transcribers.current.values()) t.resume()
    runningSince.current = Date.now()
    setState('recording')
    void holdScreen()
  }, [holdScreen])

  /** Stops, waits for the last words, and saves everything. Resolves when it's all saved (or failed). */
  const stop = useCallback(async () => {
    if (stateRef.current !== 'recording' && stateRef.current !== 'paused') return
    setState('stopping')
    baseSeconds.current = seconds()
    runningSince.current = null
    await Promise.all([...transcribers.current.values()].map((t) => t.stop()))
    for (let attempt = 0; attempt < 3; attempt++) {
      await flush(true)
      if ([...lineMap.current.keys()].every((k) => saved.current.has(k))) break
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    }
    releaseScreen()
    setSpeaking(false)
    setElapsed(Math.floor(seconds()))
    setState('stopped')
  }, [flush, releaseScreen, seconds])

  /** Back to the start, for a new recording. */
  const reset = useCallback(() => {
    sessionId.current = null
    lineMap.current = new Map()
    setLines([])
    setNotice(null)
    setFatal(null)
    setSaveError(null)
    setMode(null)
    setElapsed(0)
    setState('idle')
  }, [])

  // Leaving mid-recording (the drawer closed, the call minimised): stop and save what there is.
  // Runs once, on unmount only (refs, so it never fires because a function changed).
  useEffect(() => {
    const current = transcribers
    const lock = wakeLock
    return () => {
      if (stateRef.current === 'recording' || stateRef.current === 'paused') {
        for (const t of current.current.values()) void t.stop()
        void flushRef.current(true)
        void lock.current?.release().catch(() => undefined)
      }
    }
  }, [])

  const unsaved = lines.some((l) => !saved.current.has(l.id) && l.text.trim())
  return { state, mode, lines, speaking, elapsed, notice, fatal, saveError, unsaved, start, setInputStream, pause, resume, stop, reset }
}

export type ScribeRecorder = ReturnType<typeof useScribeRecorder>
