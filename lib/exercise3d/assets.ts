import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type KeyframeTrack,
} from 'three'

/**
 * Loading the encrypted exercise library in the browser.
 *
 * Files are static and versioned (public/exercise-library/<version>/), cached by the CDN and, here,
 * in Cache Storage, still encrypted. Keys come from Convex (exerciseLibrary.requestViewerGrant)
 * only for viewers allowed to watch, and plaintext only ever exists in memory: no blob URLs, no
 * decrypted copies on disk.
 */

const CACHE_NAME = 'rh-exercise-library'

function b64ToBytes(b64: string) {
  const s = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(url)
      if (hit) return await hit.arrayBuffer()
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`)
      cache.put(url, res.clone()).catch(() => {})
      return await res.arrayBuffer()
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Couldn't load")) throw error
    // Cache Storage can be unavailable (private windows); fall through to a plain fetch.
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`)
  return await res.arrayBuffer()
}

/** Drops cached files from older library versions. */
export async function pruneOldVersions(version: string) {
  try {
    if (typeof caches === 'undefined') return
    const cache = await caches.open(CACHE_NAME)
    for (const req of await cache.keys()) {
      if (!req.url.includes(`/exercise-library/${version}/`)) await cache.delete(req)
    }
  } catch {
    // Best effort only.
  }
}

/** Fetches and decrypts one asset. Layout: "RHX1" | 12-byte IV | ciphertext + GCM tag. */
export async function loadEncrypted(url: string, keyB64: string): Promise<ArrayBuffer> {
  const data = await fetchBytes(url)
  const head = new Uint8Array(data, 0, 4)
  if (String.fromCharCode(...head) !== 'RHX1') throw new Error('Unexpected exercise file')
  const key = await crypto.subtle.importKey('raw', b64ToBytes(keyB64), 'AES-GCM', false, ['decrypt'])
  return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(data, 4, 12) }, key, new Uint8Array(data, 16))
}

type MotionHeader = {
  v: number
  fps: number
  duration: number
  times: [number, number] | null
  tracks: { node: string; path: 'rotation' | 'translation' | 'scale'; kind: 'q16' | 'f32'; size?: number; offset: number; count: number }[]
}

/** Builds a three.js clip from a packed motion (.rhm, see scripts/exercise-3d/pack-clips.mjs). */
export function parseMotion(buffer: ArrayBuffer, name: string): AnimationClip {
  const headerLength = new DataView(buffer).getUint32(0, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as MotionHeader
  const base = 4 + headerLength
  const times = header.times
    ? new Float32Array(buffer.slice(base + header.times[0], base + header.times[0] + header.times[1] * 4))
    : new Float32Array([0])

  const tracks: KeyframeTrack[] = header.tracks.map((t) => {
    const trackTimes = t.count === 1 ? new Float32Array([0]) : times
    if (t.kind === 'q16') {
      const raw = new Int16Array(buffer.slice(base + t.offset, base + t.offset + t.count * 8))
      const values = Float32Array.from(raw, (n) => n / 32767)
      return new QuaternionKeyframeTrack(`${t.node}.quaternion`, trackTimes, values)
    }
    const size = t.size ?? 3
    const values = new Float32Array(buffer.slice(base + t.offset, base + t.offset + t.count * size * 4))
    return new VectorKeyframeTrack(`${t.node}.${t.path === 'translation' ? 'position' : 'scale'}`, trackTimes, values)
  })
  return new AnimationClip(name, header.duration, tracks)
}
