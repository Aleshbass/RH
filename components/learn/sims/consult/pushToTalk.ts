'use client'

/**
 * Hold to talk to the patient: the microphone captured at 16 kHz mono through the scribe's audio
 * worklet (public/worklets/scribe-pcm.js), handed back as a WAV for learnSimConsult:transcribe.
 * Nothing is kept: the recording only lives until it's sent.
 */

import { encodeWav } from '@/components/physio/notes/scribe/scribeTools'

/** Shorter than this holds no words (an accidental tap). */
const MIN_SECONDS = 0.4
/** Recordings stop here on their own (the server takes up to about a minute). */
export const MAX_SECONDS = 50

export function canPushToTalk() {
  return typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioWorkletNode !== 'undefined'
}

export class PushToTalk {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private blocks: Int16Array[] = []
  private samples = 0
  private timer = 0

  /** Starts listening. `onLevel` gets the loudness (0–1) about ten times a second. */
  async start(onLevel?: (rms: number) => void, onLimit?: () => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const context = new AudioContext()
    this.context = context
    await context.audioWorklet.addModule('/worklets/scribe-pcm.js')
    const node = new AudioWorkletNode(context, 'scribe-pcm')
    this.node = node
    node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      const block = new Int16Array(event.data.pcm)
      this.blocks.push(block)
      this.samples += block.length
      onLevel?.(Math.min(1, event.data.rms * 4))
    }
    this.source = context.createMediaStreamSource(this.stream)
    this.source.connect(node)
    if (context.state === 'suspended') await context.resume()
    this.timer = window.setTimeout(() => onLimit?.(), MAX_SECONDS * 1000)
  }

  /** Stops and returns the recording, or null if it was too short to hold words. */
  async stop(): Promise<ArrayBuffer | null> {
    // Let the last block arrive
    await new Promise((r) => setTimeout(r, 160))
    const blocks = this.blocks
    const samples = this.samples
    this.close()
    if (samples < 16000 * MIN_SECONDS) return null
    return encodeWav(blocks)
  }

  cancel() {
    this.close()
  }

  private close() {
    window.clearTimeout(this.timer)
    try {
      this.source?.disconnect()
      this.node?.disconnect()
    } catch {
      // already disconnected
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.context?.close().catch(() => undefined)
    this.context = null
    this.stream = null
    this.source = null
    this.node = null
    this.blocks = []
    this.samples = 0
  }
}
