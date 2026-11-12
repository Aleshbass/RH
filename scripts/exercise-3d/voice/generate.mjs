// Generate exercise voiceovers with ElevenLabs (voice.json provider "elevenlabs", the owner's pick)
// or Google Cloud Text-to-Speech (provider "google", the voice before 12 Nov 2026).
//
//   node scripts/exercise-3d/voice/generate.mjs [--force]
//
// Reads voice-scripts.json (per exercise slug) and voice.json (the chosen voice), and the built
// clip list in scripts/exercise-3d/out/manifest.json. Writes to scripts/exercise-3d/out/voice/:
//   <clipId>.intro.mp3      spoken intro, one per clip (sided clips say "left"/"right")
//   cue-<key>.mp3           short rep cues, shared between exercises ("Hold.", "Lower slowly.")
//   audio-index.json        { clipId: { intro, cues: [{ at, file }] } } for publish.mjs
//   voice-state.json        text/voice hash per file, so unchanged files are skipped on re-runs
//
// Then check the files that will ship: node scripts/exercise-3d/voice/verify.mjs

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { elevenTts } from './elevenTts.mjs'
import { googleTts } from './googleTts.mjs'
import { masterMp3 } from './master.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..')
const OUT = path.join(HERE, '..', 'out', 'voice')
const force = process.argv.includes('--force')

const scripts = JSON.parse(fs.readFileSync(path.join(HERE, 'voice-scripts.json'), 'utf8'))
const voice = JSON.parse(fs.readFileSync(path.join(HERE, 'voice.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'out', 'manifest.json'), 'utf8'))
const statePath = path.join(OUT, 'voice-state.json')
fs.mkdirSync(OUT, { recursive: true })
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {}

const cueKey = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const hash = (text, rate) => crypto.createHash('sha256').update(`${voice.voiceName}|${voice.languageCode}|${rate}|${text}`).digest('hex').slice(0, 16)

// Every unit of speech to produce: file name -> { text, rate }
const jobs = new Map()
const index = {}
for (const [slug, script] of Object.entries(scripts)) {
  if (slug.startsWith('_')) continue
  const clips = manifest.exercises.filter((e) => e.id === slug || e.id === `${slug}-left` || e.id === `${slug}-right`)
  if (clips.length === 0) {
    console.log(`! ${slug}: no built clip in manifest.json, skipped`)
    continue
  }
  for (const clip of clips) {
    const side = clip.side === 'R' ? 'right' : 'left'
    const intro = script.intro.replaceAll('{side}', side)
    const introFile = `${clip.id}.intro.mp3`
    jobs.set(introFile, { text: intro, rate: voice.introRate })
    const cues = []
    for (const cue of script.cues) {
      if (cue.at < 0 || cue.at >= clip.seconds) throw new Error(`${clip.id}: cue at ${cue.at}s is outside the ${clip.seconds}s clip`)
      const file = `cue-${cueKey(cue.text)}.mp3`
      // A cue in a tight slot can be spoken a little faster (voice.json cueSpeed, by text)
      jobs.set(file, { text: cue.text, rate: voice.cueSpeed?.[cue.text] ?? voice.cueRate })
      cues.push({ at: cue.at, file })
    }
    index[clip.id] = { intro: introFile, cues: cues.sort((a, b) => a.at - b.at), transcript: intro }
  }
}

const elevenlabs = voice.provider === 'elevenlabs'
const tts = elevenlabs ? await elevenTts(ROOT, voice) : await googleTts(ROOT)
let made = 0
let skipped = 0
const failed = []
const todo = []
for (const [file, job] of jobs) {
  const target = path.join(OUT, file)
  if (!force && state[file] === hash(job.text, job.rate) && fs.existsSync(target)) skipped++
  else todo.push([file, job])
}
// A few requests at a time (ElevenLabs allows several in parallel on the Creator plan)
let next = 0
async function worker() {
  while (next < todo.length) {
    const [file, job] = todo[next++]
    try {
      const mp3 = await tts.synthesize({ text: job.text, languageCode: voice.languageCode, voiceName: voice.voiceName, speakingRate: job.rate })
      fs.writeFileSync(path.join(OUT, file), mp3)
      state[file] = hash(job.text, job.rate)
      made++
      if (made % 20 === 0) {
        console.log(`  ${made}/${todo.length}`)
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2)) // progress survives a crash
      }
    } catch (error) {
      failed.push(`${file}: ${error.message}`)
    }
  }
}
await Promise.all(Array.from({ length: elevenlabs ? 3 : 1 }, worker))

// ElevenLabs takes vary in loudness from line to line: master every new take (same speech level,
// clean start and end). The mastered file's hash is kept so a file is never mastered twice.
if (elevenlabs) {
  const fileHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT, file))).digest('hex').slice(0, 16)
  state._mastered ??= {}
  const raw = [...jobs.keys()].filter((file) => fs.existsSync(path.join(OUT, file)) && state._mastered[file] !== fileHash(file))
  if (raw.length) {
    console.log(`Mastering ${raw.length} file(s)...`)
    masterMp3(raw.map((file) => path.join(OUT, file)))
    for (const file of raw) state._mastered[file] = fileHash(file)
  }
}
// Timing check. TTS adds a variable silence before and after speech (the player trims it), so
// measure each cue's audible span from uncompressed audio and make sure it ends before the
// next cue on the loop.
// ElevenLabs never says a line exactly the same way twice, so a second "measuring" take would not
// match the file that ships: verify.mjs measures the shipped MP3s instead.
const spans = elevenlabs ? {} : state._spans ?? {}
for (const [file, job] of jobs) {
  if (elevenlabs || !file.startsWith('cue-')) continue
  const h = hash(job.text, job.rate)
  if (spans[file]?.hash === h) continue
  const pcm = await tts.synthesizePcm({ text: job.text, languageCode: voice.languageCode, voiceName: voice.voiceName, speakingRate: job.rate })
  let peak = 0
  for (const s of pcm) peak = Math.max(peak, Math.abs(s))
  const threshold = peak * 0.03
  let a = 0
  let b = pcm.length - 1
  while (a < pcm.length && Math.abs(pcm[a]) < threshold) a++
  while (b > a && Math.abs(pcm[b]) < threshold) b--
  spans[file] = { hash: h, seconds: Math.round(((b - a) / 24000) * 100) / 100 }
}
if (!elevenlabs) state._spans = spans
const overlaps = []
for (const [clipId, entry] of Object.entries(index)) {
  const loop = manifest.exercises.find((e) => e.id === clipId).seconds
  if (elevenlabs) continue
  entry.cues.forEach((cue, k) => {
    const next = k + 1 < entry.cues.length ? entry.cues[k + 1].at : loop + entry.cues[0].at
    const ends = cue.at + (spans[cue.file]?.seconds ?? 0)
    if (ends > next - 0.1) overlaps.push(`${clipId}: "${jobs.get(cue.file).text}" at ${cue.at}s runs to ${ends.toFixed(2)}s, next cue at ${next.toFixed(2)}s`)
  })
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
fs.writeFileSync(path.join(OUT, 'audio-index.json'), JSON.stringify({ voice: voice.voiceName, clips: index }, null, 2))
if (elevenlabs) console.log('Timing: run voice/verify.mjs (measures the shipped files).')
else console.log(overlaps.length ? `TIMING: ${overlaps.length} cue(s) too long for their slot:\n  ${overlaps.join('\n  ')}` : 'Timing: every cue finishes before the next one.')

console.log(`Voice: ${voice.voiceName}`)
console.log(`Generated ${made}, skipped ${skipped} (unchanged), failed ${failed.length}`)
for (const f of failed) console.log(`  FAILED ${f}`)
let total = 0
for (const [clipId, entry] of Object.entries(index)) {
  const introBytes = fs.existsSync(path.join(OUT, entry.intro)) ? fs.statSync(path.join(OUT, entry.intro)).size : 0
  const cueBytes = entry.cues.reduce((n, c) => n + (fs.existsSync(path.join(OUT, c.file)) ? fs.statSync(path.join(OUT, c.file)).size : 0), 0)
  total += introBytes
  console.log(`  ${clipId.padEnd(30)} intro ${(introBytes / 1024).toFixed(0).padStart(4)} KB · ${entry.cues.length} cues ${(cueBytes / 1024).toFixed(0).padStart(3)} KB`)
}
const cueFiles = [...jobs.keys()].filter((f) => f.startsWith('cue-'))
const cueTotal = cueFiles.reduce((n, f) => n + (fs.existsSync(path.join(OUT, f)) ? fs.statSync(path.join(OUT, f)).size : 0), 0)
console.log(`Total: intros ${(total / 1024).toFixed(0)} KB, ${cueFiles.length} shared cues ${(cueTotal / 1024).toFixed(0)} KB`)
