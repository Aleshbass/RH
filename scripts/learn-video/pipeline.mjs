/**
 * Rehabify Learn protected video pipeline, shared by the laptop command (publish.mjs) and the
 * Railway encoder (services/learn-video-worker). Node built-ins only.
 *
 * ffmpeg makes AES-128 encrypted HLS at 480p and 720p (6-second segments, one rendition at a time
 * so it fits an 8 GB laptop), then the files go to the private R2 bucket through presigned links
 * from Convex (/learn/video/worker/*). The AES key arrives from Convex over HTTPS, is written to a
 * private temp file for ffmpeg only, deleted straight after, and never printed.
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { request } from './net.mjs'

// ── ffmpeg ───────────────────────────────────────────────────────────────────

/** ffmpeg/ffprobe: FFMPEG_PATH, then PATH, then a winget install (Windows). */
export function findTool(name) {
  const fromEnv = process.env[name === 'ffmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH']
  if (fromEnv) return fromEnv
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const links = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', `${name}.exe`)
    if (existsSync(links)) return links
    const packages = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages')
    if (existsSync(packages)) {
      for (const dir of readdirSync(packages).filter((d) => d.toLowerCase().includes('ffmpeg'))) {
        const root = path.join(packages, dir)
        for (const build of readdirSync(root)) {
          const exe = path.join(root, build, 'bin', `${name}.exe`)
          if (existsSync(exe) && statSync(exe).isFile()) return exe
        }
      }
    }
  }
  return name
}

function run(cmd, args, { onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stderr = ''
    let stdout = ''
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      if (!onLine) return
      buffer += text
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    })
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000) // last lines only, for the error message
    })
    child.on('error', (err) => reject(new Error(`${path.basename(cmd)} couldn't start: ${err.message}. Is ffmpeg installed?`)))
    child.on('close', (code) => (code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(cmd)} failed (${code}): ${stderr.trim().split('\n').slice(-3).join(' ')}`))))
  })
}

export async function probe(file) {
  const out = await run(findTool('ffprobe'), [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ])
  const info = JSON.parse(out)
  const video = info.streams?.find((s) => s.codec_type === 'video')
  if (!video) throw new Error('No video track in this file.')
  return {
    durationSec: Number(info.format?.duration) || Number(video.duration) || 0,
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    hasAudio: Boolean(info.streams?.some((s) => s.codec_type === 'audio')),
  }
}

const RENDITIONS = [
  { name: '480p', height: 480, maxrate: 1100, audio: 96 },
  { name: '720p', height: 720, maxrate: 2500, audio: 128 },
]
const SEGMENT_SEC = 6

/**
 * Encrypted HLS into outDir/<rendition>/ (index.m3u8 + seg_0000.ts…) and outDir/poster.jpg.
 * Renditions taller than the source are skipped (480p is always made).
 */
export async function encodeHls({ input, outDir, key, onProgress = () => {} }) {
  if (!(key instanceof Uint8Array) || key.length !== 16) throw new Error('The video key must be 16 bytes.')
  const ffmpeg = findTool('ffmpeg')
  const info = await probe(input)
  if (!info.durationSec) throw new Error("Couldn't read the video's length.")
  const plan = RENDITIONS.filter((r, i) => i === 0 || r.height <= Math.max(info.height, 480))

  // The key exists on disk only while ffmpeg runs, in a private temp folder
  const keyDir = await mkdtemp(path.join(tmpdir(), 'rhk-'))
  const keyFile = path.join(keyDir, 'video.key')
  const keyInfo = path.join(keyDir, 'keyinfo')
  try {
    await writeFile(keyFile, key, { mode: 0o600 })
    await chmod(keyFile, 0o600).catch(() => {})
    // Line 1: the key URI written into the playlist (replaced by Convex when it's served)
    await writeFile(keyInfo, `key\n${keyFile}\n`, { mode: 0o600 })

    const renditions = []
    for (const [index, r] of plan.entries()) {
      const dir = path.join(outDir, r.name)
      await mkdir(dir, { recursive: true })
      const args = [
        '-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
        '-i', input,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', `scale=-2:${r.height}:flags=bicubic,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-crf', '23',
        '-maxrate', `${r.maxrate}k`, '-bufsize', `${r.maxrate * 2}k`,
        '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SEC})`, '-sc_threshold', '0',
        '-c:a', 'aac', '-b:a', `${r.audio}k`, '-ac', '2', '-ar', '44100',
        '-threads', '2',
        '-f', 'hls', '-hls_time', String(SEGMENT_SEC), '-hls_playlist_type', 'vod',
        '-hls_flags', 'independent_segments',
        '-hls_key_info_file', keyInfo,
        '-hls_segment_filename', path.join(dir, 'seg_%04d.ts'),
        path.join(dir, 'index.m3u8'),
      ]
      await run(ffmpeg, args, {
        onLine: (line) => {
          const m = line.match(/^out_time_us=(\d+)/)
          if (m) {
            const done = Math.min(1, Number(m[1]) / 1e6 / info.durationSec)
            onProgress({ stage: `encoding ${r.name}`, fraction: (index + done) / plan.length })
          }
        },
      })
      renditions.push({ name: r.name, height: r.height, ...(await measure(dir, info, r.height)) })
    }

    await run(ffmpeg, [
      '-hide_banner', '-nostdin', '-y', '-loglevel', 'error',
      '-ss', String(Math.min(3, info.durationSec / 3)), '-i', input,
      '-frames:v', '1', '-vf', 'scale=-2:720', '-q:v', '4', path.join(outDir, 'poster.jpg'),
    ]).catch(() => {}) // a lesson works without a poster

    return { durationSec: info.durationSec, renditions }
  } finally {
    await rm(keyDir, { recursive: true, force: true })
  }
}

/** Width (from the scaled source) and peak bandwidth (largest segment) for the master playlist. */
async function measure(dir, info, height) {
  const playlist = await readFile(path.join(dir, 'index.m3u8'), 'utf8')
  const lines = playlist.split(/\r?\n/)
  let peak = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#EXTINF:([\d.]+)/)
    const seg = lines[i + 1]
    if (m && seg && !seg.startsWith('#')) {
      const bits = (await stat(path.join(dir, seg))).size * 8
      peak = Math.max(peak, bits / Math.max(0.5, Number(m[1])))
    }
  }
  const width = info.height ? Math.round((info.width * height) / info.height / 2) * 2 : Math.round((height * 16) / 9 / 2) * 2
  return { width, bandwidth: Math.round(peak * 1.1) || 1_000_000 }
}

// ── Convex worker API ────────────────────────────────────────────────────────

/** POST to /learn/video/worker/* with the worker secret. */
export function workerApi(baseUrl, secret) {
  if (!baseUrl) throw new Error('No Convex site URL (LEARN_VIDEO_API_URL or NEXT_PUBLIC_CONVEX_URL).')
  if (!secret || secret.length < 32) throw new Error('LEARN_VIDEO_WORKER_SECRET is missing or too short.')
  const root = baseUrl.replace(/\/+$/, '')
  return async function post(route, body = {}) {
    const res = await fetch(`${root}/learn/video/worker/${route}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: text.slice(0, 200) }
    }
    if (!res.ok) throw new Error(`${route}: ${data.error ?? res.status}${data.missing ? ` (missing: ${data.missing.join(', ')})` : ''}`)
    return data
  }
}

/** https://x.convex.cloud → https://x.convex.site; local 127.0.0.1:3210 → :3211. */
export function siteUrlFrom(convexUrl) {
  if (!convexUrl) return ''
  const url = new URL(convexUrl)
  if (url.hostname.endsWith('.convex.cloud')) url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site')
  else if (url.port === '3210') url.port = '3211'
  return url.origin
}

const CONTENT_TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' }

async function putWithRetry(url, body, type, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await request(url, { method: 'PUT', body, headers: { 'Content-Type': type } })
      if (res.status >= 200 && res.status < 300) return
      throw new Error(`upload failed (${res.status})`)
    } catch (err) {
      if (attempt >= tries) throw err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
}

/** Uploads every rendition file (4 at a time) and the poster; returns the poster's storage id. */
export async function uploadOutputs({ post, assetId, outDir, onProgress = () => {} }) {
  const files = []
  for (const name of await readdir(outDir)) {
    const dir = path.join(outDir, name)
    if (!(await stat(dir)).isDirectory()) continue
    for (const file of await readdir(dir)) if (/\.(m3u8|ts)$/.test(file)) files.push(`${name}/${file}`)
  }
  // Segments first, playlists last: a playlist never points at a file that isn't there yet
  files.sort((a, b) => Number(a.endsWith('.m3u8')) - Number(b.endsWith('.m3u8')) || a.localeCompare(b))

  let done = 0
  let posterUploadUrl
  for (let start = 0; start < files.length; start += 500) {
    const batch = files.slice(start, start + 500)
    const { urls, posterUploadUrl: posterUrl } = await post('upload-urls', { assetId, files: batch })
    posterUploadUrl ??= posterUrl
    const queue = [...batch]
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const body = await readFile(path.join(outDir, file))
          await putWithRetry(urls[file], body, CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream')
          onProgress({ stage: 'uploading', fraction: ++done / files.length })
        }
      })
    )
  }

  const poster = path.join(outDir, 'poster.jpg')
  if (posterUploadUrl && existsSync(poster)) {
    const res = await fetch(posterUploadUrl, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await readFile(poster) })
    if (res.ok) return (await res.json()).storageId ?? null
  }
  return null
}

/** Encode + upload + complete for one source file, with clean-up and a failure report. */
export async function publishFile({ post, assetId, key, input, onProgress, keepDir }) {
  const outDir = await mkdtemp(path.join(tmpdir(), 'rhv-'))
  try {
    const { durationSec, renditions } = await encodeHls({ input, outDir, key, onProgress })
    const posterStorageId = await uploadOutputs({ post, assetId, outDir, onProgress })
    const playlists = {}
    for (const r of renditions) playlists[r.name] = await readFile(path.join(outDir, r.name, 'index.m3u8'), 'utf8')
    await post('complete', {
      assetId,
      durationSec,
      posterStorageId,
      playlists,
      renditions: renditions.map(({ name, width, height, bandwidth }) => ({ name, width, height, bandwidth })),
    })
    return { durationSec, renditions, outDir }
  } catch (err) {
    await post('fail', { assetId, error: String(err?.message ?? err).slice(0, 300) }).catch(() => {})
    throw err
  } finally {
    if (!keepDir) await rm(outDir, { recursive: true, force: true })
  }
}
