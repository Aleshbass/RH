// Encrypt the built exercise library and publish it as static files served by the app (Vercel's CDN).
//
//   node scripts/exercise-3d/publish.mjs
//
// Inputs (scripts/exercise-3d/out/, from build_all.py + pack-clips.mjs):
//   character.glb, motions/<id>.rhm, posters/<id>.webp, manifest.json
// Outputs:
//   public/exercise-library/<version>/c.rhx           encrypted character
//   public/exercise-library/<version>/m/<id>.rhx      encrypted motion clips
//   public/exercise-library/<version>/p/<id>.webp     posters (not secret)
//   convex/exerciseLibraryCatalog.ts                  generated catalog shared by Convex and the app
//
// Every asset is AES-256-GCM encrypted with its own key:
//   key = HKDF-SHA256(EXERCISE_ASSET_MASTER_KEY, salt "rehabify-exercise-library-v1", info "<assetId>:<version>")
// The same derivation runs in convex/exerciseLibrary.ts, which hands a key only to a viewer who
// is allowed to see that asset. File layout: "RHX1" | 12-byte IV | ciphertext | 16-byte GCM tag.
// The master key lives in .env.local and the Convex environment, never in git.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const OUT = path.join(HERE, 'out')
const PUBLIC_DIR = path.join(ROOT, 'public', 'exercise-library')
const CATALOG_FILE = path.join(ROOT, 'convex', 'exerciseLibraryCatalog.ts')
const SALT = Buffer.from('rehabify-exercise-library-v1', 'utf8')
const MAGIC = Buffer.from('RHX1', 'ascii')

dotenv.config({ path: path.join(ROOT, '.env.local') })
const masterB64 = process.env.EXERCISE_ASSET_MASTER_KEY
if (!masterB64) {
  console.error('EXERCISE_ASSET_MASTER_KEY is not set (add it to .env.local and the Convex environment).')
  process.exit(1)
}
const master = Buffer.from(masterB64, 'base64')
if (master.length < 32) {
  console.error('EXERCISE_ASSET_MASTER_KEY must be at least 32 random bytes, base64 encoded.')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'))
const characterBytes = fs.readFileSync(path.join(OUT, 'character.glb'))
const motions = manifest.exercises.map((e) => ({ ...e, data: fs.readFileSync(path.join(OUT, 'motions', `${e.id}.rhm`)) }))

// Voiceovers (voice/generate.mjs). Plain MP3s: narration has no value without the 3D demo.
const VOICE_DIR = path.join(OUT, 'voice')
const voiceIndexPath = path.join(VOICE_DIR, 'audio-index.json')
const voiceIndex = fs.existsSync(voiceIndexPath) ? JSON.parse(fs.readFileSync(voiceIndexPath, 'utf8')).clips : {}
const voiceFiles = [...new Set(Object.values(voiceIndex).flatMap((v) => [v.intro, ...v.cues.map((c) => c.file)]))].sort()

// Version = hash of everything that ships, so new content always gets new URLs.
const hash = crypto.createHash('sha256')
hash.update(characterBytes)
for (const m of motions) {
  hash.update(m.id)
  hash.update(m.data)
  hash.update(fs.readFileSync(path.join(OUT, 'posters', `${m.id}.webp`)))
}
for (const file of voiceFiles) {
  hash.update(file)
  hash.update(fs.readFileSync(path.join(VOICE_DIR, file)))
}
hash.update(JSON.stringify(voiceIndex))
const version = hash.digest('hex').slice(0, 12)

function keyFor(assetId) {
  return Buffer.from(crypto.hkdfSync('sha256', master, SALT, Buffer.from(`${assetId}:${version}`, 'utf8'), 32))
}

function encrypt(assetId, plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(assetId), iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, iv, body, cipher.getAuthTag()])
}

// Fresh output: only the current version is served.
fs.rmSync(PUBLIC_DIR, { recursive: true, force: true })
const dir = path.join(PUBLIC_DIR, version)
fs.mkdirSync(path.join(dir, 'm'), { recursive: true })
fs.mkdirSync(path.join(dir, 'p'), { recursive: true })

const character = encrypt('character', characterBytes)
fs.writeFileSync(path.join(dir, 'c.rhx'), character)

if (voiceFiles.length) {
  fs.mkdirSync(path.join(dir, 'a'), { recursive: true })
  for (const file of voiceFiles) fs.copyFileSync(path.join(VOICE_DIR, file), path.join(dir, 'a', file))
}

const clips = []
for (const m of motions) {
  const enc = encrypt(`motion:${m.id}`, m.data)
  fs.writeFileSync(path.join(dir, 'm', `${m.id}.rhx`), enc)
  fs.copyFileSync(path.join(OUT, 'posters', `${m.id}.webp`), path.join(dir, 'p', `${m.id}.webp`))
  const slug = m.side ? m.id.replace(/-(left|right)$/, '') : m.id
  const voice = voiceIndex[m.id]
  clips.push({
    id: m.id,
    slug,
    side: m.side ?? null,
    name: m.name,
    seconds: m.seconds,
    props: m.props,
    bytes: enc.length,
    quality: m.quality,
    audio: voice ? { intro: voice.intro, cues: voice.cues, transcript: voice.transcript } : null,
  })
}

const catalog = {
  version,
  basePath: `/exercise-library/${version}`,
  character: { file: 'c.rhx', bytes: character.length },
  clips,
}

const ts = `/* eslint-disable */
// Generated by scripts/exercise-3d/publish.mjs. Do not edit by hand; rebuild and republish instead.
// Encrypted assets live in public${catalog.basePath}/; their keys come only from exerciseLibrary.requestViewerGrant.

export type CatalogProp = {
  type: "chair" | "mat" | "step" | "wall" | "pillow";
  [key: string]: string | number;
};

export type CatalogClip = {
  id: string;
  slug: string;
  side: "L" | "R" | null;
  name: string;
  seconds: number;
  props: CatalogProp[];
  bytes: number;
  quality: { contactErrorMm: number; lowestPointMm: number };
  /** English voiceover (files under a/): intro once, cues at \`at\` seconds into every loop. */
  audio: { intro: string; cues: { at: number; file: string }[]; transcript: string } | null;
};

export const EXERCISE_CATALOG: {
  version: string;
  basePath: string;
  character: { file: string; bytes: number };
  clips: CatalogClip[];
} = ${JSON.stringify(catalog, null, 2)};

export function posterUrl(clipId: string) {
  return \`\${EXERCISE_CATALOG.basePath}/p/\${clipId}.webp\`;
}

export function findClip(clipId: string) {
  return EXERCISE_CATALOG.clips.find((c) => c.id === clipId) ?? null;
}

export function audioUrl(file: string) {
  return \`\${EXERCISE_CATALOG.basePath}/a/\${file}\`;
}
`
fs.writeFileSync(CATALOG_FILE, ts)

const total = character.length + clips.reduce((n, c) => n + c.bytes, 0)
console.log(`Published exercise library ${version}: ${clips.length} clips, ${(total / 1024).toFixed(0)} KB encrypted`)
console.log(`  ${path.relative(ROOT, dir)}`)
console.log(`  ${path.relative(ROOT, CATALOG_FILE)}`)
