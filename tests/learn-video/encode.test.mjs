// Encode test: a 10-second ffmpeg test clip → AES-128 HLS (480p + 720p) with the real pipeline.
// Proves the segments are encrypted (unplayable as-is) and decrypt with the right key only.
// Needs ffmpeg (FFMPEG_PATH, PATH or a winget install). Run: npm run test:video
import assert from 'node:assert/strict'
import { createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after, before, test } from 'node:test'
import { encodeHls, findTool, probe } from '../../scripts/learn-video/pipeline.mjs'

const ffmpeg = findTool('ffmpeg')
const hasFfmpeg = spawnSync(ffmpeg, ['-version']).status === 0
let dir, clip, out
const key = new Uint8Array(randomBytes(16))

before(async () => {
  if (!hasFfmpeg) return
  dir = await mkdtemp(path.join(tmpdir(), 'rhv-test-'))
  clip = path.join(dir, 'clip.mp4')
  out = path.join(dir, 'out')
  const made = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
    '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip,
  ])
  assert.equal(made.status, 0, made.stderr?.toString())
})

after(async () => {
  if (dir && !process.env.KEEP_VIDEO_TEST) await rm(dir, { recursive: true, force: true })
})

/** IV for segment n in an HLS playlist without an IV attribute: the media sequence number. */
function ivFor(sequence) {
  const iv = Buffer.alloc(16)
  iv.writeUInt32BE(sequence, 12)
  return iv
}

test('a 10-second clip encodes to encrypted HLS at 480p and 720p', { skip: !hasFfmpeg && 'ffmpeg not found' }, async () => {
  const info = await probe(clip)
  assert.ok(info.durationSec > 9.5 && info.durationSec < 10.5)
  const result = await encodeHls({ input: clip, outDir: out, key })
  assert.deepEqual(result.renditions.map((r) => r.name), ['480p', '720p'])
  for (const r of result.renditions) {
    assert.ok(r.bandwidth > 0)
    const playlist = await readFile(path.join(out, r.name, 'index.m3u8'), 'utf8')
    assert.match(playlist, /#EXT-X-KEY:METHOD=AES-128,URI="key"/)
    assert.match(playlist, /#EXT-X-PLAYLIST-TYPE:VOD/)
    const segments = playlist.split('\n').filter((l) => /^seg_\d{4}\.ts$/.test(l.trim()))
    assert.ok(segments.length >= 2, 'about two 6-second segments')
  }
  // The key file never stays on disk next to the output
  const files = await readdir(out, { recursive: true })
  assert.ok(!files.some((f) => /key/i.test(path.basename(String(f)))), 'no key file in the output')
})

test('segments are unplayable without the key and play with it', { skip: !hasFfmpeg && 'ffmpeg not found' }, async () => {
  const ffprobe = findTool('ffprobe')
  const first = path.join(out, '720p', 'seg_0000.ts')
  const raw = await readFile(first)
  // MPEG-TS packets start with 0x47 every 188 bytes; encrypted data doesn't
  assert.notEqual(raw[0], 0x47, 'segment is not plain MPEG-TS')
  assert.notEqual(spawnSync(ffprobe, ['-v', 'error', '-show_streams', first]).stdout.toString().includes('codec_type=video'), true)

  const decipher = createDecipheriv('aes-128-cbc', key, ivFor(0))
  const plain = Buffer.concat([decipher.update(raw), decipher.final()])
  assert.equal(plain[0], 0x47, 'decrypted segment is MPEG-TS')
  const decrypted = path.join(dir, 'decrypted.ts')
  await writeFile(decrypted, plain)
  const probed = spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,height', '-of', 'csv=p=0', decrypted]).stdout.toString()
  assert.match(probed, /video,720/)

  // A different key gives garbage (or a padding error)
  const wrong = createDecipheriv('aes-128-cbc', randomBytes(16), ivFor(0))
  let wrongPlain = null
  try {
    wrongPlain = Buffer.concat([wrong.update(raw), wrong.final()])
  } catch {
    wrongPlain = null
  }
  assert.ok(!wrongPlain || wrongPlain[0] !== 0x47 || wrongPlain[188] !== 0x47)
})
