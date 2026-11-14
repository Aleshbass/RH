// Lip sync for the Learn simulations: reads every voice line (public/sims/<slug>/v<version>/*.mp3)
// and writes lips.json next to them: one mouth shape per 1/25 s, so the player can move the
// patient's mouth with the words on any phone (no Web Audio needed at play time).
//
// Shapes: x rest (lips closed) · m nearly closed (m, n, quiet sounds) · e wide (ee, s, t)
//         a open (ah) · o round (oh, oo)
// Loud frames open the mouth; how "bright" the sound is (energy in the high frequencies, read from
// the signal's first difference) picks wide, open or round. Simple, fast, and close enough at the
// size the face is drawn.
//
//   node scripts/sims/lips.mjs                 all cases
//   node scripts/sims/lips.mjs --case <slug>   one case
//
// Run it after scripts/sims/voice.mjs whenever lines change. Needs ffmpeg on the PATH.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const simsDir = path.join(root, 'public/sims')
const args = process.argv.slice(2)
const only = args.includes('--case') ? args[args.indexOf('--case') + 1] : null

const RATE = 16000
const FPS = 25
const HOP = RATE / FPS

function decode(file) {
  const buf = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], {
    maxBuffer: 64 * 1024 * 1024,
  })
  const out = new Float32Array(buf.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2) / 32768
  return out
}

const quantile = (values, q) => {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

/** Mouth shapes for one line, as a string with one character per frame. */
export function shapesFor(samples) {
  const frames = Math.ceil(samples.length / HOP)
  const energy = new Float32Array(frames)
  const bright = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    // A 50 ms window centred on the frame (a little overlap smooths the result)
    const start = Math.max(1, Math.floor(f * HOP - HOP * 0.125))
    const end = Math.min(samples.length, Math.floor((f + 1) * HOP + HOP * 0.125))
    let e = 0
    let d = 0
    for (let i = start; i < end; i++) {
      e += samples[i] * samples[i]
      const diff = samples[i] - samples[i - 1]
      d += diff * diff
    }
    const n = Math.max(1, end - start)
    energy[f] = Math.sqrt(e / n)
    bright[f] = e > 1e-9 ? d / e : 0
  }
  const loud = quantile(Array.from(energy), 0.9) || 1
  const level = Array.from(energy, (e) => e / loud)
  const voiced = Array.from(bright).filter((_, f) => level[f] > 0.25)
  const lowB = quantile(voiced, 0.33)
  const highB = quantile(voiced, 0.72)
  let shapes = level.map((l, f) => {
    if (l < 0.1) return 'x'
    const b = bright[f]
    if (b > highB * 1.8) return l < 0.5 ? 'e' : 'a' // hiss (s, sh, f): teeth nearly together
    if (l < 0.3) return 'm'
    if (b >= highB) return 'e'
    if (b <= lowB) return 'o'
    return 'a'
  })
  // Smooth: drop one-frame flickers (except closing, which reads as syllables)
  shapes = shapes.map((s, f) => {
    const prev = shapes[f - 1]
    const next = shapes[f + 1]
    if (s !== 'x' && prev && prev === next && prev !== s) return prev
    return s
  })
  shapes[0] = 'x'
  shapes[shapes.length - 1] = 'x'
  return shapes.join('')
}

const cases = existsSync(simsDir) ? readdirSync(simsDir).filter((d) => !only || d === only) : []
if (!cases.length) {
  console.log(only ? `No voices for "${only}".` : 'No voices yet.')
  process.exit(0)
}
for (const slug of cases) {
  const caseDir = path.join(simsDir, slug)
  for (const v of readdirSync(caseDir).filter((d) => /^v\d+$/.test(d))) {
    const dir = path.join(caseDir, v)
    const mp3s = readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort()
    if (!mp3s.length) continue
    const lines = {}
    for (const f of mp3s) lines[f.slice(0, -4)] = shapesFor(decode(path.join(dir, f)))
    writeFileSync(path.join(dir, 'lips.json'), JSON.stringify({ fps: FPS, lines }) + '\n')
    const counts = {}
    for (const s of Object.values(lines).join('')) counts[s] = (counts[s] ?? 0) + 1
    console.log(`${slug}/${v}: ${mp3s.length} lines`, counts)
  }
}
