'use client'

/**
 * Live voice levels for Rehabify Spaces avatars (owner 2026-11-13: "the animation frequency when
 * someone is talking ... needs to be really good").
 *
 * Each speaker's audio stream goes through a Web Audio analyser. One requestAnimationFrame loop
 * reads every analyser, smooths the level (fast attack, slow release, so rings bloom with a word
 * and settle gently) and splits the voice into four frequency bands for the equaliser bars. The
 * numbers are written straight to CSS variables on the avatar (--v, --b0..--b3), so React never
 * re-renders per frame. Stream's own audioLevel (from the server) is the fallback for a stream the
 * browser can't analyse.
 */

import { useEffect, useRef } from 'react'

type Meter = {
  el: HTMLElement
  analyser: AnalyserNode | null
  source: MediaStreamAudioSourceNode | null
  time: Uint8Array<ArrayBuffer>
  freq: Uint8Array<ArrayBuffer>
  level: number
  bands: [number, number, number, number]
  fallback: number
  muted: boolean
}

let ctx: AudioContext | null = null
const meters = new Set<Meter>()
let frame = 0

function audioContext() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  return ctx
}

/** Call from a tap (Join / Start): browsers keep audio analysis asleep until a gesture. */
export function wakeVoiceMeters() {
  const c = audioContext()
  if (c?.state === 'suspended') void c.resume().catch(() => undefined)
}

// Voice bands in Hz: body, vowels, consonants, air
const BANDS: [number, number][] = [
  [90, 300],
  [300, 900],
  [900, 2400],
  [2400, 6000],
]

function tick() {
  frame = 0
  if (meters.size === 0) return
  const sampleRate = ctx?.sampleRate ?? 48000
  for (const m of meters) {
    let target = 0
    const bands: [number, number, number, number] = [0, 0, 0, 0]
    if (!m.muted && m.analyser) {
      m.analyser.getByteTimeDomainData(m.time)
      let sum = 0
      for (let i = 0; i < m.time.length; i++) {
        const s = (m.time[i] - 128) / 128
        sum += s * s
      }
      const rms = Math.sqrt(sum / m.time.length)
      // Speech sits around 0.02–0.25 RMS; map it onto 0..1 with a soft knee
      target = Math.min(1, Math.max(0, (rms - 0.012) * 5.2))

      m.analyser.getByteFrequencyData(m.freq)
      const binHz = sampleRate / 2 / m.freq.length
      BANDS.forEach(([lo, hi], b) => {
        const from = Math.max(1, Math.floor(lo / binHz))
        const to = Math.min(m.freq.length - 1, Math.ceil(hi / binHz))
        let peak = 0
        for (let i = from; i <= to; i++) peak = Math.max(peak, m.freq[i])
        bands[b] = Math.min(1, Math.max(0, (peak - 70) / 150))
      })
    }
    if (!m.muted && target < 0.04 && m.fallback > 0.05) {
      // Nothing from the analyser: follow Stream's level, with a little movement in the bars
      target = Math.min(1, m.fallback * 1.4)
      const t = performance.now() / 120
      bands[0] = target * (0.75 + 0.25 * Math.sin(t))
      bands[1] = target * (0.85 + 0.15 * Math.sin(t * 1.7 + 1))
      bands[2] = target * (0.6 + 0.4 * Math.sin(t * 1.3 + 2))
      bands[3] = target * (0.45 + 0.35 * Math.sin(t * 2.1 + 3))
    }
    // Fast attack, slow release
    m.level += (target - m.level) * (target > m.level ? 0.55 : 0.12)
    if (m.level < 0.002) m.level = 0
    for (let b = 0; b < 4; b++) {
      const v = bands[b]
      m.bands[b] += (v - m.bands[b]) * (v > m.bands[b] ? 0.6 : 0.18)
    }
    const s = m.el.style
    s.setProperty('--v', m.level.toFixed(3))
    s.setProperty('--b0', m.bands[0].toFixed(3))
    s.setProperty('--b1', m.bands[1].toFixed(3))
    s.setProperty('--b2', m.bands[2].toFixed(3))
    s.setProperty('--b3', m.bands[3].toFixed(3))
    m.el.dataset.speaking = m.level > 0.12 ? 'true' : 'false'
  }
  frame = requestAnimationFrame(tick)
}

function ensureLoop() {
  if (!frame && meters.size > 0) frame = requestAnimationFrame(tick)
}

/**
 * Drives the CSS variables on the returned ref's element from this person's audio.
 * `fallbackLevel` is Stream's audioLevel (0..1); `muted` flattens everything.
 */
export function useVoiceMeter<T extends HTMLElement>(stream: MediaStream | undefined, fallbackLevel: number, muted: boolean) {
  const ref = useRef<T | null>(null)
  const meter = useRef<Meter | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const m: Meter = {
      el,
      analyser: null,
      source: null,
      time: new Uint8Array(512),
      freq: new Uint8Array(256),
      level: 0,
      bands: [0, 0, 0, 0],
      fallback: 0,
      muted: false,
    }
    const c = audioContext()
    const track = stream?.getAudioTracks()[0]
    if (c && stream && track) {
      try {
        const analyser = c.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.55
        // Analysis only: not connected to the speakers (Stream plays the audio itself)
        const source = c.createMediaStreamSource(new MediaStream([track]))
        source.connect(analyser)
        m.analyser = analyser
        m.source = source
        m.time = new Uint8Array(analyser.fftSize)
        m.freq = new Uint8Array(analyser.frequencyBinCount)
      } catch {
        // Fallback level only
      }
    }
    meter.current = m
    meters.add(m)
    ensureLoop()
    return () => {
      meters.delete(m)
      try {
        m.source?.disconnect()
      } catch {
        // already gone
      }
      meter.current = null
      for (const name of ['--v', '--b0', '--b1', '--b2', '--b3']) el.style.setProperty(name, '0')
      el.dataset.speaking = 'false'
    }
  }, [stream])

  useEffect(() => {
    if (!meter.current) return
    meter.current.fallback = fallbackLevel
    meter.current.muted = muted
  }, [fallbackLevel, muted])

  return ref
}
