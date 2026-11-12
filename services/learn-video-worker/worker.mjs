/**
 * Rehabify Learn video encoder (Railway). Turns browser uploads into protected video:
 * claims a queued upload from Convex, downloads the source through a presigned link, runs the
 * same ffmpeg pipeline as `npm run video:publish` (AES-128 HLS, 480p + 720p), uploads the result
 * to the private R2 bucket and marks the lesson ready.
 *
 * Env: LEARN_VIDEO_API_URL (https://<deployment>.convex.site), LEARN_VIDEO_WORKER_SECRET, PORT.
 * Convex pings POST /wake after each upload, so the service can sleep when idle (Railway
 * "serverless"); it also checks the queue on start. No R2 keys or master key live here.
 */

import http from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { timingSafeEqual, createHash } from 'node:crypto'
import { fromBase64 } from '../../scripts/learn-video/keyBytes.mjs'
import { request } from '../../scripts/learn-video/net.mjs'
import { publishFile, workerApi } from '../../scripts/learn-video/pipeline.mjs'

const API = process.env.LEARN_VIDEO_API_URL
const SECRET = process.env.LEARN_VIDEO_WORKER_SECRET
const post = workerApi(API, SECRET)

let running = false
let again = false

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

async function processQueue() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      for (;;) {
        const { job } = await post('claim')
        if (!job) break
        await encodeJob(job)
      }
    } while (again)
  } catch (err) {
    log(`queue error: ${err?.message ?? err}`)
  } finally {
    running = false
  }
}

async function encodeJob(job) {
  const started = Date.now()
  const dir = await mkdtemp(path.join(tmpdir(), 'rhsrc-'))
  const input = path.join(dir, 'source')
  log(`job ${job.assetId}: downloading`)
  try {
    const res = await request(job.sourceUrl, { toFile: input })
    if (res.status < 200 || res.status >= 300) throw new Error(`source download failed (${res.status})`)
    let last = -1
    const result = await publishFile({
      post,
      assetId: job.assetId,
      key: fromBase64(job.key),
      input,
      onProgress: ({ stage, fraction }) => {
        const pct = Math.floor(fraction * 10) * 10
        if (pct !== last) log(`job ${job.assetId}: ${stage} ${pct}%`)
        last = pct
      },
    })
    log(`job ${job.assetId}: ready (${result.renditions.map((r) => r.name).join('+')}, ${Math.round(result.durationSec)} s) in ${Math.round((Date.now() - started) / 1000)} s`)
  } catch (err) {
    // publishFile already reported the failure to Convex
    log(`job ${job.assetId}: failed: ${err?.message ?? err}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function authorised(header) {
  if (!header?.startsWith('Bearer ') || !SECRET) return false
  const a = createHash('sha256').update(header.slice(7).trim()).digest()
  const b = createHash('sha256').update(SECRET).digest()
  return timingSafeEqual(a, b)
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(running ? 'encoding' : 'idle')
    return
  }
  if (req.method === 'POST' && req.url === '/wake') {
    if (!authorised(req.headers.authorization)) {
      res.writeHead(401).end()
      return
    }
    void processQueue()
    res.writeHead(202).end()
    return
  }
  res.writeHead(404).end()
})

server.listen(Number(process.env.PORT) || 8080, () => {
  log(`encoder listening on ${server.address().port}`)
  void processQueue()
})
