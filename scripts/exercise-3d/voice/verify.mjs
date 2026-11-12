// Checks the exercise voiceovers that will ship (scripts/exercise-3d/out/voice), as the 3D player
// plays them (lib/exercise3d/voice.ts):
//   1. Cue timing: each cue, trimmed like the player trims it, ends before the next cue on the loop
//      (a new cue stops the one still playing), including the wrap from the last cue to the first.
//   2. Words: every intro and cue is transcribed (OpenAI Whisper) and matched word by word against
//      its script, so a skipped, garbled or cut-off line is caught. Intros must start and end with
//      their script's first and last words.
//   3. Trim: the player's silence trim doesn't clip a soft last word.
//   4. Sound: speech loudness close to the rest, no long pauses, a natural pace.
//   5. The camera coach's corrections and praise (lib/motion/cues.json, public/motion-cues/<version>/)
//      get the same word and sound checks; praise must be short enough to fit between reps.
//
//   node scripts/exercise-3d/voice/verify.mjs [--redo]
//
// --redo removes the failed files from voice-state.json so generate.mjs makes new takes of them.
// Needs Blender (to decode MP3s; BLENDER env var or the default install path) and OPENAI_API_KEY
// (environment, .env.local or the Convex prod environment). Transcripts are cached per file content.

import { execFileSync, execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..')
const OUT = path.join(HERE, '..', 'out', 'voice')
const redo = process.argv.includes('--redo')
const BLENDER = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'

// What the player does (lib/exercise3d/voice.ts): starts 20 ms before the first sample above 3% of
// the peak and plays (last - first) + 100 ms, so the last 100 ms are silence. Cues fire on the
// animation frame that crosses `at`; a late frame delays a cue by at most ~33 ms, which only eats
// into that silent tail, so the whole played clip (speech + tail) must end before the next cue.
const PLAYER_LEAD = 0.02
const PLAYER_TAIL = 0.1
const FRAME_SLACK = 0

const scripts = JSON.parse(fs.readFileSync(path.join(HERE, 'voice-scripts.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'out', 'manifest.json'), 'utf8'))
const index = JSON.parse(fs.readFileSync(path.join(OUT, 'audio-index.json'), 'utf8')).clips

// Expected text per file, built the same way as generate.mjs
const expected = new Map()
for (const [slug, script] of Object.entries(scripts)) {
  if (slug.startsWith('_')) continue
  for (const clip of manifest.exercises.filter((e) => e.id === slug || e.id === `${slug}-left` || e.id === `${slug}-right`)) {
    expected.set(`${clip.id}.intro.mp3`, script.intro.replaceAll('{side}', clip.side === 'R' ? 'right' : 'left'))
    for (const cue of script.cues) expected.set(`cue-${cue.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.mp3`, cue.text)
  }
}
// Camera coach clips, keyed "coach/<code>.mp3"
const coachCues = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'motion', 'cues.json'), 'utf8'))
for (const [code, text] of Object.entries(coachCues.cues)) expected.set(`coach/${code}.mp3`, text)
const isCoach = (f) => f.startsWith('coach/')
const pathOf = (f) => (isCoach(f) ? path.join(ROOT, 'public', 'motion-cues', coachCues.version, f.slice(6)) : path.join(OUT, f))
const files = [...expected.keys()].sort()
const missing = files.filter((f) => !fs.existsSync(pathOf(f)))
if (missing.length) {
  console.error(`Missing ${missing.length} file(s): ${missing.slice(0, 5).join(', ')}`)
  process.exit(1)
}

// ── 1. Measure the MP3s in Blender ──
const listPath = path.join(OUT, '.measure-list.json')
const measurePath = path.join(OUT, 'measure.json')
fs.writeFileSync(listPath, JSON.stringify(files.map(pathOf)))
execFileSync(BLENDER, ['-b', '--factory-startup', '--python', path.join(HERE, 'measure.py'), '--', listPath, measurePath], { stdio: ['ignore', 'ignore', 'inherit'] })
const measuredRaw = JSON.parse(fs.readFileSync(measurePath, 'utf8'))
const byPath = new Map(files.map((f) => [path.resolve(pathOf(f)), f]))
const m = Object.fromEntries(Object.entries(measuredRaw).map(([p, v]) => [byPath.get(path.resolve(p)), v]))
fs.rmSync(listPath, { force: true })

const problems = new Map() // file -> reasons
const flag = (file, reason) => problems.set(file, [...(problems.get(file) ?? []), reason])
const playLength = (file) => m[file].b - m[file].a + PLAYER_TAIL

// ── 2. Cue timing on the loop ──
const slack = []
for (const [clipId, entry] of Object.entries(index)) {
  const loop = manifest.exercises.find((e) => e.id === clipId).seconds
  entry.cues.forEach((cue, k) => {
    const next = k + 1 < entry.cues.length ? entry.cues[k + 1].at : loop + entry.cues[0].at
    const ends = cue.at + playLength(cue.file) + FRAME_SLACK
    slack.push({ clipId, file: cue.file, at: cue.at, ends, next, room: next - ends })
    if (ends > next) flag(cue.file, `${clipId}: plays ${cue.at.toFixed(2)}–${ends.toFixed(2)}s but the next cue starts at ${next.toFixed(2)}s`)
  })
}

// ── 3. Words ──
function openaiKey() {
  dotenv.config({ path: path.join(ROOT, '.env.local') })
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const key = execSync('npx convex env get OPENAI_API_KEY --prod', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  if (!key.startsWith('sk-')) throw new Error('No OPENAI_API_KEY')
  return key
}
const cachePath = path.join(OUT, 'transcripts.json')
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {}
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(pathOf(file))).digest('hex').slice(0, 16)
const todo = files.filter((f) => cache[f]?.sha !== sha(f))
if (todo.length) {
  const key = openaiKey()
  let i = 0
  const worker = async () => {
    while (i < todo.length) {
      const file = todo[i++]
      for (let attempt = 1; ; attempt++) {
        const form = new FormData()
        form.append('file', new Blob([fs.readFileSync(pathOf(file))], { type: 'audio/mpeg' }), path.basename(file))
        form.append('model', 'whisper-1')
        form.append('language', 'en')
        form.append('prompt', expected.get(file).length < 40 ? 'Exercise coaching cue.' : 'Physiotherapy exercise instructions.')
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
        if (res.ok) {
          cache[file] = { sha: sha(file), text: (await res.json()).text }
          break
        }
        if (attempt >= 4) throw new Error(`${file}: transcription ${res.status}`)
        await new Promise((r) => setTimeout(r, 2000 * attempt))
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1))
}

/** A second transcription (OpenAI's newer model) for any line Whisper disputes: Whisper invents text on very short clips. */
async function secondOpinion(file) {
  const key = openaiKey()
  if (cache[file]?.second?.sha === sha(file)) return cache[file].second.text
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(pathOf(file))], { type: 'audio/mpeg' }), path.basename(file))
  form.append('model', 'gpt-4o-transcribe')
  form.append('language', 'en')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form })
  if (!res.ok) throw new Error(`${file}: second transcription ${res.status}`)
  const text = (await res.json()).text
  cache[file].second = { sha: sha(file), text }
  return text
}

const SAME = { program: 'programme', programs: 'programmes', okay: 'ok', centre: 'center', tiptoes: 'tiptoe', tiptoe: 'tiptoe' }
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
/** Words, lower case, numbers spelled out; a final "s" running into a following "s" word is dropped ("legs swing" = "leg swing"). */
const words = (text) =>
  text
    .toLowerCase()
    .replace(/\b(\d+)\b/g, (n) => NUMBERS[Number(n)] ?? n)
    .replace(/[-–—]/g, ' ')
    .replace(/[^a-z' ]/g, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => SAME[w] ?? w)
    .map((w, i, all) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && all[i + 1]?.startsWith('s') ? w.slice(0, -1) : w))

/** Joins word pairs that the other side writes as one word ("door frame" / "doorframe", "on to" / "onto"). */
function joinCompounds(a, b) {
  const other = new Set(b)
  const out = []
  for (let i = 0; i < a.length; i++) {
    if (i + 1 < a.length && !other.has(a[i]) && other.has(a[i] + a[i + 1])) {
      out.push(a[i] + a[i + 1])
      i++
    } else if (i + 1 < a.length && other.has(a[i] + a[i + 1]) && !other.has(a[i + 1])) {
      out.push(a[i] + a[i + 1])
      i++
    } else out.push(a[i])
  }
  return out
}

/** Longest common subsequence: which script words were heard, in order. */
function heard(script, said) {
  const n = script.length
  const k = said.length
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(k + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) dp[i][j] = script[i] === said[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const matched = new Array(n).fill(false)
  for (let i = 0, j = 0; i < n && j < k; ) {
    if (script[i] === said[j]) {
      matched[i] = true
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return { matched, extra: k - dp[0][0] }
}

/** Problems with what was heard, or [] when the line says its script. */
function wordProblems(file, heardText) {
  let script = words(expected.get(file))
  let said = words(heardText)
  script = joinCompounds(script, said)
  said = joinCompounds(said, script)
  const { matched, extra } = heard(script, said)
  const missed = script.filter((_, i) => !matched[i])
  const out = []
  if (file.endsWith('.intro.mp3')) {
    if (missed.length > 2) out.push(`words missed: ${missed.join(' ')}`)
    if (!matched.slice(-3).every(Boolean)) out.push(`ending not heard (script ends "${script.slice(-3).join(' ')}", heard "...${said.slice(-5).join(' ')}")`)
    if (!matched.slice(0, 2).every(Boolean)) out.push(`start not heard (script starts "${script.slice(0, 3).join(' ')}", heard "${said.slice(0, 5).join(' ')}...")`)
    if (extra > 4) out.push(`extra words heard (${extra})`)
  } else if (missed.length || extra > 1) out.push(`heard "${heardText.trim()}" for "${expected.get(file)}"`)
  return out
}

// Whisper first; a disputed line passes only if the second transcription hears it right
for (const file of files) {
  const first = wordProblems(file, cache[file].text)
  if (!first.length) continue
  const second = await secondOpinion(file)
  const again = wordProblems(file, second)
  if (again.length) flag(file, `${again.join('; ')} (Whisper: "${cache[file].text.trim()}")`)
}
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1))

// ── 4. Trim, loudness, pauses, pace ──
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const introLoud = median(files.filter((f) => f.endsWith('.intro.mp3')).map((f) => m[f].speechDb))
const cueLoud = median(files.filter((f) => f.startsWith('cue-') || isCoach(f)).map((f) => m[f].speechDb))
for (const file of files) {
  const x = m[file]
  const intro = file.endsWith('.intro.mp3')
  const cut = x.strictB - (x.b + PLAYER_TAIL - PLAYER_LEAD)
  if (cut > 0.25) flag(file, `player trim would cut ${cut.toFixed(2)}s of soft sound at the end`)
  if (x.a - PLAYER_LEAD - x.strictA > 0.25) flag(file, `player trim would cut ${(x.a - PLAYER_LEAD - x.strictA).toFixed(2)}s of soft sound at the start`)
  const loud = intro ? introLoud : cueLoud
  if (Math.abs(x.speechDb - loud) > 4) flag(file, `loudness ${x.speechDb} dB vs ${loud} dB for the rest`)
  if (x.longestPause > (intro ? 1.5 : 0.7)) flag(file, `long pause ${x.longestPause}s`)
  const pace = expected.get(file).length / (x.b - x.a)
  if (intro && (pace < 10 || pace > 20)) flag(file, `pace ${pace.toFixed(1)} characters a second`)
  if (file.startsWith('coach/praise_') && x.b - x.a > 2.5) flag(file, `praise lasts ${(x.b - x.a).toFixed(2)}s: too long to fit between reps`)
}

// ── Report ──
const tight = slack.sort((a, b) => a.room - b.room).slice(0, 8)
const report = { checked: files.length, intros: files.filter((f) => f.endsWith('.intro.mp3')).length, cues: files.filter((f) => f.startsWith('cue-')).length, coach: files.filter(isCoach).length, problems: Object.fromEntries(problems), tightestCues: tight }
fs.writeFileSync(path.join(OUT, 'verify-report.json'), JSON.stringify(report, null, 1))
console.log(`Checked ${report.intros} intros, ${report.cues} cues (${slack.length} cue placements on ${Object.keys(index).length} clips) and ${report.coach} camera coach clips.`)
console.log('Tightest cue gaps:')
for (const t of tight) console.log(`  ${t.clipId.padEnd(28)} ${t.file.padEnd(34)} at ${t.at.toFixed(2)}s ends ${t.ends.toFixed(2)}s next ${t.next.toFixed(2)}s room ${t.room.toFixed(2)}s`)
if (!problems.size) console.log('All clear: every cue finishes before the next, every line says its whole script, nothing is trimmed.')
else {
  console.log(`${problems.size} file(s) need attention:`)
  for (const [file, reasons] of problems) console.log(`  ${file}\n    - ${reasons.join('\n    - ')}`)
}
if (redo && problems.size) {
  const statePath = path.join(OUT, 'voice-state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  for (const file of problems.keys()) if (!isCoach(file)) delete state[file]
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
  console.log(`--redo: ${problems.size} file(s) will be re-made by generate.mjs.`)
}
process.exit(problems.size ? 2 : 0)
