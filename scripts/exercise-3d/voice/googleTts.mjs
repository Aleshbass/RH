// Minimal Google Cloud Text-to-Speech client (REST v1) using the service account in
// GOOGLE_APPLICATION_CREDENTIALS (set in .env.local; the key file lives in gitignored assets-src/).

import path from 'node:path'
import dotenv from 'dotenv'
import { GoogleAuth } from 'google-auth-library'

const API = 'https://texttospeech.googleapis.com/v1'

export async function googleTts(root) {
  dotenv.config({ path: path.join(root, '.env.local') })
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyFile) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set (see .env.local).')
  const auth = new GoogleAuth({
    keyFile: path.isAbsolute(keyFile) ? keyFile : path.join(root, keyFile),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const client = await auth.getClient()

  async function call(method, url, body) {
    const { token } = await client.getAccessToken()
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = json?.error?.message || res.statusText
      throw new Error(`${res.status} ${reason}`)
    }
    return json
  }

  return {
    async listVoices() {
      const json = await call('GET', `${API}/voices`)
      return json.voices ?? []
    },
    /** Returns MP3 bytes. Pass `ssml` instead of `text` for pauses or pronunciation fixes. */
    async synthesize({ text, ssml, languageCode, voiceName, speakingRate = 0.95 }) {
      const json = await call('POST', `${API}/text:synthesize`, {
        input: ssml ? { ssml } : { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate },
      })
      return Buffer.from(json.audioContent, 'base64')
    },
    /** 16-bit mono samples at 24 kHz (WAV header stripped), for measuring speech length. */
    async synthesizePcm({ text, languageCode, voiceName, speakingRate = 1 }) {
      const json = await call('POST', `${API}/text:synthesize`, {
        input: { text },
        voice: { languageCode, name: voiceName },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate },
      })
      const wav = Buffer.from(json.audioContent, 'base64')
      return new Int16Array(wav.buffer, wav.byteOffset + 44, Math.floor((wav.length - 44) / 2))
    },
  }
}
