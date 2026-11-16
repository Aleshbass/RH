'use client'

/**
 * Louder Spaces for listeners (owner 2026-11-16: "the sound wasn't very audible"). Each voice goes
 * through a gentle compressor (evens out quiet and loud speakers, stops clipping) and a gain boost,
 * via Web Audio. The plain <audio> element stays attached (Chrome needs it for the stream to flow)
 * but muted while Web Audio is running; if Web Audio isn't available or is asleep, the element plays
 * the voice as normal, so nobody ever hears silence.
 *
 * Only while your own mic is off: with a live mic, boosted output could reach the mic as echo, so
 * speakers get Stream's normal playback (SpaceRoom switches between the two).
 */

import { useEffect, useRef } from 'react'

/** The bits of a Stream participant this needs. */
type Voice = { sessionId: string; audioStream?: MediaStream }

let shared: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!shared) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      shared = new Ctor()
    } catch {
      return null
    }
  }
  return shared
}

/** Call from a tap (Join / Listen) so the browser lets the audio start. */
export function wakeLoudAudio() {
  const ctx = audioContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
}

function RemoteVoice({ stream, boost }: { stream: MediaStream; boost: number }) {
  const el = useRef<HTMLAudioElement>(null)
  const gainRef = useRef<GainNode | null>(null)

  useEffect(() => {
    const audio = el.current
    if (!audio) return
    audio.srcObject = stream
    const ctx = audioContext()
    if (!ctx || stream.getAudioTracks().length === 0) {
      audio.muted = false
      void audio.play().catch(() => undefined)
      return
    }
    let nodes: AudioNode[] = []
    try {
      const source = ctx.createMediaStreamSource(stream)
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -28
      comp.knee.value = 20
      comp.ratio.value = 4
      comp.attack.value = 0.004
      comp.release.value = 0.25
      const gain = ctx.createGain()
      gain.gain.value = boost
      source.connect(comp)
      comp.connect(gain)
      gain.connect(ctx.destination)
      nodes = [source, comp, gain]
      gainRef.current = gain
    } catch {
      audio.muted = false
      void audio.play().catch(() => undefined)
      return
    }
    // Web Audio running: it plays the voice. Asleep (no tap yet): the element plays it instead.
    const sync = () => {
      audio.muted = ctx.state === 'running'
      void audio.play().catch(() => undefined)
    }
    sync()
    ctx.addEventListener('statechange', sync)
    return () => {
      ctx.removeEventListener('statechange', sync)
      for (const n of nodes) {
        try {
          n.disconnect()
        } catch {
          // already gone
        }
      }
      gainRef.current = null
      audio.srcObject = null
    }
  }, [stream, boost])

  return <audio ref={el} autoPlay playsInline aria-hidden />
}

export function LoudAudio({ participants, boost = 1.8 }: { participants: Voice[]; boost?: number }) {
  return (
    <>
      {participants.map((p) => (p.audioStream ? <RemoteVoice key={`${p.sessionId}:${p.audioStream.id}`} stream={p.audioStream} boost={boost} /> : null))}
    </>
  )
}
