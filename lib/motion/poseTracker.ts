import type { Frame } from './pose'

/**
 * MediaPipe Pose Landmarker in the browser. Everything runs on the phone: video frames never
 * leave it, only landmark numbers come out.
 *
 * The library (about 0.5 MB of JavaScript and 13.5 MB of WebAssembly) and the pose model (5.8 MB
 * lite or 9.4 MB full) are fetched once from pinned, versioned URLs,
 * checked against SHA-256 hashes before anything runs, and kept in Cache Storage so later
 * sessions start offline. The code runs from in-memory blob URLs of the checked bytes.
 */

const VERSION = '1.1.1'
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`
const MODELS = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker'
const CACHE = 'rh-motion-v1'

type Asset = { url: string; sha256: string; type: string; bytes: number }

// Hashes: jsDelivr's published file hashes for this version, and the model files as downloaded (Nov 2026)
const ASSETS = {
  bundle: { url: `${CDN}/vision_bundle.mjs`, sha256: 'qEkh4CMh5YJITB+BJtNEtfM7eR+gnGQKUuIO6GMgaPE=', type: 'text/javascript', bytes: 156_139 },
  loader: { url: `${CDN}/wasm/vision_wasm_internal.js`, sha256: 'ZSIoaqMt2T7/F8PaACsGSVFvh6v+x6gLW/5cliXKpfg=', type: 'text/javascript', bytes: 334_128 },
  wasm: { url: `${CDN}/wasm/vision_wasm_internal.wasm`, sha256: 'DhAaAQ4mLvjnjyLjyVtgqXBf0GlidTyazWNW2ftWt70=', type: 'application/wasm', bytes: 13_519_922 },
  loaderNoSimd: { url: `${CDN}/wasm/vision_wasm_nosimd_internal.js`, sha256: 'lCZU29zrzgjqA5ryPRjli+vyPIYH10Aj0t9wccintjg=', type: 'text/javascript', bytes: 333_931 },
  wasmNoSimd: { url: `${CDN}/wasm/vision_wasm_nosimd_internal.wasm`, sha256: 'ybG2m7h7r55SklTYVZ3Lz0xanA7ahPVqEvF9Z1M17Jw=', type: 'application/wasm', bytes: 12_627_509 },
  lite: { url: `${MODELS}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`, sha256: 'WZKeHR7pUodzXd2DOxnPSsRtKbx6/du/Z1PEWWkNV0o=', type: 'application/octet-stream', bytes: 5_777_746 },
  full: { url: `${MODELS}/pose_landmarker_full/float16/1/pose_landmarker_full.task`, sha256: 'UTSjqtJ6WLk9oAiNQx82baNitE48z740YrOCeoOQEbE=', type: 'application/octet-stream', bytes: 9_398_198 },
} satisfies Record<string, Asset>

export type PoseModel = 'lite' | 'full'
export type LoadProgress = { loaded: number; total: number }

/** At most how much a first session downloads, for the setup screen (the CDN may compress some of it). */
export function downloadMegabytes(model: PoseModel) {
  return model === 'full' ? 24 : 20
}

// The parts of @mediapipe/tasks-vision used here (the package is loaded at runtime, not installed).
type Landmark = { x: number; y: number; z: number; visibility?: number }
type PoseLandmarkerResult = { landmarks: Landmark[][] }
type PoseLandmarkerInstance = {
  detectForVideo(video: HTMLVideoElement | HTMLCanvasElement, timestamp: number): PoseLandmarkerResult
  close(): void
}
type VisionModule = {
  FilesetResolver: { isSimdSupported(): Promise<boolean> }
  PoseLandmarker: {
    createFromOptions(
      fileset: { wasmLoaderPath: string; wasmBinaryPath: string },
      options: {
        baseOptions: { modelAssetBuffer: Uint8Array; delegate: 'CPU' | 'GPU' }
        runningMode: 'VIDEO'
        numPoses: number
        minPoseDetectionConfidence: number
        minPosePresenceConfidence: number
        minTrackingConfidence: number
      }
    ): Promise<PoseLandmarkerInstance>
  }
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function verified(asset: Asset, data: ArrayBuffer) {
  const digest = toBase64(await crypto.subtle.digest('SHA-256', data))
  if (digest !== asset.sha256) throw new Error('The camera coach download was damaged. Check your connection and try again.')
  return data
}

async function download(asset: Asset, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(asset.url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok || !res.body) throw new Error('Couldn’t download the camera coach. Check your connection and try again.')
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out.buffer
}

/** Checked bytes of one file, from Cache Storage when already downloaded. */
async function fetchAsset(asset: Asset, onBytes: (n: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try {
    cache = typeof caches !== 'undefined' ? await caches.open(CACHE) : null
    const hit = await cache?.match(asset.url)
    if (hit) {
      const data = await hit.arrayBuffer()
      onBytes(asset.bytes)
      return data
    }
  } catch {
    // Cache Storage can be unavailable (private windows): download every time instead.
  }
  const data = await verified(asset, await download(asset, onBytes))
  try {
    await cache?.put(asset.url, new Response(data, { headers: { 'Content-Type': asset.type } }))
  } catch {
    // Storage full: still works, just downloads again next time.
  }
  return data
}

/** Whether the camera coach is already stored on this phone (no download needed). */
export async function isDownloaded(model: PoseModel): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    const cache = await caches.open(CACHE)
    const needed = [ASSETS.bundle, ASSETS[model]]
    const found = await Promise.all(needed.map((a) => cache.match(a.url)))
    const wasm = (await cache.match(ASSETS.wasm.url)) ?? (await cache.match(ASSETS.wasmNoSimd.url))
    return found.every(Boolean) && Boolean(wasm)
  } catch {
    return false
  }
}

let vision: Promise<VisionModule> | null = null

export class PoseTracker {
  private lastTs = 0
  private aspect = 1
  readonly delegate: 'GPU' | 'CPU'

  private constructor(
    private landmarker: PoseLandmarkerInstance | null,
    delegate: 'GPU' | 'CPU',
    private readonly urls: string[]
  ) {
    this.delegate = delegate
  }

  /** Loads the library and model (downloading them the first time), GPU first with a CPU fallback. */
  static async create(model: PoseModel, onProgress?: (p: LoadProgress) => void): Promise<PoseTracker> {
    let loaded = 0
    const total = ASSETS.bundle.bytes + ASSETS.loader.bytes + ASSETS.wasm.bytes + ASSETS[model].bytes
    const tick = (n: number) => {
      loaded += n
      onProgress?.({ loaded: Math.min(loaded, total), total })
    }
    const urls: string[] = []
    const blobUrl = (data: ArrayBuffer, type: string) => {
      const url = URL.createObjectURL(new Blob([data], { type }))
      urls.push(url)
      return url
    }

    if (!vision) {
      vision = fetchAsset(ASSETS.bundle, tick).then(
        (data) => import(/* webpackIgnore: true */ blobUrl(data, 'text/javascript')) as Promise<VisionModule>
      )
      vision.catch(() => {
        vision = null
      })
    } else {
      tick(ASSETS.bundle.bytes)
    }
    const mp = await vision
    const simd = await mp.FilesetResolver.isSimdSupported().catch(() => false)
    const [loader, wasm, modelData] = await Promise.all([
      fetchAsset(simd ? ASSETS.loader : ASSETS.loaderNoSimd, tick),
      fetchAsset(simd ? ASSETS.wasm : ASSETS.wasmNoSimd, tick),
      fetchAsset(ASSETS[model], tick),
    ])
    const fileset = { wasmLoaderPath: blobUrl(loader, 'text/javascript'), wasmBinaryPath: blobUrl(wasm, 'application/wasm') }
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetBuffer: new Uint8Array(modelData), delegate },
      runningMode: 'VIDEO' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      return new PoseTracker(await mp.PoseLandmarker.createFromOptions(fileset, options('GPU')), 'GPU', urls)
    } catch {
      return new PoseTracker(await mp.PoseLandmarker.createFromOptions(fileset, options('CPU')), 'CPU', urls)
    }
  }

  /**
   * Landmarks for the current video frame (or a canvas, in tests), in image units (x scaled by
   * width / height so angles are true to the picture), or null when no one is in view.
   */
  detect(source: HTMLVideoElement | HTMLCanvasElement, now = performance.now()): Frame | null {
    const video = source instanceof HTMLVideoElement
    const width = video ? source.videoWidth : source.width
    const height = video ? source.videoHeight : source.height
    if (!this.landmarker || (video && source.readyState < 2) || !width || !height) return null
    // VIDEO mode needs strictly increasing timestamps
    const ts = Math.max(now, this.lastTs + 1)
    this.lastTs = ts
    this.aspect = width / height
    const result = this.landmarker.detectForVideo(source, ts)
    const pose = result.landmarks[0]
    if (!pose || pose.length < 33) return null
    return {
      t: ts,
      points: pose.map((l) => ({ x: l.x * this.aspect, y: l.y, z: l.z, v: l.visibility ?? 0 })),
    }
  }

  get imageAspect() {
    return this.aspect
  }

  close() {
    this.landmarker?.close()
    this.landmarker = null
    for (const url of this.urls) URL.revokeObjectURL(url)
  }
}
