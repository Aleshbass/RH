#!/usr/bin/env node
/**
 * Publish one lesson video as protected, encrypted HLS (480p + 720p) to Rehabify Learn.
 *
 *   npm run video:publish -- lesson.mp4
 *   npm run video:publish -- lesson.mp4 --lesson <lessonId> --title "Knee assessment"
 *
 * Without --lesson the video appears in Admin › Learn › Courses › lesson › "Published videos".
 * Needs ffmpeg (winget install Gyan.FFmpeg) and, in .env.local:
 *   LEARN_VIDEO_WORKER_SECRET=…        (same value as on Convex)
 *   NEXT_PUBLIC_CONVEX_URL=…           (or LEARN_VIDEO_API_URL=https://<deployment>.convex.site)
 * R2 keys and the master key stay on Convex; this script never sees or prints them.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { fromBase64 } from './keyBytes.mjs'
import { probe, publishFile, siteUrlFrom, workerApi } from './pipeline.mjs'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ quiet: true })

function parseArgs(argv) {
  const args = { file: null, lesson: undefined, title: undefined, keep: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--lesson') args.lesson = argv[++i]
    else if (a === '--title') args.title = argv[++i]
    else if (a === '--keep') args.keep = true
    else if (a === '--help' || a === '-h') args.help = true
    else if (!a.startsWith('--') && !args.file) args.file = a
    else throw new Error(`Unknown option: ${a}`)
  }
  return args
}

function bar(fraction) {
  const width = 24
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width)
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${String(Math.round(fraction * 100)).padStart(3)}%`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.file) {
    console.log('Usage: npm run video:publish -- <video file> [--lesson <lessonId>] [--title "Title"] [--keep]')
    process.exit(args.help ? 0 : 1)
  }
  const input = path.resolve(args.file)
  if (!existsSync(input)) throw new Error(`File not found: ${input}`)

  const base = process.env.LEARN_VIDEO_API_URL || siteUrlFrom(process.env.NEXT_PUBLIC_CONVEX_URL)
  const post = workerApi(base, process.env.LEARN_VIDEO_WORKER_SECRET)
  const title = args.title || path.basename(input).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()

  const info = await probe(input)
  console.log(`Video: ${title} · ${Math.round(info.durationSec)} s · ${info.width}x${info.height}`)
  console.log(`Convex: ${new URL(base).host}`)

  const { assetId, key } = await post('create', { title, lessonId: args.lesson, sizeBytes: undefined })
  console.log(`Video record: ${assetId}`)

  let lastLine = ''
  const result = await publishFile({
    post,
    assetId,
    key: fromBase64(key),
    input,
    keepDir: args.keep,
    onProgress: ({ stage, fraction }) => {
      const line = `${stage.padEnd(16)} ${bar(fraction)}`
      if (line !== lastLine && process.stdout.isTTY) process.stdout.write(`\r${line}`)
      lastLine = line
    },
  })
  if (process.stdout.isTTY) process.stdout.write('\n')
  console.log(`Ready: ${result.renditions.map((r) => r.name).join(' + ')} · ${Math.round(result.durationSec)} s`)
  if (args.keep) console.log(`Encoded files kept in ${result.outDir}`)
  console.log(args.lesson ? `The lesson now plays this video.` : `Attach it to a lesson in Admin › Learn › Courses.`)
}

main().catch((err) => {
  console.error(`\nPublish failed: ${err?.message ?? err}`)
  process.exit(1)
})
