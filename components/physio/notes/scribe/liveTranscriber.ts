/**
 * Turns one microphone (or one side of a video call) into text as people talk.
 *
 * Live mode: the browser streams the audio straight to OpenAI's live transcription over WebRTC,
 * using a short-lived key from Convex (scribe.createRealtimeToken). Words arrive a moment after
 * each pause. If the connection drops it reconnects (twice), then falls back to:
 *
 * Backup mode: the audio is cut into short pieces at natural pauses (public/worklets/scribe-pcm.js)
 * and each piece is sent through Convex (scribe.transcribeChunk), with retries, so a weak
 * connection still gets a full transcript, just a few seconds later.
 *
 * Audio is never stored anywhere: pieces live in memory only until they are transcribed.
 */
import { encodeWav } from './scribeTools'

export type TranscriberMode = 'connecting' | 'live' | 'backup' | 'stopped'

export type TranscriberSegment = {
  /** Unique within the recording */
  id: string
  text: string
  /** False while the words may still change (or are still being transcribed) */
  final: boolean
  /** When the speech started (ms since the page loaded), for ordering across microphones */
  at: number
}

export type TranscriberEvents = {
  onSegment: (segment: TranscriberSegment) => void
  onSpeaking?: (speaking: boolean) => void
  onMode: (mode: TranscriberMode) => void
  /** Something the physio should know (the transcript keeps going where it can) */
  onNotice?: (message: string) => void
  /** Recording can't go on (switched off, daily limit, consent missing): it has stopped */
  onFatal?: (message: string) => void
}

/** Thrown by TranscriberDeps when retrying won't help (the server said no, not the network). */
export class ScribeFatalError extends Error {}

export type TranscriberDeps = {
  getToken: () => Promise<{ clientSecret: string }>
  transcribeChunk: (wav: ArrayBuffer) => Promise<string>
}

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'
const MAX_RECONNECTS = 2
const DROP_GRACE_MS = 4000
const STOP_WAIT_MS = 6000

// Backup mode (blocks of 0.1 s): cut at a pause of 0.7 s once a piece is 3 s long, and always by 20 s
const SILENCE_RMS = 0.012
const PAUSE_BLOCKS = 7
const MIN_PIECE_BLOCKS = 30
const MAX_PIECE_BLOCKS = 200
/** Keep at most ten minutes of audio waiting to be sent; older pieces are dropped (and said so) */
const MAX_QUEUED_BLOCKS = 6000
const RETRY_DELAYS_MS = [1500, 3000, 6000, 10000, 15000, 20000]

let workletLoaded: WeakMap<BaseAudioContext, Promise<void>> | null = null
function loadWorklet(context: AudioContext) {
  workletLoaded ??= new WeakMap()
  let loading = workletLoaded.get(context)
  if (!loading) {
    loading = context.audioWorklet.addModule('/worklets/scribe-pcm.js')
    workletLoaded.set(context, loading)
  }
  return loading
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class LiveTranscriber {
  private stream: MediaStream | null = null
  private mode: TranscriberMode = 'connecting'
  private paused = false
  private stopped = false
  private reconnects = 0

  // Live
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private sender: RTCRtpSender | null = null
  private dropTimer: ReturnType<typeof setTimeout> | null = null
  private items = new Map<string, { at: number; text: string; final: boolean }>()

  // Backup
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private piece: Int16Array[] = []
  private pieceAt = 0
  private quietBlocks = 0
  private queue: { id: string; at: number; blocks: Int16Array[] }[] = []
  private sending = false
  private pieceCount = 0

  constructor(
    private readonly key: string,
    private readonly deps: TranscriberDeps,
    private readonly events: TranscriberEvents
  ) {}

  /** Starts transcribing this stream (it may be null for now, e.g. a muted mic). */
  async start(stream: MediaStream | null) {
    this.stream = stream
    try {
      await this.connectLive()
    } catch (error) {
      if (error instanceof ScribeFatalError) return this.fail(error.message)
      if (!this.stopped) await this.startBackup('The live transcript couldn’t connect, so it’s using backup mode: words appear a few seconds later.')
    }
  }

  private fail(message: string) {
    this.stopped = true
    this.queue = []
    this.piece = []
    this.closeLive()
    this.closeBackup()
    this.setMode('stopped')
    this.events.onFatal?.(message)
  }

  /** The audio to transcribe changed (the mic was unmuted, the patient rejoined). */
  async setStream(stream: MediaStream | null) {
    this.stream = stream
    if (this.mode === 'live') await this.applyTrack()
    else if (this.mode === 'backup') this.connectBackupSource()
  }

  pause() {
    this.paused = true
    if (this.mode === 'live') void this.applyTrack()
    if (this.mode === 'backup') this.cutPiece()
  }

  resume() {
    this.paused = false
    if (this.mode === 'live') void this.applyTrack()
  }

  /** Stops, waiting a moment for the last words to come through. */
  async stop() {
    if (this.stopped) return
    this.paused = true
    if (this.mode === 'live') {
      await this.applyTrack()
      this.send({ type: 'input_audio_buffer.commit' })
      const until = Date.now() + STOP_WAIT_MS
      while (Date.now() < until && [...this.items.values()].some((i) => !i.final)) await sleep(150)
    }
    if (this.mode === 'backup') {
      this.cutPiece()
      const until = Date.now() + 30_000
      while (Date.now() < until && (this.queue.length || this.sending)) await sleep(200)
    }
    this.stopped = true
    // Anything still waiting is shown as it stands
    for (const [id, item] of this.items) if (!item.final) this.emit(id, item.text, true)
    this.closeLive()
    this.closeBackup()
    this.setMode('stopped')
  }

  // ── Live ──────────────────────────────────────────────────────────────────

  private async connectLive() {
    this.setMode('connecting')
    const { clientSecret } = await this.deps.getToken()
    if (this.stopped) return
    const pc = new RTCPeerConnection()
    this.pc = pc
    const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' })
    this.sender = transceiver.sender
    await this.applyTrack()
    const channel = pc.createDataChannel('oai-events')
    this.channel = channel
    channel.onmessage = (event) => {
      try {
        this.handleEvent(JSON.parse(String(event.data)))
      } catch {
        // Not an event we understand
      }
    }
    const opened = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 12_000)
      channel.onopen = () => {
        clearTimeout(timer)
        resolve()
      }
    })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const res = await fetch(REALTIME_CALLS_URL, {
      method: 'POST',
      body: offer.sdp,
      headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
    })
    if (!res.ok) throw new Error(`live transcription refused (${res.status})`)
    await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() })
    await opened
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'connected') {
        if (this.dropTimer) clearTimeout(this.dropTimer)
        this.dropTimer = null
      } else if (state === 'disconnected' || state === 'failed') {
        if (!this.dropTimer) this.dropTimer = setTimeout(() => void this.handleDrop(), state === 'failed' ? 0 : DROP_GRACE_MS)
      }
    }
    channel.onclose = () => {
      if (!this.stopped && this.pc === pc) void this.handleDrop()
    }
    this.setMode('live')
  }

  private async applyTrack() {
    const track = !this.paused ? this.stream?.getAudioTracks().find((t) => t.readyState === 'live') ?? null : null
    try {
      await this.sender?.replaceTrack(track)
    } catch {
      // The connection is closing; nothing to send to
    }
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(event))
  }

  private handleEvent(event: { type?: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string } }) {
    const id = event.item_id
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.events.onSpeaking?.(true)
        if (id && !this.items.has(id)) {
          this.items.set(id, { at: performance.now(), text: '', final: false })
          this.emit(id, '', false)
        }
        break
      case 'input_audio_buffer.speech_stopped':
        this.events.onSpeaking?.(false)
        break
      case 'conversation.item.input_audio_transcription.delta':
        if (id) {
          const item = this.items.get(id) ?? { at: performance.now(), text: '', final: false }
          item.text += event.delta ?? ''
          this.items.set(id, item)
          this.emit(id, item.text, false)
        }
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (id) {
          const item = this.items.get(id) ?? { at: performance.now(), text: '', final: false }
          item.text = (event.transcript ?? item.text).trim()
          item.final = true
          this.items.set(id, item)
          this.emit(id, item.text, true)
        }
        break
      case 'conversation.item.input_audio_transcription.failed':
        if (id) {
          const item = this.items.get(id)
          if (item) {
            item.final = true
            this.emit(id, item.text, true)
          }
        }
        break
    }
  }

  private emit(itemId: string, text: string, final: boolean) {
    const item = this.items.get(itemId)
    this.events.onSegment({ id: `${this.key}:${itemId}`, text, final, at: item?.at ?? performance.now() })
  }

  private async handleDrop() {
    if (this.stopped || this.mode !== 'live') return
    if (this.dropTimer) clearTimeout(this.dropTimer)
    this.dropTimer = null
    this.closeLive()
    // Words still coming for the dropped connection won't arrive: show what we have
    for (const [id, item] of this.items) {
      if (!item.final) {
        item.final = true
        this.emit(id, item.text, true)
      }
    }
    if (this.reconnects < MAX_RECONNECTS) {
      this.reconnects++
      this.events.onNotice?.('The connection dropped. Reconnecting…')
      try {
        await sleep(800 * this.reconnects)
        if (this.stopped) return
        await this.connectLive()
        this.events.onNotice?.('Reconnected. The live transcript is back.')
        return
      } catch {
        this.closeLive()
      }
    }
    if (!this.stopped) await this.startBackup('The connection is weak, so the scribe switched to backup mode: words appear a few seconds later.')
  }

  private closeLive() {
    const pc = this.pc
    this.pc = null
    this.channel = null
    this.sender = null
    try {
      pc?.close()
    } catch {
      // Already closed
    }
  }

  // ── Backup ────────────────────────────────────────────────────────────────

  private async startBackup(notice: string) {
    this.closeLive()
    try {
      const context = new AudioContext()
      this.context = context
      await loadWorklet(context)
      const node = new AudioWorkletNode(context, 'scribe-pcm')
      this.node = node
      node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => this.onBlock(new Int16Array(event.data.pcm), event.data.rms)
      this.connectBackupSource()
      if (context.state === 'suspended') await context.resume()
      this.setMode('backup')
      this.events.onNotice?.(notice)
    } catch {
      this.setMode('stopped')
      this.events.onNotice?.('This browser can’t record for the scribe. Try Chrome, or write the note by hand.')
    }
  }

  private connectBackupSource() {
    if (!this.context || !this.node) return
    try {
      this.source?.disconnect()
    } catch {
      // Not connected
    }
    this.source = null
    const track = this.stream?.getAudioTracks().find((t) => t.readyState === 'live')
    if (!track || !this.stream) return
    this.source = this.context.createMediaStreamSource(new MediaStream([track]))
    this.source.connect(this.node)
  }

  private onBlock(block: Int16Array, rms: number) {
    if (this.paused || this.stopped) return
    if (this.piece.length === 0) {
      // Don't start a piece on silence
      if (rms < SILENCE_RMS) return
      this.pieceAt = performance.now()
      this.pieceCount++
      this.emitPiece(`${this.key}:b${this.pieceCount}`, '', false, this.pieceAt)
    }
    this.piece.push(block)
    this.quietBlocks = rms < SILENCE_RMS ? this.quietBlocks + 1 : 0
    if ((this.piece.length >= MIN_PIECE_BLOCKS && this.quietBlocks >= PAUSE_BLOCKS) || this.piece.length >= MAX_PIECE_BLOCKS) {
      this.cutPiece()
    }
  }

  private cutPiece() {
    if (!this.piece.length) return
    const blocks = this.piece
    this.piece = []
    this.quietBlocks = 0
    this.queue.push({ id: `${this.key}:b${this.pieceCount}`, at: this.pieceAt, blocks })
    let queued = this.queue.reduce((n, p) => n + p.blocks.length, 0)
    while (queued > MAX_QUEUED_BLOCKS && this.queue.length > 1) {
      const dropped = this.queue.shift()!
      queued -= dropped.blocks.length
      this.emitPiece(dropped.id, '[some audio couldn’t be sent]', true, dropped.at)
    }
    void this.drain()
  }

  private async drain() {
    if (this.sending) return
    this.sending = true
    try {
      while (this.queue.length) {
        const piece = this.queue[0]
        let text: string | null = null
        for (let attempt = 0; text === null; attempt++) {
          try {
            text = await this.deps.transcribeChunk(encodeWav(piece.blocks))
          } catch (error) {
            if (error instanceof ScribeFatalError) {
              this.fail(error.message)
              return
            }
            if (attempt >= RETRY_DELAYS_MS.length) {
              text = '[some audio couldn’t be transcribed]'
              break
            }
            if (attempt === 1) this.events.onNotice?.('Waiting for the connection to send the recording…')
            await sleep(RETRY_DELAYS_MS[attempt])
          }
        }
        this.queue.shift()
        this.emitPiece(piece.id, text.trim(), true, piece.at)
      }
    } finally {
      this.sending = false
    }
  }

  private emitPiece(id: string, text: string, final: boolean, at: number) {
    this.events.onSegment({ id, text, final, at })
  }

  private closeBackup() {
    try {
      this.source?.disconnect()
      this.node?.disconnect()
    } catch {
      // Not connected
    }
    this.source = null
    this.node = null
    void this.context?.close().catch(() => undefined)
    this.context = null
  }

  private setMode(mode: TranscriberMode) {
    this.mode = mode
    this.events.onMode(mode)
  }
}
