// Pack Blender-exported exercise clips (GLB, skeleton + one animation) into compact motion files.
//
//   node scripts/exercise-3d/pack-clips.mjs
//
// Reads scripts/exercise-3d/out/character.glb (for the rest pose) and out/clips/*.glb, writes
// out/motions/<id>.rhm. Channels that never leave the character's rest pose are dropped,
// other constant channels are stored once, and animated rotations are stored as int16.
//
// .rhm layout (little endian):
//   u32 headerLength | header JSON (utf8) | padding to 4 bytes | data
// header: { v, fps, duration, times: [offset, count], tracks: [{ node, path, kind, offset, count }] }
//   kind "q16": count * 4 int16 quaternion components (value / 32767)
//   kind "f32": count * itemSize float32 values
// Every animated track shares the same sample times (float32 seconds at `times`).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')

function readGlb(file) {
  const buf = fs.readFileSync(file)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen + 8
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen))
  return { json, bin }
}

function accessorData({ json, bin }, index) {
  const acc = json.accessors[index]
  const view = json.bufferViews[acc.bufferView]
  if (acc.componentType !== 5126) throw new Error('Only float32 accessors are supported')
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type]
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0)
  const out = new Float32Array(acc.count * size)
  for (let i = 0; i < out.length; i++) out[i] = bin.readFloatLE(start + i * 4)
  return { data: out, size, count: acc.count }
}

function restPose(glb) {
  const rest = {}
  for (const node of glb.json.nodes) {
    rest[node.name] = {
      translation: node.translation || [0, 0, 0],
      rotation: node.rotation || [0, 0, 0, 1],
      scale: node.scale || [1, 1, 1],
    }
  }
  return rest
}

const near = (a, b, eps) => a.every((v, i) => Math.abs(v - b[i]) <= eps)

function sameRotation(a, b) {
  // q and -q are the same rotation
  return near(a, b, 2e-4) || near(a, b.map((v) => -v), 2e-4)
}

function packClip(file, rest) {
  const glb = readGlb(file)
  const anim = glb.json.animations?.[0]
  if (!anim) throw new Error(`${file} has no animation`)

  let times = null
  const tracks = []
  for (const ch of anim.channels) {
    const node = glb.json.nodes[ch.target.node].name
    const sampler = anim.samplers[ch.sampler]
    const input = accessorData(glb, sampler.input)
    const output = accessorData(glb, sampler.output)
    const pathName = ch.target.path
    const first = Array.from(output.data.subarray(0, output.size))
    const constant = Array.from({ length: output.count }, (_, i) =>
      Array.from(output.data.subarray(i * output.size, (i + 1) * output.size)),
    ).every((v) => (pathName === 'rotation' ? sameRotation(v, first) : near(v, first, 1e-4)))

    const restValue = rest[node]?.[pathName]
    if (constant) {
      const atRest = restValue && (pathName === 'rotation' ? sameRotation(first, restValue) : near(first, restValue, 1e-4))
      if (atRest) continue
      tracks.push({ node, path: pathName, values: first, size: output.size, constant: true })
      continue
    }
    if (!times) times = input.data
    else if (times.length !== input.data.length) throw new Error(`${file}: tracks have different sample counts`)
    tracks.push({ node, path: pathName, values: output.data, size: output.size, constant: false })
  }

  // Lay out the data block: times first, then each track.
  const chunks = []
  let offset = 0
  const push = (typed) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)
    chunks.push(bytes)
    const at = offset
    offset += bytes.length
    const pad = (4 - (offset % 4)) % 4
    if (pad) {
      chunks.push(Buffer.alloc(pad))
      offset += pad
    }
    return at
  }

  const header = { v: 1, fps: 30, duration: times ? times[times.length - 1] : 0, times: null, tracks: [] }
  if (times) header.times = [push(Float32Array.from(times)), times.length]
  for (const t of tracks) {
    const count = t.constant ? 1 : t.values.length / t.size
    if (t.path === 'rotation') {
      const q = new Int16Array(count * 4)
      for (let i = 0; i < count * 4; i++) q[i] = Math.round(Math.max(-1, Math.min(1, t.values[i])) * 32767)
      header.tracks.push({ node: t.node, path: t.path, kind: 'q16', offset: push(q), count })
    } else {
      header.tracks.push({ node: t.node, path: t.path, kind: 'f32', size: t.size, offset: push(Float32Array.from(t.values)), count })
    }
  }

  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const headPad = (4 - ((4 + headerBytes.length) % 4)) % 4
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32LE(headerBytes.length + headPad)
  return Buffer.concat([lenBuf, headerBytes, Buffer.alloc(headPad, 0x20), ...chunks])
}

const rest = restPose(readGlb(path.join(OUT, 'character.glb')))
const clipsDir = path.join(OUT, 'clips')
const motionsDir = path.join(OUT, 'motions')
fs.mkdirSync(motionsDir, { recursive: true })

let total = 0
for (const name of fs.readdirSync(clipsDir).filter((f) => f.endsWith('.glb')).sort()) {
  const packed = packClip(path.join(clipsDir, name), rest)
  const target = path.join(motionsDir, name.replace(/\.glb$/, '.rhm'))
  fs.writeFileSync(target, packed)
  const before = fs.statSync(path.join(clipsDir, name)).size
  total += packed.length
  console.log(`${name.padEnd(40)} ${(before / 1024).toFixed(1).padStart(6)} KB -> ${(packed.length / 1024).toFixed(1).padStart(5)} KB`)
}
console.log(`total motions: ${(total / 1024).toFixed(1)} KB`)
