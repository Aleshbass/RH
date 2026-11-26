/**
 * Writes the real length into a video made with MediaRecorder (owner 2026-11-26: "the TikTok
 * download works but the length is 00:00").
 *
 * Chrome and Edge record MP4 as fragments and leave the movie's duration at 0, and their WebM has
 * no duration at all, so phone galleries, WhatsApp and TikTok show 00:00 (players that scan the
 * whole file, like VLC, don't notice). This patches the headers in place:
 *   MP4:  mvhd, tkhd and mdhd durations, plus an mehd box (the length of a fragmented movie) when
 *         that's safe to insert.
 *   WebM: a Duration element in the Segment Info.
 * Anything it doesn't recognise is returned unchanged: a video without a length beats no video.
 *
 * No imports and only erasable TypeScript, so `node --test` runs it as it is.
 */

type Box = { type: string; start: number; header: number; size: number }

function readBoxes(b: Uint8Array, dv: DataView, start: number, end: number): Box[] {
  const out: Box[] = []
  let o = start
  while (o + 8 <= end) {
    let size = dv.getUint32(o)
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7])
    let header = 8
    if (size === 1) {
      if (o + 16 > end) break
      size = Number(dv.getBigUint64(o + 8))
      header = 16
    } else if (size === 0) size = end - o
    if (size < header || o + size > end) break
    out.push({ type, start: o, header, size })
    o += size
  }
  return out
}

const child = (b: Uint8Array, dv: DataView, box: Box, type: string) =>
  readBoxes(b, dv, box.start + box.header, box.start + box.size).find((x) => x.type === type)
const children = (b: Uint8Array, dv: DataView, box: Box, type: string) =>
  readBoxes(b, dv, box.start + box.header, box.start + box.size).filter((x) => x.type === type)

/** Full-box duration field: version 0 = 32 bits, version 1 = 64 bits, at the given offsets. */
function setDuration(b: Uint8Array, dv: DataView, box: Box, offsetV0: number, offsetV1: number, value: number) {
  const at = box.start + box.header
  const version = b[at]
  const v = Math.max(0, Math.round(value))
  if (version === 1) dv.setBigUint64(at + offsetV1, BigInt(v))
  else dv.setUint32(at + offsetV0, Math.min(v, 0xffffffff))
}

function timescaleOf(b: Uint8Array, dv: DataView, box: Box) {
  const at = box.start + box.header
  return dv.getUint32(at + (b[at] === 1 ? 20 : 12))
}

export function fixMp4Duration(input: Uint8Array, seconds: number): Uint8Array {
  if (!(seconds > 0)) return input
  const b = new Uint8Array(input)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const top = readBoxes(b, dv, 0, b.length)
  const moov = top.find((x) => x.type === 'moov')
  if (!moov) return input
  const mvhd = child(b, dv, moov, 'mvhd')
  if (!mvhd) return input
  const movieScale = timescaleOf(b, dv, mvhd)
  if (!movieScale) return input
  // mvhd: version 0 duration at +16, version 1 at +24 (after version/flags, times, timescale)
  setDuration(b, dv, mvhd, 16, 24, seconds * movieScale)
  for (const trak of children(b, dv, moov, 'trak')) {
    const tkhd = child(b, dv, trak, 'tkhd')
    // tkhd: duration after created, modified, track id and a reserved word
    if (tkhd) setDuration(b, dv, tkhd, 20, 28, seconds * movieScale)
    const mdia = child(b, dv, trak, 'mdia')
    const mdhd = mdia ? child(b, dv, mdia, 'mdhd') : undefined
    if (mdhd) {
      const scale = timescaleOf(b, dv, mdhd)
      if (scale) setDuration(b, dv, mdhd, 16, 24, seconds * scale)
    }
  }

  // A fragmented movie's length belongs in mvex/mehd. Inserting it shifts everything after moov,
  // which is only safe when nothing points at absolute file positions (no base_data_offset in the
  // fragments, no mfra index), as with Chrome's recordings
  const mvex = child(b, dv, moov, 'mvex')
  if (!mvex) return b
  const mehd = child(b, dv, mvex, 'mehd')
  if (mehd) {
    setDuration(b, dv, mehd, 4, 4, seconds * movieScale)
    return b
  }
  if (top.some((x) => x.type === 'mfra' || x.type === 'sidx')) return b
  for (const moof of top.filter((x) => x.type === 'moof')) {
    for (const traf of children(b, dv, moof, 'traf')) {
      const tfhd = child(b, dv, traf, 'tfhd')
      if (!tfhd) return b
      const flags = (b[tfhd.start + tfhd.header + 1] << 16) | (b[tfhd.start + tfhd.header + 2] << 8) | b[tfhd.start + tfhd.header + 3]
      if (flags & 0x000001) return b
    }
  }
  // Every size field on the path from the file's top to the new box grows by 20 bytes
  if (moov.header !== 8 || mvex.header !== 8) return b
  const add = 20
  const out = new Uint8Array(b.length + add)
  const insertAt = mvex.start + mvex.header
  out.set(b.subarray(0, insertAt), 0)
  const box = new DataView(out.buffer, insertAt, add)
  box.setUint32(0, add)
  box.setUint8(4, 0x6d) // m
  box.setUint8(5, 0x65) // e
  box.setUint8(6, 0x68) // h
  box.setUint8(7, 0x64) // d
  box.setUint32(8, 0x01000000) // version 1, no flags
  box.setBigUint64(12, BigInt(Math.round(seconds * movieScale)))
  out.set(b.subarray(insertAt), insertAt + add)
  const odv = new DataView(out.buffer)
  odv.setUint32(moov.start, moov.size + add)
  odv.setUint32(mvex.start, mvex.size + add)
  return out
}

// ── WebM (EBML) ──────────────────────────────────────────────────────────────

const EBML_ID = 0x1a45dfa3
const SEGMENT = 0x18538067
const INFO = 0x1549a966
const TIMECODE_SCALE = 0x2ad7b1
const DURATION = 0x4489
const SEEK_HEAD = 0x114d9b74
const CUES = 0x1c53bb6b

function readId(b: Uint8Array, o: number): { id: number; len: number } | null {
  const first = b[o]
  let len = 1
  while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 4 || o + len > b.length) return null
  let id = 0
  for (let i = 0; i < len; i++) id = id * 256 + b[o + i]
  return { id, len }
}

function readSize(b: Uint8Array, o: number): { value: number; len: number; unknown: boolean } | null {
  const first = b[o]
  let len = 1
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 8 || o + len > b.length) return null
  let value = first & ((0x80 >> (len - 1)) - 1)
  let allOnes = value === (0x80 >> (len - 1)) - 1
  for (let i = 1; i < len; i++) {
    value = value * 256 + b[o + i]
    if (b[o + i] !== 0xff) allOnes = false
  }
  return { value, len, unknown: allOnes }
}

/** A size in exactly `len` bytes, or null if it doesn't fit. */
function writeSize(value: number, len: number): Uint8Array | null {
  if (value >= Math.pow(2, 7 * len) - 1) return null
  const out = new Uint8Array(len)
  let v = value
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 256
    v = Math.floor(v / 256)
  }
  out[0] |= 0x80 >> (len - 1)
  return out
}

export function fixWebmDuration(input: Uint8Array, seconds: number): Uint8Array {
  if (!(seconds > 0)) return input
  const b = input
  const head = readId(b, 0)
  const headSize = head ? readSize(b, head.len) : null
  if (!head || head.id !== EBML_ID || !headSize) return input
  const segAt = head.len + headSize.len + headSize.value
  const seg = readId(b, segAt)
  const segSize = seg ? readSize(b, segAt + seg.len) : null
  if (!seg || seg.id !== SEGMENT || !segSize) return input
  const segData = segAt + seg.len + segSize.len

  // Find Info among the first level-1 elements; give up on files with position indexes after it
  let o = segData
  let info: { at: number; idLen: number; size: { value: number; len: number }; data: number } | null = null
  for (let k = 0; k < 16 && o < b.length; k++) {
    const id = readId(b, o)
    const size = id ? readSize(b, o + id.len) : null
    if (!id || !size) return input
    if (id.id === SEEK_HEAD || id.id === CUES) return input
    if (id.id === INFO) {
      info = { at: o, idLen: id.len, size, data: o + id.len + size.len }
      break
    }
    if (size.unknown) return input
    o += id.len + size.len + size.value
  }
  if (!info) return input

  // Read the timecode scale; patch an existing Duration in place
  let scale = 1_000_000
  let q = info.data
  const infoEnd = info.data + info.size.value
  while (q < infoEnd) {
    const id = readId(b, q)
    const size = id ? readSize(b, q + id.len) : null
    if (!id || !size) return input
    const data = q + id.len + size.len
    if (id.id === TIMECODE_SCALE) {
      let v = 0
      for (let i = 0; i < size.value; i++) v = v * 256 + b[data + i]
      if (v > 0) scale = v
    }
    if (id.id === DURATION) {
      const out = new Uint8Array(b)
      const dv = new DataView(out.buffer)
      const value = (seconds * 1e9) / scale
      if (size.value === 8) dv.setFloat64(data, value)
      else if (size.value === 4) dv.setFloat32(data, value)
      else return input
      return out
    }
    q = data + size.value
  }

  // Insert Duration (float64) at the end of Info: ID 44 89, size 88, 8 bytes
  const element = new Uint8Array(11)
  element[0] = 0x44
  element[1] = 0x89
  element[2] = 0x88
  new DataView(element.buffer).setFloat64(3, (seconds * 1e9) / scale)
  const newInfoSize = writeSize(info.size.value + element.length, info.size.len)
  if (!newInfoSize) return input
  let newSegSize: Uint8Array | null = null
  if (!segSize.unknown) {
    newSegSize = writeSize(segSize.value + element.length, segSize.len)
    if (!newSegSize) return input
  }
  const out = new Uint8Array(b.length + element.length)
  out.set(b.subarray(0, infoEnd), 0)
  out.set(element, infoEnd)
  out.set(b.subarray(infoEnd), infoEnd + element.length)
  out.set(newInfoSize, info.at + info.idLen)
  if (newSegSize) out.set(newSegSize, segAt + seg.len)
  return out
}

/** The recorded file with its real length written in (unchanged if the format isn't recognised). */
export async function withDuration(blob: Blob, seconds: number): Promise<Blob> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const type = blob.type.split(';')[0]
    const fixed = type === 'video/mp4' ? fixMp4Duration(bytes, seconds) : type === 'video/webm' ? fixWebmDuration(bytes, seconds) : bytes
    return fixed === bytes ? blob : new Blob([fixed as BlobPart], { type: blob.type })
  } catch {
    return blob
  }
}
