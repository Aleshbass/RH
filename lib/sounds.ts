'use client'

/**
 * Small feedback sounds, synthesised with the Web Audio API (no audio files to load).
 * Kept short and quiet. People can turn them off under Settings → Account & privacy;
 * the choice is stored per browser.
 *
 *   send     – a message went out (soft pop)
 *   receive  – a message arrived (gentle two-note)
 *   booked   – an appointment was booked (bright bell chord)
 *   paid     – a payment went through (rising arpeggio)
 *   success  – something was saved or completed
 *   approve  – an application or request was approved (warm rising fifth)
 *   reject   – something was declined or removed (soft falling tone)
 *   error    – an action failed (low double tap)
 *   certified – a big achievement, e.g. a Rehabify Learn certificate (short fanfare)
 */
export type SoundName =
  | 'send'
  | 'receive'
  | 'booked'
  | 'paid'
  | 'success'
  | 'approve'
  | 'reject'
  | 'error'
  | 'certified'
  | 'points'
  | 'vote'
  | 'helpful'
  | 'share'

const STORAGE_KEY = 'rehabify:sounds'
export const SOUND_SETTING_EVENT = 'rehabify:sounds-changed'

let audioContext: AudioContext | null = null

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Preference just won't persist
  }
  window.dispatchEvent(new Event(SOUND_SETTING_EVENT))
}

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      audioContext = new Ctor()
    } catch {
      return null
    }
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => undefined)
  return audioContext
}

/** One bell-like note: quick attack, smooth exponential decay, a little overtone for warmth. */
function note(ctx: AudioContext, frequency: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  gain.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  osc.connect(gain)
  osc.start(start)
  osc.stop(start + duration + 0.05)

  // Soft octave overtone
  const overtoneGain = ctx.createGain()
  overtoneGain.gain.setValueAtTime(0.0001, start)
  overtoneGain.gain.exponentialRampToValueAtTime(volume * 0.18, start + 0.01)
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.6)
  overtoneGain.connect(ctx.destination)
  const overtone = ctx.createOscillator()
  overtone.type = 'sine'
  overtone.frequency.setValueAtTime(frequency * 2, start)
  overtone.connect(overtoneGain)
  overtone.start(start)
  overtone.stop(start + duration + 0.05)
}

// ── Recorded sounds (ElevenLabs sound effects, public/sounds/learn) ─────────────

/** Short recorded sounds, for moments that deserve more than a synthesised tone. */
export type SoundFile = 'theme-dark' | 'theme-light' | 'certificate'

const SOUND_FILES: Record<SoundFile, { src: string; volume: number }> = {
  'theme-dark': { src: '/sounds/learn/theme-dark.mp3', volume: 0.7 },
  'theme-light': { src: '/sounds/learn/theme-light.mp3', volume: 0.55 },
  certificate: { src: '/sounds/learn/certificate.mp3', volume: 0.6 },
}

const loaded = new Map<SoundFile, HTMLAudioElement>()

/** Fetches a sound ahead of time, so it plays the instant it's needed. */
export function preloadSoundFile(name: SoundFile) {
  if (typeof window === 'undefined' || loaded.has(name)) return
  const audio = new Audio(SOUND_FILES[name].src)
  audio.preload = 'auto'
  audio.volume = SOUND_FILES[name].volume
  loaded.set(name, audio)
}

export function playSoundFile(name: SoundFile) {
  if (typeof window === 'undefined' || !soundsEnabled()) return
  preloadSoundFile(name)
  const audio = loaded.get(name)!
  try {
    audio.currentTime = 0
    void audio.play().catch(() => undefined) // blocked before any tap: stay silent
  } catch {
    // No audio on this device
  }
}

export function playSound(name: SoundName) {
  if (typeof window === 'undefined' || !soundsEnabled()) return
  const ctx = context()
  if (!ctx) return
  const t = ctx.currentTime + 0.01

  switch (name) {
    case 'send': {
      // Pop: a quick upward pitch glide
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
      gain.connect(ctx.destination)
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(620, t)
      osc.frequency.exponentialRampToValueAtTime(1240, t + 0.09)
      osc.connect(gain)
      osc.start(t)
      osc.stop(t + 0.2)
      break
    }
    case 'receive':
      note(ctx, 783.99, t, 0.22, 0.05) // G5
      note(ctx, 1046.5, t + 0.09, 0.3, 0.045) // C6
      break
    case 'booked':
      note(ctx, 1046.5, t, 0.5, 0.06) // C6
      note(ctx, 1318.51, t + 0.08, 0.55, 0.05) // E6
      note(ctx, 1567.98, t + 0.16, 0.7, 0.045) // G6
      break
    case 'paid':
      note(ctx, 783.99, t, 0.25, 0.05, 'triangle') // G5
      note(ctx, 987.77, t + 0.07, 0.25, 0.05, 'triangle') // B5
      note(ctx, 1174.66, t + 0.14, 0.28, 0.05, 'triangle') // D6
      note(ctx, 1567.98, t + 0.21, 0.6, 0.055) // G6
      note(ctx, 2093.0, t + 0.3, 0.5, 0.025) // C7 sparkle
      break
    case 'success':
      note(ctx, 880, t, 0.25, 0.05) // A5
      note(ctx, 1318.51, t + 0.1, 0.4, 0.045) // E6
      break
    case 'approve':
      note(ctx, 659.25, t, 0.22, 0.05) // E5
      note(ctx, 987.77, t + 0.08, 0.28, 0.05) // B5
      note(ctx, 1318.51, t + 0.16, 0.45, 0.04) // E6
      break
    case 'reject':
      note(ctx, 587.33, t, 0.2, 0.045, 'triangle') // D5
      note(ctx, 440, t + 0.1, 0.35, 0.04, 'triangle') // A4
      break
    case 'error':
      note(ctx, 220, t, 0.12, 0.06, 'triangle') // A3
      note(ctx, 207.65, t + 0.13, 0.18, 0.06, 'triangle') // G#3
      break
    case 'certified':
      // Quick rising C major run into a held chord, with two sparkles on top
      note(ctx, 523.25, t, 0.16, 0.045, 'triangle') // C5
      note(ctx, 659.25, t + 0.08, 0.16, 0.045, 'triangle') // E5
      note(ctx, 783.99, t + 0.16, 0.18, 0.045, 'triangle') // G5
      note(ctx, 1046.5, t + 0.27, 0.9, 0.05) // C6
      note(ctx, 1318.51, t + 0.27, 0.9, 0.035) // E6
      note(ctx, 1567.98, t + 0.27, 1.0, 0.03) // G6
      note(ctx, 2093.0, t + 0.45, 0.45, 0.018) // C7
      note(ctx, 2637.02, t + 0.56, 0.4, 0.013) // E7
      break
    case 'points':
      // Reward points: a bright two-note coin chime
      note(ctx, 1567.98, t, 0.14, 0.045, 'triangle') // G6
      note(ctx, 2093.0, t + 0.07, 0.42, 0.04) // C7
      break
    case 'vote':
      // A light tick for a vote or "found this useful"
      note(ctx, 1174.66, t, 0.08, 0.04, 'triangle') // D6
      break
    case 'helpful':
      // An answer marked helpful: a warm, settled chord
      note(ctx, 659.25, t, 0.5, 0.04) // E5
      note(ctx, 830.61, t + 0.05, 0.5, 0.035) // G#5
      note(ctx, 987.77, t + 0.1, 0.6, 0.035) // B5
      break
    case 'share': {
      // Sharing a card: a soft upward whoosh into a note
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      gain.connect(ctx.destination)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(440, t)
      osc.frequency.exponentialRampToValueAtTime(1320, t + 0.18)
      osc.connect(gain)
      osc.start(t)
      osc.stop(t + 0.25)
      note(ctx, 1318.51, t + 0.16, 0.35, 0.035) // E6
      break
    }
  }
}
