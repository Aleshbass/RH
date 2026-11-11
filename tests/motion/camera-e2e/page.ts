/**
 * Browser half of the camera-coach end-to-end check (run.mjs): the 3D coach is rendered side-on
 * into a canvas, frame by frame, and the real pipeline reads it: MediaPipe (downloaded, hash-checked,
 * cached), smoothing, side and rest calibration, rep counting and scoring.
 */
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { motionExercise } from '@/lib/motion/exercises'
import { nearSide, type Frame, type Side } from '@/lib/motion/pose'
import { PoseTracker, type PoseModel } from '@/lib/motion/poseTracker'
import { referenceFromClip } from '@/lib/motion/reference'
import { SessionTracker } from '@/lib/motion/session'
import { FrameSmoother } from '@/lib/motion/smoothing'

declare global {
  interface Window {
    __result?: unknown
    __done?: boolean
  }
}

const params = new URLSearchParams(location.search)
const clipId = params.get('clip') ?? 'sit-to-stand'
const exercise = motionExercise(params.get('exercise') ?? 'sit-to-stand')!
const loops = Number(params.get('loops') ?? 4)
const model = (params.get('model') ?? 'lite') as PoseModel
const fps = Number(params.get('fps') ?? 15)
const W = 640
const H = 480

function log(...args: unknown[]) {
  console.log('[e2e]', ...args)
}

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(W, H)
  renderer.setPixelRatio(1)
  document.body.append(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xdfe3e0)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3a0, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(2, 4, 3)
  scene.add(sun)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xc9c2b6 }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  // Side-on, from the character's left (it faces +Z; its left is +X), at about hip height; low
  // down for exercises on the floor; or in front of it for the ones done facing the phone
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 50)
  if (exercise.view === 'front') {
    camera.position.set(0.1, 1.1, 4)
    camera.lookAt(0, 1, 0)
  } else if (exercise.floor) {
    camera.position.set(3.4, 0.45, 0.1)
    camera.lookAt(0, 0.3, 0.1)
  } else {
    camera.position.set(3.4, 0.9, 0.2)
    camera.lookAt(0, 0.82, 0.1)
  }

  const loader = new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/vendor/draco/'))
  const [character, motion] = await Promise.all([loader.loadAsync('/assets/character.glb'), loader.loadAsync(`/assets/clips/${clipId}.glb`)])
  const clip = motion.animations[0]
  scene.add(character.scene)
  const mixer = new THREE.AnimationMixer(character.scene)
  mixer.clipAction(clip).play()
  log('clip', clipId, clip.duration.toFixed(2), 's')

  const t0 = performance.now()
  const tracker = await PoseTracker.create(model, (p) => {
    if (Math.random() < 0.02) log('download', (p.loaded / 1e6).toFixed(1), '/', (p.total / 1e6).toFixed(1), 'MB')
  })
  log('tracker ready', tracker.delegate, Math.round(performance.now() - t0), 'ms')

  const smoother = new FrameSmoother()
  const frames: Frame[] = []
  const total = loops * clip.duration
  let detected = 0
  let detectMs = 0
  for (let k = 0; k <= Math.floor(total * fps); k++) {
    const t = k / fps
    mixer.setTime(t)
    renderer.render(scene, camera)
    const s = performance.now()
    const raw = tracker.detect(renderer.domElement, t * 1000 + 1)
    detectMs += performance.now() - s
    if (raw) {
      detected++
      frames.push(smoother.smooth(raw))
    }
  }
  log('detected', detected, 'frames, avg', (detectMs / Math.max(1, Math.floor(total * fps))).toFixed(1), 'ms')

  // Calibrate as the app's setup and countdown do: side from the first second, rest from its angles
  let side: Side = params.get('side') === 'R' ? 'R' : 'L'
  if (exercise.side === 'auto') {
    const votes = frames.filter((f) => f.t < 1000).map(nearSide).filter(Boolean)
    side = votes.filter((v) => v === 'L').length >= votes.length / 2 ? 'L' : 'R'
  }
  const firstSecond = frames.filter((f) => f.t < 1000).map((f) => exercise.primary(f, side)).filter((a): a is number => a !== null).sort((a, b) => a - b)
  const rest = firstSecond[Math.floor(firstSecond.length / 2)] ?? null
  const reference = referenceFromClip(character, clip, exercise, side)
  const session = new SessionTracker(exercise, side, { sets: 1, reps: 99 }, reference, rest)
  const angles: number[] = []
  const events: string[] = []
  for (const f of frames) {
    const a = exercise.primary(f, side)
    if (a !== null) angles.push(a)
    for (const e of session.onFrame(f)) {
      if (e.type === 'rep') events.push(`rep ${e.rep.index} score ${e.rep.score}${e.rep.mistakes.length ? ' ' + e.rep.mistakes.join(',') : ''} @${(f.t / 1000).toFixed(1)}s`)
      if (e.type === 'partial') events.push(`partial ${e.cue} @${(f.t / 1000).toFixed(1)}s`)
    }
  }
  const summary = session.summary()
  window.__result = {
    clipId,
    exercise: exercise.key,
    delegate: tracker.delegate,
    side,
    frames: Math.floor(total * fps) + 1,
    detected,
    restAngle: rest && Math.round(rest),
    angleRange: angles.length ? [Math.round(Math.min(...angles)), Math.round(Math.max(...angles))] : null,
    reference: reference && { rest: Math.round(reference.restAngle), peak: Math.round(reference.peakAngle), activeSeconds: Number(reference.activeSeconds.toFixed(2)) },
    expectedReps: loops,
    reps: summary.repsCounted,
    partials: summary.partialReps,
    averageScore: summary.averageScore,
    mistakes: summary.mistakes,
    events,
  }
  tracker.close()
  window.__done = true
}

main().catch((error) => {
  window.__result = { error: String(error?.stack ?? error) }
  window.__done = true
})
