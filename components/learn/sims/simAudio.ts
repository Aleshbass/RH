'use client'

/**
 * Simulation sound: monitor beeps and alarms synthesised with Web Audio (no files, like a real
 * monitor), and the patients' voice lines played one after another through a single <audio>
 * element. Browsers keep audio asleep until a tap, so the Start button calls unlockSimAudio().
 * Respects the site-wide sound setting (lib/sounds.ts) plus a voice on/off just for cases.
 */

import { soundsEnabled } from '@/lib/sounds'

let ctx: AudioContext | null = null
let voiceEl: HTMLAudioElement | null = null
const VOICE_KEY = 'rehabify:sim-voice'

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
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  return ctx
}

// A tiny silent WAV: playing it inside the tap unlocks the <audio> element on iOS
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** Call from the Start tap. */
export function unlockSimAudio() {
  audioContext()
  if (typeof window === 'undefined') return
  if (!voiceEl) voiceEl = new Audio()
  try {
    voiceEl.src = SILENT_WAV
    void voiceEl.play().catch(() => undefined)
  } catch {
    // no audio on this device
  }
}

export function voiceOn() {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setVoiceOn(on: boolean) {
  try {
    localStorage.setItem(VOICE_KEY, on ? 'on' : 'off')
  } catch {
    // just won't be remembered
  }
  if (!on) stopVoice()
}

function tone(freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const c = audioContext()
  if (!c) return
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008)
  gain.gain.setValueAtTime(volume, start + duration - 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  gain.connect(c.destination)
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  osc.connect(gain)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** One pulse-oximeter beep: the pitch drops as saturation falls, as on real monitors. */
export function heartBeep(spo2: number) {
  if (!soundsEnabled()) return
  const c = audioContext()
  if (!c) return
  const freq = 880 - Math.max(0, 100 - spo2) * 18
  tone(freq, c.currentTime + 0.005, 0.07, 0.035, 'sine')
}

/** Medium-priority alarm: three rising pulses. */
export function monitorAlarm() {
  if (!soundsEnabled()) return
  const c = audioContext()
  if (!c) return
  const t = c.currentTime + 0.01
  tone(660, t, 0.14, 0.05, 'triangle')
  tone(660, t + 0.2, 0.14, 0.05, 'triangle')
  tone(880, t + 0.4, 0.18, 0.05, 'triangle')
}

/** Last ten seconds of a triage clock. */
export function clockTick(urgent: boolean) {
  if (!soundsEnabled()) return
  const c = audioContext()
  if (!c) return
  tone(urgent ? 1500 : 1200, c.currentTime + 0.005, 0.03, urgent ? 0.03 : 0.018, 'square')
}

// ── Voice lines ──────────────────────────────────────────────────────────────

let queue: { url: string; onStart?: () => void }[] = []
let playing = false
let onIdle: (() => void) | null = null

function playNext() {
  const next = queue.shift()
  if (!next || !voiceEl) {
    playing = false
    onIdle?.()
    return
  }
  playing = true
  next.onStart?.()
  voiceEl.src = next.url
  voiceEl.onended = () => playNext()
  voiceEl.onerror = () => playNext() // a missing line just skips
  void voiceEl.play().catch(() => playNext())
}

/** Plays lines in order after anything already queued. `onSpeaker` fires as each one starts. */
export function queueVoice(lines: { url: string; onStart?: () => void }[], whenDone?: () => void) {
  if (typeof window === 'undefined' || !voiceOn() || !soundsEnabled() || lines.length === 0) {
    whenDone?.()
    return
  }
  if (!voiceEl) voiceEl = new Audio()
  queue.push(...lines)
  onIdle = whenDone ?? null
  if (!playing) playNext()
}

/** Where the voice is right now (the line's URL and seconds into it), for lip sync. */
export function voiceClock(): { url: string; t: number } | null {
  if (!playing || !voiceEl || voiceEl.paused) return null
  return { url: voiceEl.src, t: voiceEl.currentTime }
}

export function stopVoice() {
  queue = []
  playing = false
  if (voiceEl) {
    voiceEl.onended = null
    voiceEl.onerror = null
    try {
      voiceEl.pause()
    } catch {
      // nothing playing
    }
  }
}

export function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not supported (iOS)
  }
}
