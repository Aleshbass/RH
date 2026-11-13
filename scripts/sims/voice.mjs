// Voices for the Learn simulations: every spoken line in content/sim-cases/*.json becomes an MP3 in
// public/sims/<slug>/v<version>/<audio id>.mp3 (node lines "<node>-<n>", replies "<choice id>").
// Each speaker's ElevenLabs voice is in the case's "speakers"; lines are loudness-matched with
// ffmpeg when it's installed, and the case gets "audio": true once every line exists.
//
//   node scripts/sims/voice.mjs                 all cases, only missing lines
//   node scripts/sims/voice.mjs --case <slug>   one case
//   node scripts/sims/voice.mjs --force         regenerate everything
//
// The key is ELEVENLABS_API_KEY (environment, .env.local or Windows user variables); never printed.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenTts } from '../exercise-3d/voice/elevenTts.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const casesDir = path.join(root, 'content/sim-cases')
const args = process.argv.slice(2)
const only = args.includes('--case') ? args[args.indexOf('--case') + 1] : null
const force = args.includes('--force')

const MODEL = 'eleven_multilingual_v2'
const FORMAT = 'mp3_44100_64'

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Evens out loudness across speakers (−16 LUFS, mono, 64 kbps). */
function normalise(file) {
  const tmp = `${file}.tmp.mp3`
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '1', '-ar', '44100', '-b:a', '64k', tmp], {
    stdio: 'ignore',
  })
  rmSync(file)
  renameSync(tmp, file)
}

function linesOf(def) {
  const out = []
  for (const node of Object.values(def.nodes)) {
    ;(node.lines ?? []).forEach((line, i) => out.push({ id: `${node.id}-${i}`, ...line }))
    for (const choice of node.choices ?? []) if (choice.reply) out.push({ id: choice.id, ...choice.reply })
  }
  return out
}

const ffmpeg = hasFfmpeg()
if (!ffmpeg) console.log('ffmpeg not found: lines are saved without loudness matching.')

let characters = 0
for (const file of readdirSync(casesDir).filter((f) => f.endsWith('.json'))) {
  const jsonPath = path.join(casesDir, file)
  const raw = readFileSync(jsonPath, 'utf8')
  const def = JSON.parse(raw)
  if (only && def.slug !== only) continue
  const outDir = path.join(root, 'public/sims', def.slug, `v${def.version}`)
  mkdirSync(outDir, { recursive: true })
  const lines = linesOf(def)
  const clients = new Map()
  let made = 0
  for (const line of lines) {
    const out = path.join(outDir, `${line.id}.mp3`)
    if (!force && existsSync(out)) continue
    const voiceId = def.speakers[line.speaker]?.voice
    if (!voiceId) throw new Error(`${def.slug}: speaker "${line.speaker}" has no voice`)
    if (!clients.has(voiceId)) clients.set(voiceId, await elevenTts(root, { voiceId, model: MODEL, outputFormat: FORMAT, stability: 0.5, similarity: 0.8 }))
    const mp3 = await clients.get(voiceId).synthesize({ text: line.text })
    writeFileSync(out, mp3)
    if (ffmpeg) normalise(out)
    characters += line.text.length
    made++
    process.stdout.write(`  ${def.slug}/${line.id}.mp3\n`)
  }
  const complete = lines.every((line) => existsSync(path.join(outDir, `${line.id}.mp3`)))
  if (complete && def.audio !== true) {
    // Mark the case as voiced without reformatting the hand-written JSON
    const marked = raw.replace(/("estimatedMinutes":\s*\d+,)/, '$1\n  "audio": true,')
    if (marked === raw) throw new Error(`${file}: couldn't add "audio": true`)
    writeFileSync(jsonPath, marked)
  }
  console.log(`${def.slug} v${def.version}: ${made} new, ${lines.length} lines, ${complete ? 'complete' : 'INCOMPLETE'}`)
}
console.log(`Characters used: ${characters}`)
