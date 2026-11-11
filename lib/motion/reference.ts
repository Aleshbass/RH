import { AnimationMixer, Vector3, type AnimationClip, type Object3D } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { resample, SHAPE_POINTS, type Reference } from './engine'
import type { MotionExercise } from './exercises'
import { LANDMARK, type Frame, type Joint, type Point, type Side } from './pose'

/**
 * The "perfect rep": the 3D demonstration measured exactly the way the camera measures the
 * patient. The clip is played on a hidden copy of the character, each tracked joint's bone is
 * projected the way the phone sees it (forward and up side-on, or across and up facing the phone)
 * and the exercise's own angle function reads it. No extra data has to be exported from Blender.
 */

const FPS = 30

/** Rig bone whose head sits at each MediaPipe joint. */
const BONE: Record<Joint, (s: 'Left' | 'Right') => string> = {
  ear: () => 'Head',
  shoulder: (s) => `${s}Arm`,
  elbow: (s) => `${s}ForeArm`,
  wrist: (s) => `${s}Hand`,
  hip: (s) => `${s}UpLeg`,
  knee: (s) => `${s}Leg`,
  ankle: (s) => `${s}Foot`,
  heel: (s) => `${s}Foot`,
  toe: (s) => `${s}ToeBase`,
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export function referenceFromClip(gltf: GLTF, clip: AnimationClip, exercise: MotionExercise, side: Side): Reference | null {
  const model = cloneSkinned(gltf.scene)
  const mixer = new AnimationMixer(model)
  mixer.clipAction(clip).play()
  const bones = new Map<number, Object3D>()
  for (const [joint, name] of Object.entries(BONE) as [Joint, (s: 'Left' | 'Right') => string][]) {
    for (const s of ['L', 'R'] as const) {
      const bone = model.getObjectByName(name(s === 'L' ? 'Left' : 'Right'))
      if (bone) bones.set(LANDMARK[joint][s], bone)
    }
  }
  const hidden: Point = { x: 0, y: 0, z: 0, v: 0 }
  const world = new Vector3()
  const front = exercise.view === 'front'
  const samples: { t: number; angle: number }[] = []
  try {
    for (let i = 0; i <= Math.floor(clip.duration * FPS); i++) {
      const t = Math.min(i / FPS, clip.duration - 1e-3)
      mixer.setTime(t)
      model.updateMatrixWorld(true)
      const points: Point[] = Array.from({ length: 33 }, () => hidden)
      for (const [index, bone] of bones) {
        bone.getWorldPosition(world)
        // glTF is Y up and the character faces +Z: a side-on camera sees forward (z) and up (y), one
        // in front of it sees across (x) and up
        points[index] = front ? { x: world.x, y: -world.y, z: -world.z, v: 1 } : { x: world.z, y: -world.y, z: world.x, v: 1 }
      }
      const frame: Frame = { t: t * 1000, points }
      const angle = exercise.primary(frame, side)
      if (angle !== null) samples.push({ t: t * 1000, angle })
    }
  } finally {
    mixer.stopAllAction()
    mixer.uncacheRoot(model)
  }
  if (samples.length < 10) return null

  const restAngle = median(samples.slice(0, 5).map((s) => s.angle))
  const peakAngle = samples.reduce((best, s) => (Math.abs(s.angle - restAngle) > Math.abs(best - restAngle) ? s.angle : best), restAngle)
  const span = peakAngle - restAngle
  if (Math.abs(span) < 10) return null
  const progress = samples.map((s) => ({ t: s.t, progress: (s.angle - restAngle) / span }))
  const first = progress.findIndex((p) => p.progress > 0.2)
  let last = -1
  for (let i = progress.length - 1; i >= 0; i--) {
    if (progress[i].progress > 0.2) {
      last = i
      break
    }
  }
  if (first < 0 || last <= first) return null
  const start = Math.max(0, first - 1)
  const end = Math.min(progress.length - 1, last + 1)
  const active = progress.slice(start, end + 1).map((p) => ({ t: p.t, progress: Math.max(0, Math.min(1, p.progress)) }))
  return {
    restAngle,
    peakAngle,
    activeSeconds: (active[active.length - 1].t - active[0].t) / 1000,
    shape: resample(active, SHAPE_POINTS),
  }
}
