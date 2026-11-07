// Spoken corrections for the camera coach, in the same Google voice as the exercise voiceovers.
//
//   node scripts/motion/generate-cues.mjs [--force]
//
// Reads lib/motion/cues.json (code -> text) and the voice in scripts/exercise-3d/voice/voice.json,
// writes public/motion-cues/<version>/<code>.mp3. Existing files are kept unless --force; change
// the version in cues.json when a text changes, so phones don't keep an old cached clip.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { googleTts } from '../exercise-3d/voice/googleTts.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const force = process.argv.includes('--force')

const { version, cues } = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'motion', 'cues.json'), 'utf8'))
const voice = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'exercise-3d', 'voice', 'voice.json'), 'utf8'))
const out = path.join(ROOT, 'public', 'motion-cues', version)
fs.mkdirSync(out, { recursive: true })

const tts = await googleTts(ROOT)
let made = 0
for (const [code, text] of Object.entries(cues)) {
  const file = path.join(out, `${code}.mp3`)
  if (!force && fs.existsSync(file)) continue
  const mp3 = await tts.synthesize({ text, languageCode: voice.languageCode, voiceName: voice.voiceName, speakingRate: voice.cueRate })
  fs.writeFileSync(file, mp3)
  made++
  console.log(`${code}.mp3  ${(mp3.length / 1024).toFixed(1)} KB  "${text}"`)
}
console.log(`${made} made, ${Object.keys(cues).length - made} kept, in public/motion-cues/${version}/`)
