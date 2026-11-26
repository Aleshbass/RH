// The replay video's length fix (components/learn/sims/replay/videoDuration.ts). Run with `npm run test:sim`.
// Files are built here in the same shape Chrome's MediaRecorder writes: fragmented MP4 with a zero
// movie duration, and WebM with an unknown-size Segment and no Duration.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixMp4Duration, fixWebmDuration } from '../../components/learn/sims/replay/videoDuration.ts'

const ascii = (s) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u64 = (n) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)]
const box = (type, ...body) => {
  const inner = body.flat()
  return [...u32(inner.length + 8), ...ascii(type), ...inner]
}
const full = (version, flags = 0) => [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]

// mvhd/mdhd v1: version+flags, created(8), modified(8), timescale(4), duration(8), rest
const mvhd = (scale) => box('mvhd', full(1), u64(0), u64(0), u32(scale), u64(0), new Array(80).fill(0))
const tkhd = () => box('tkhd', full(1, 3), u64(0), u64(0), u32(1), u32(0), u64(0), new Array(60).fill(0))
const mdhd = (scale) => box('mdhd', full(1), u64(0), u64(0), u32(scale), u64(0), u32(0))
const trex = () => box('trex', full(0), u32(1), u32(1), u32(0), u32(0), u32(0))
const tfhd = (flags) => box('tfhd', full(0, flags), u32(1))
const mdatBytes = [9, 8, 7, 6, 5]

function chromeMp4(tfhdFlags = 0x020000) {
  return new Uint8Array([
    ...box('ftyp', ascii('isom'), u32(512), ascii('isomiso6')),
    ...box('moov', mvhd(1000), box('trak', tkhd(), box('mdia', mdhd(48000))), box('mvex', trex())),
    ...box('moof', box('mfhd', full(0), u32(1)), box('traf', tfhd(tfhdFlags))),
    ...box('mdat', mdatBytes),
  ])
}

function boxes(b, start = 0, end = b.length) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out = []
  for (let o = start; o + 8 <= end; ) {
    const size = dv.getUint32(o)
    out.push({ type: String.fromCharCode(...b.subarray(o + 4, o + 8)), start: o, size })
    o += size
  }
  return out
}
const find = (b, path) => {
  let list = boxes(b)
  let hit
  for (const type of path) {
    hit = list.find((x) => x.type === type)
    if (!hit) return null
    list = boxes(b, hit.start + 8, hit.start + hit.size)
  }
  return hit
}
const dur64 = (b, hit, at) => Number(new DataView(b.buffer, b.byteOffset).getBigUint64(hit.start + 8 + at))

test('MP4: writes the length into mvhd, tkhd, mdhd and a new mehd', () => {
  const out = fixMp4Duration(chromeMp4(), 12.5)
  assert.equal(dur64(out, find(out, ['moov', 'mvhd']), 24), 12500)
  assert.equal(dur64(out, find(out, ['moov', 'trak', 'tkhd']), 28), 12500)
  assert.equal(dur64(out, find(out, ['moov', 'trak', 'mdia', 'mdhd']), 24), 12.5 * 48000)
  const mehd = find(out, ['moov', 'mvex', 'mehd'])
  assert.ok(mehd, 'mehd added')
  assert.equal(dur64(out, mehd, 4), 12500)
  // Sizes stay consistent and the media data is untouched
  const top = boxes(out)
  assert.deepEqual(top.map((x) => x.type), ['ftyp', 'moov', 'moof', 'mdat'])
  assert.equal(top.at(-1).start + top.at(-1).size, out.length)
  assert.deepEqual([...out.subarray(out.length - mdatBytes.length)], mdatBytes)
})

test('MP4: no mehd when a fragment uses absolute offsets (would break them)', () => {
  const input = chromeMp4(0x000001)
  const out = fixMp4Duration(input, 3)
  assert.equal(out.length, input.length)
  assert.equal(find(out, ['moov', 'mvex', 'mehd']), null)
  assert.equal(dur64(out, find(out, ['moov', 'mvhd']), 24), 3000)
})

test('MP4: anything unrecognised comes back unchanged', () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(fixMp4Duration(junk, 3), junk)
  assert.equal(fixMp4Duration(chromeMp4(), 0).length, chromeMp4().length)
})

// ── WebM ──
const el = (id, body) => [...id, 0x80 | body.length, ...body]
function chromeWebm({ withDuration = false } = {}) {
  const info = [...el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40]), ...el([0x4d, 0x80], ascii('Chrome'))]
  if (withDuration) info.push(0x44, 0x89, 0x88, 0, 0, 0, 0, 0, 0, 0, 0)
  return new Uint8Array([
    ...el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], ascii('webm'))),
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, // Segment, unknown size
    ...el([0x15, 0x49, 0xa9, 0x66], info),
    ...el([0x16, 0x54, 0xae, 0x6b], [0xae, 0x80]), // Tracks
    0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, // Cluster, unknown size
    0xe7, 0x81, 0x00,
  ])
}
function webmDuration(b) {
  for (let i = 0; i + 11 <= b.length; i++) {
    if (b[i] === 0x44 && b[i + 1] === 0x89 && b[i + 2] === 0x88) return new DataView(b.buffer, b.byteOffset).getFloat64(i + 3)
  }
  return null
}

test('WebM: inserts Duration into Info (in milliseconds at the default scale)', () => {
  const input = chromeWebm()
  const out = fixWebmDuration(input, 7.25)
  assert.equal(out.length, input.length + 11)
  assert.equal(webmDuration(out), 7250)
  // Info's size grew by 11; the rest of the file follows unchanged
  const infoAt = out.indexOf(0x15)
  assert.equal(out[infoAt + 4] & 0x7f, (input[infoAt + 4] & 0x7f) + 11)
  assert.deepEqual([...out.subarray(out.length - 3)], [0xe7, 0x81, 0x00])
})

test('WebM: an existing Duration is overwritten in place', () => {
  const input = chromeWebm({ withDuration: true })
  const out = fixWebmDuration(input, 2)
  assert.equal(out.length, input.length)
  assert.equal(webmDuration(out), 2000)
})

test('WebM: not a WebM comes back unchanged', () => {
  const junk = new Uint8Array([0, 1, 2, 3])
  assert.equal(fixWebmDuration(junk, 3), junk)
})
