// List Google Cloud Text-to-Speech voices and make one sample per candidate, so a voice can be
// picked by ear before generating the exercise voiceovers.
//
//   node scripts/exercise-3d/voice/voices.mjs
//
// Candidates: every Nigerian English (en-NG) voice, then the best male British and American
// voices (Chirp 3 HD first, then Neural2, then WaveNet). Samples are written to
// assets-src/voice-samples/ (gitignored).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { googleTts } from './googleTts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OUT = path.join(ROOT, 'assets-src', 'voice-samples')

const SAMPLE =
  'Stand with your feet hip-width apart. Push your hips back and bend your knees about a quarter of the way down. ' +
  'Slowly down. Hold. And up. Well done, keep going at your own pace.'

const tier = (name) => (name.includes('Chirp3-HD') ? 0 : name.includes('Chirp-HD') ? 1 : name.includes('Neural2') ? 2 : name.includes('Studio') ? 3 : name.includes('Wavenet') ? 4 : 9)

const tts = await googleTts(ROOT)
const all = await tts.listVoices()
console.log(`Google returned ${all.length} voices.`)

const english = (code) => all.filter((v) => v.languageCodes.includes(code))
const nigerian = english('en-NG')
console.log(nigerian.length ? `Nigerian English voices: ${nigerian.map((v) => v.name).join(', ')}` : 'No Nigerian English (en-NG) voices are available.')

const bestMale = (code, n) =>
  english(code)
    .filter((v) => v.ssmlGender === 'MALE' && tier(v.name) < 9)
    .sort((a, b) => tier(a.name) - tier(b.name) || a.name.localeCompare(b.name))
    .slice(0, n)

const candidates = [...nigerian.slice(0, 4), ...bestMale('en-GB', 3), ...bestMale('en-US', 3)]
fs.mkdirSync(OUT, { recursive: true })
for (const voice of candidates) {
  const code = voice.languageCodes[0]
  const file = path.join(OUT, `${voice.name}.mp3`)
  try {
    const mp3 = await tts.synthesize({ text: SAMPLE, languageCode: code, voiceName: voice.name })
    fs.writeFileSync(file, mp3)
    console.log(`  ${voice.name.padEnd(32)} ${voice.ssmlGender.padEnd(7)} ${(mp3.length / 1024).toFixed(0).padStart(4)} KB -> ${path.relative(ROOT, file)}`)
  } catch (error) {
    console.log(`  ${voice.name.padEnd(32)} FAILED: ${error.message}`)
  }
}
