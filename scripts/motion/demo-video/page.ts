/**
 * Browser half of the camera-coach demo video (render.mjs): the Rehabify character exercises in a
 * simple living room while the camera-coach overlay is drawn on top (dotted skeleton, joint dots,
 * the coach in a card, a rep counter with a progress arc). Reps and scores come from the real rep
 * engine (lib/motion). Frames are encoded with WebCodecs (H.264) into an MP4 that loops.
 */
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { motionExercise } from '@/lib/motion/exercises'
import type { Frame, Point } from '@/lib/motion/pose'
import { SessionTracker } from '@/lib/motion/session'

declare global {
  interface Window {
    __video?: string
    __poster?: string
    __error?: string
    __done?: boolean
    __info?: unknown
  }
}

const params = new URLSearchParams(location.search)
const W = Number(params.get('w') ?? 1280)
const H = Number(params.get('h') ?? 720)
const FPS = 30
const REPS = Number(params.get('reps') ?? 3)
const BITRATE = Number(params.get('bitrate') ?? 1_000_000) // H.264 fallback; ?av1= and ?vp9= set the others
const clipId = params.get('clip') ?? 'shoulder-flexion'
const exercise = motionExercise(params.get('exercise') ?? 'shoulder-flexion')!
const title = params.get('title') ?? 'Shoulder flexion'
const OUTRO = 1.6 // seconds of "Set complete" before the loop starts again
/** ?still=<seconds>: render just that one frame as a PNG (for checking the look), no video */
const STILL = params.has('still') ? Number(params.get('still')) : null

const GREEN = '#22d34a'
const INK = '#0b1f1d'
const FONT = '"Segoe UI", system-ui, sans-serif'

function room(scene: THREE.Scene) {
  const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })
  const add = (mesh: THREE.Mesh, x: number, y: number, z: number, receive = true, cast = false) => {
    mesh.position.set(x, y, z)
    mesh.receiveShadow = receive
    mesh.castShadow = cast
    scene.add(mesh)
    return mesh
  }
  const box = (w: number, h: number, d: number, color: number, extra = {}) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra))

  // Floor (warm wood) and two walls meeting in the corner behind the character
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat(0xb88d63, { roughness: 0.7 })), 0, 0, 0)
  floor.rotation.x = -Math.PI / 2
  add(box(9, 3.2, 0.1, 0xfaf4ea), 0, 1.6, -2.4)
  add(box(0.1, 3.2, 9, 0xf6efe3), -2.8, 1.6, 0)
  // Skirting
  add(box(9, 0.1, 0.03, 0xffffff), 0, 0.05, -2.34)
  add(box(0.03, 0.1, 9, 0xffffff), -2.74, 0.05, 0)

  // Big bright window on the back wall, with a frame and bars
  const glass = new THREE.MeshBasicMaterial({ color: 0xf4fbff })
  add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), glass), -0.6, 1.65, -2.34, false)
  for (const [w, h, x, y] of [[2.32, 0.07, -0.6, 2.48], [2.32, 0.07, -0.6, 0.82], [0.07, 1.72, -1.76, 1.65], [0.07, 1.72, 0.56, 1.65], [0.05, 1.6, -0.6, 1.65], [2.2, 0.05, -0.6, 1.95]] as const) {
    add(box(w, h, 0.06, 0xffffff), x, y, -2.32)
  }
  add(box(2.5, 0.05, 0.22, 0xffffff), -0.6, 0.8, -2.25) // sill

  // Sofa along the side wall
  const sofa = 0x1f5c55
  add(box(0.9, 0.42, 2.2, sofa), -2.25, 0.21, 0.6, true, true)
  add(box(0.25, 0.75, 2.2, sofa), -2.62, 0.55, 0.6, true, true)
  add(box(0.9, 0.6, 0.22, sofa), -2.25, 0.3, -0.45, true, true)
  add(box(0.9, 0.6, 0.22, sofa), -2.25, 0.3, 1.65, true, true)
  add(box(0.18, 0.4, 0.45, 0xd9a441), -2.42, 0.6, 0.1, true, true) // cushions
  add(box(0.18, 0.38, 0.42, 0xe8e2d6), -2.42, 0.6, 0.65, true, true)

  // Plant in the corner
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.4, 24), mat(0xf2efe9)), -2.35, 0.2, -1.95, true, true)
  const leaf = mat(0x3f7d3a)
  for (const [x, y, z, r] of [[-2.35, 0.75, -1.95, 0.26], [-2.25, 0.95, -1.9, 0.2], [-2.45, 1.05, -2.0, 0.18], [-2.3, 1.2, -2.02, 0.15]] as const) {
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf), x, y, z, true, true)
  }

  // Low shelf with books under the window, and a picture on the side wall
  add(box(1.3, 0.5, 0.35, 0xf6f3ee), 1.5, 0.25, -2.15, true, true)
  for (const [x, h, c] of [[1.05, 0.26, 0xc6552f], [1.13, 0.3, 0x2f6f8f], [1.2, 0.24, 0xe0b04a], [1.27, 0.28, 0x3f7d3a]] as const) {
    add(box(0.06, h, 0.22, c), x, 0.5 + h / 2, -2.15, true, true)
  }
  add(box(0.04, 0.7, 0.9, 0x2b2b2b), -2.74, 1.75, 0.6)
  add(box(0.02, 0.6, 0.8, 0xd8c7a6), -2.72, 1.75, 0.6)

  // Rug under the character
  const rug = add(new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), mat(0xd9cdb8)), 0, 0.004, 0.1)
  rug.rotation.x = -Math.PI / 2
}

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b291, 1.7))
  scene.add(new THREE.AmbientLight(0xfff8ee, 0.35))
  const sun = new THREE.DirectionalLight(0xfff4e5, 2.4)
  sun.position.set(-1.2, 3.8, -2.6) // through the window
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -4
  sun.shadow.camera.right = 4
  sun.shadow.camera.top = 4
  sun.shadow.camera.bottom = -4
  sun.shadow.bias = -0.0004
  sun.shadow.radius = 4
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xeaf3ff, 0.9)
  fill.position.set(3, 2, 3)
  scene.add(fill)
}

/** Bone heads used for the overlay, as MediaPipe points too (so the real rep engine can read them). */
const OVERLAY = {
  shoulderL: 'LeftArm', shoulderR: 'RightArm', elbowL: 'LeftForeArm', elbowR: 'RightForeArm', wristL: 'LeftHand', wristR: 'RightHand',
  hipL: 'LeftUpLeg', hipR: 'RightUpLeg', kneeL: 'LeftLeg', kneeR: 'RightLeg', ankleL: 'LeftFoot', ankleR: 'RightFoot', neck: 'Neck', pelvis: 'Hips',
} as const
type Key = keyof typeof OVERLAY
const BONE_LINES: [Key, Key][] = [
  ['shoulderL', 'neck'], ['neck', 'shoulderR'], ['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['shoulderR', 'elbowR'], ['elbowR', 'wristR'],
  ['neck', 'pelvis'], ['hipL', 'pelvis'], ['pelvis', 'hipR'], ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['hipR', 'kneeR'], ['kneeR', 'ankleR'],
]
const MP: Partial<Record<Key, number>> = { shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28 }

function dottedLine(g: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, gap: number, r: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(1, Math.floor(len / gap))
  g.fillStyle = 'rgba(255,255,255,0.95)'
  for (let i = 1; i < n; i++) {
    const t = i / n
    g.beginPath()
    g.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, r, 0, Math.PI * 2)
    g.fill()
  }
}

function joint(g: CanvasRenderingContext2D, p: { x: number; y: number }, r: number) {
  g.fillStyle = 'rgba(8,28,24,0.35)'
  g.beginPath()
  g.arc(p.x, p.y, r * 1.55, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = GREEN
  g.beginPath()
  g.arc(p.x, p.y, r, 0, Math.PI * 2)
  g.fill()
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

async function main() {
  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/vendor/draco/'))
  const [character, motion] = await Promise.all([loader.loadAsync('/assets/character.glb'), loader.loadAsync(`/assets/clips/${clipId}.glb`)])
  const clip = motion.animations[0]
  console.log('[demo] loaded', clipId, clip.duration.toFixed(2), 's')

  // Main scene: the patient in their living room
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(W, H)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.35
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xe9e2d6)
  room(scene)
  lights(scene)
  const patient = character.scene
  patient.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.frustumCulled = false
    }
  })
  patient.position.set(0.35, 0, 0.15)
  scene.add(patient)
  const mixer = new THREE.AnimationMixer(patient)
  mixer.clipAction(clip).play()
  // Three-quarter view from the patient's left, at chest height (a phone propped on a shelf)
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 40)
  const angle = THREE.MathUtils.degToRad(58)
  camera.position.set(0.35 + Math.sin(angle) * 4.5, 1.25, 0.15 + Math.cos(angle) * 4.5)
  camera.lookAt(-0.15, 1.08, 0.0)

  // The coach in the card: the same clip, front-on, on a light background
  const cardW = Math.round(W * 0.15)
  const cardH = Math.round(cardW * 1.38)
  const coachRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
  coachRenderer.setPixelRatio(1)
  coachRenderer.setSize(cardW, cardH)
  coachRenderer.toneMapping = THREE.NeutralToneMapping
  coachRenderer.outputColorSpace = THREE.SRGBColorSpace
  const coachScene = new THREE.Scene()
  coachScene.add(new THREE.HemisphereLight(0xffffff, 0xcfd8d4, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(1, 3, 3)
  coachScene.add(key)
  const coach = cloneSkinned(character.scene)
  coach.traverse((o) => ((o as THREE.Mesh).frustumCulled = false))
  coachScene.add(coach)
  const coachMixer = new THREE.AnimationMixer(coach)
  coachMixer.clipAction(clip).play()
  const coachCam = new THREE.PerspectiveCamera(30, cardW / cardH, 0.1, 20)
  coachCam.position.set(1.9, 1.15, 3.6)
  coachCam.lookAt(0, 1.0, 0)

  const gl = renderer.getContext()
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  console.log('[demo] GPU', info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown')
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  document.body.append(out)
  const g = out.getContext('2d')!

  const bones = Object.fromEntries(Object.entries(OVERLAY).map(([k, name]) => [k, patient.getObjectByName(name)!])) as Record<Key, THREE.Object3D>
  const v = new THREE.Vector3()
  const screen = (o: THREE.Object3D) => {
    o.getWorldPosition(v)
    v.project(camera)
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }
  }

  // The real rep engine follows the clip, measured side-on like the phone does
  const sideView = (o: THREE.Object3D) => {
    o.getWorldPosition(v)
    return { x: v.z, y: -v.y }
  }
  const session = new SessionTracker(exercise, 'L', { sets: 1, reps: REPS }, null, null)

  const total = REPS * clip.duration + OUTRO
  const frames = Math.round(total * FPS)
  const encoder = STILL === null ? await setupEncoder() : null
  const stillFrame = STILL === null ? -1 : Math.min(frames - 1, Math.round(STILL * FPS))
  let repsDone = 0
  let lastScore = 0
  let cueUntil = -1
  let posterTaken = false

  for (let i = 0; i < frames; i++) {
    const t = i / FPS
    const animT = Math.min(t, REPS * clip.duration - 1 / FPS)
    mixer.setTime(animT)
    coachMixer.setTime(animT)
    patient.updateMatrixWorld(true)

    // Feed the engine
    const points: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, v: 0 }))
    for (const [k, idx] of Object.entries(MP) as [Key, number][]) {
      const p = sideView(bones[k])
      points[idx] = { x: p.x, y: p.y, z: 0, v: 1 }
    }
    const frame: Frame = { t: t * 1000, points }
    for (const e of t < REPS * clip.duration ? session.onFrame(frame) : []) {
      if (e.type === 'rep') {
        repsDone = e.repInSet
        lastScore = e.rep.score
        cueUntil = t + 1.6
      }
    }
    const progress = session.engine.progress
    if (encoder === null && i !== stillFrame) continue

    renderer.render(scene, camera)
    coachRenderer.render(coachScene, coachCam)
    g.drawImage(renderer.domElement, 0, 0)

    // Skeleton overlay
    const s = W / 1280
    const pts = Object.fromEntries((Object.keys(OVERLAY) as Key[]).map((k) => [k, screen(bones[k])])) as Record<Key, { x: number; y: number }>
    for (const [a, b] of BONE_LINES) dottedLine(g, pts[a], pts[b], 13 * s, 3.2 * s)
    for (const k of Object.keys(OVERLAY) as Key[]) joint(g, pts[k], (k === 'neck' || k === 'pelvis' ? 9 : 14) * s)

    // Coach card, top right
    const cx = W - cardW - Math.round(W * 0.07)
    const cy = Math.round(H * 0.13)
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.18)'
    g.shadowBlur = 24 * s
    roundRect(g, cx, cy, cardW, cardH, 18 * s)
    g.fillStyle = 'rgba(244,247,245,0.92)'
    g.fill()
    g.restore()
    g.save()
    roundRect(g, cx, cy, cardW, cardH, 18 * s)
    g.clip()
    g.drawImage(coachRenderer.domElement, cx, cy)
    g.restore()
    g.fillStyle = '#ffffff'
    g.font = `600 ${Math.round(22 * s)}px ${FONT}`
    g.shadowColor = 'rgba(0,0,0,0.35)'
    g.shadowBlur = 8 * s
    g.fillText(title, cx, cy - 14 * s)
    g.shadowBlur = 0

    // Rep counter and the arc that fills as the movement goes
    const done = t >= REPS * clip.duration
    const ax = cx + cardW / 2
    const ay = cy + cardH + 210 * s
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.font = `700 ${Math.round(64 * s)}px ${FONT}`
    g.shadowColor = 'rgba(0,0,0,0.35)'
    g.shadowBlur = 10 * s
    g.fillText(`${repsDone}/${REPS}`, ax, ay - 64 * s)
    g.shadowBlur = 0
    const r = 120 * s
    const from = Math.PI * 1.18
    const to = Math.PI * 1.82
    g.lineCap = 'round'
    g.lineWidth = 7 * s
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.beginPath()
    g.arc(ax, ay + r * 0.62, r, from, to)
    g.stroke()
    const fill = done ? 1 : Math.max(0.02, progress)
    g.strokeStyle = '#4fe3c1'
    g.beginPath()
    g.arc(ax, ay + r * 0.62, r, from, from + (to - from) * fill)
    g.stroke()
    const kx = ax + r * Math.cos(from + (to - from) * fill)
    const ky = ay + r * 0.62 + r * Math.sin(from + (to - from) * fill)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(kx, ky, 9 * s, 0, Math.PI * 2)
    g.fill()
    g.textAlign = 'left'

    // Feedback pill
    if (t < cueUntil || done) {
      const text = done ? 'Set complete. Great work!' : `Good rep · ${lastScore}`
      g.font = `600 ${Math.round(24 * s)}px ${FONT}`
      const tw = g.measureText(text).width
      const px = W * 0.5 - tw / 2 - 22 * s
      const py = H - 92 * s
      roundRect(g, px, py, tw + 44 * s, 52 * s, 26 * s)
      g.fillStyle = done ? '#ffffff' : '#00cd0f'
      g.fill()
      g.fillStyle = INK
      g.fillText(text, px + 22 * s, py + 34 * s)
    }

    // Brand mark
    g.font = `600 ${Math.round(18 * s)}px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.shadowColor = 'rgba(0,0,0,0.4)'
    g.shadowBlur = 6 * s
    g.fillText('rehabify · 3D motion tracking', 28 * s, H - 30 * s)
    g.shadowBlur = 0

    if (!posterTaken && repsDone === 0 && progress > 0.9) {
      window.__poster = out.toDataURL('image/webp', 0.86)
      posterTaken = true
    }
    if (!encoder) {
      window.__poster = out.toDataURL('image/png')
      window.__info = { still: STILL, reps: repsDone, progress }
      window.__done = true
      return
    }
    await encoder.add(out, i)
    if (i % 60 === 0) console.log('[demo]', `${i}/${frames}`)
  }
  if (!encoder) return
  window.__video = await encoder.finish()
  window.__info = { frames, seconds: total, reps: repsDone, score: lastScore }
  window.__done = true
}

/**
 * One render, three files: AV1 and VP9 in WebM (small; the page offers them first) and H.264 in MP4
 * (plays everywhere). Frames are drawn at full size and scaled down to EW x EH for encoding, which
 * keeps edges and text sharp at a fraction of the size.
 */
async function setupEncoder() {
  const EW = Number(params.get('ew') ?? 960)
  const EH = Number(params.get('eh') ?? 540)
  // Loaded from the CDN in the browser only. The URLs are variables so TypeScript (and the site's
  // build, which type-checks every file) treats them as untyped modules instead of failing.
  const mp4Url: string = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm'
  const webmUrl: string = 'https://cdn.jsdelivr.net/npm/webm-muxer@5.1.4/+esm'
  const mp4 = await import(/* @vite-ignore */ mp4Url)
  const webm = await import(/* @vite-ignore */ webmUrl)
  const outputs = [
    { name: 'av1', codec: 'av01.0.05M.08', bitrate: Number(params.get('av1') ?? 380_000), lib: webm, track: 'V_AV1' },
    { name: 'vp9', codec: 'vp09.00.31.08', bitrate: Number(params.get('vp9') ?? 550_000), lib: webm, track: 'V_VP9' },
    { name: 'mp4', codec: 'avc1.4d001f', bitrate: Number(params.get('avc') ?? BITRATE), lib: mp4, track: 'avc' },
  ].map((o) => {
    const target = new o.lib.ArrayBufferTarget()
    const muxer =
      o.lib === mp4
        ? new o.lib.Muxer({ target, video: { codec: 'avc', width: EW, height: EH }, fastStart: 'in-memory' })
        : new o.lib.Muxer({ target, video: { codec: o.track, width: EW, height: EH, frameRate: FPS } })
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        throw e
      },
    })
    encoder.configure({
      codec: o.codec,
      width: EW,
      height: EH,
      bitrate: o.bitrate,
      framerate: FPS,
      latencyMode: 'quality',
      ...(o.lib === mp4 ? { avc: { format: 'avc' as const } } : {}),
    })
    return { ...o, target, muxer, encoder }
  })
  const small = document.createElement('canvas')
  small.width = EW
  small.height = EH
  const sg = small.getContext('2d')!
  sg.imageSmoothingQuality = 'high'
  return {
    async add(canvas: HTMLCanvasElement, index: number) {
      sg.drawImage(canvas, 0, 0, EW, EH)
      const frame = new VideoFrame(small, { timestamp: Math.round((index * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      for (const o of outputs) o.encoder.encode(frame, { keyFrame: index % (FPS * 2) === 0 })
      frame.close()
      while (outputs.some((o) => o.encoder.encodeQueueSize > 6)) await new Promise((r) => setTimeout(r, 5))
    },
    async finish() {
      const files: Record<string, string> = {}
      for (const o of outputs) {
        await o.encoder.flush()
        o.muxer.finalize()
        const bytes = new Uint8Array(o.target.buffer)
        let s = ''
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        files[o.name] = btoa(s)
      }
      return JSON.stringify(files)
    },
  }
}

main().catch((error) => {
  window.__error = String(error?.stack ?? error)
  window.__done = true
})
