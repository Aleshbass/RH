// Minimal ElevenLabs text-to-speech client for the exercise voiceovers (owner's pick, 12 Nov 2026:
// "Bill", a Nigerian male voice). The key is ELEVENLABS_API_KEY from the environment, .env.local or
// the Windows user environment; it is never printed.

import { execSync } from 'node:child_process'
import path from 'node:path'
import dotenv from 'dotenv'

const API = 'https://api.elevenlabs.io/v1'

function apiKey(root) {
  dotenv.config({ path: path.join(root, '.env.local') })
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY
  if (process.platform === 'win32') {
    try {
      const out = execSync('reg query HKCU\\Environment /v ELEVENLABS_API_KEY', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const match = out.match(/REG_\w+\s+(\S+)/)
      if (match) return match[1]
    } catch {
      // Not set there either.
    }
  }
  throw new Error('ELEVENLABS_API_KEY is not set (environment, .env.local or Windows user variables).')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function elevenTts(root, voice) {
  const key = apiKey(root)

  return {
    /** Returns MP3 bytes in voice.outputFormat. `speakingRate` maps to ElevenLabs' speed (0.7–1.2). */
    async synthesize({ text, speakingRate = 1 }) {
      const body = JSON.stringify({
        text,
        model_id: voice.model,
        voice_settings: {
          stability: voice.stability ?? 0.55,
          similarity_boost: voice.similarity ?? 0.8,
          style: 0,
          use_speaker_boost: true,
          speed: Math.min(1.2, Math.max(0.7, speakingRate)),
        },
      })
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(`${API}/text-to-speech/${voice.voiceId}?output_format=${voice.outputFormat}`, {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
          body,
        })
        if (res.ok) {
          const mp3 = Buffer.from(await res.arrayBuffer())
          if (mp3.length < 500) throw new Error(`audio too short (${mp3.length} bytes)`)
          return mp3
        }
        const reason = (await res.text().catch(() => '')).slice(0, 200)
        // Busy or rate-limited: wait and try again
        if ((res.status === 429 || res.status >= 500) && attempt < 5) {
          await sleep(2000 * attempt)
          continue
        }
        throw new Error(`${res.status} ${reason}`)
      }
    },
  }
}
