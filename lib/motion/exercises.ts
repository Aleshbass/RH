import cueFile from './cues.json'
import { angleAt, point, shoulderFlexion, thighRise, trunkLean, type Frame, type Joint, type Side } from './pose'

/**
 * The exercises the camera coach can follow, and how each is judged. Version one covers three
 * side-view exercises that phone cameras measure well; everything else keeps the 3D demonstration
 * and "I did it" logging only.
 *
 * Angles are degrees in the picture (see pose.ts). A rep is measured as "progress" from the
 * resting angle (calibrated from the patient's own start position) to the target angle:
 * 0 at rest, 1 at the full movement.
 */

export type CueCode = keyof typeof cueFile.cues
export const CUES: Record<CueCode, string> = cueFile.cues
export const CUE_VERSION = cueFile.version

export type Metrics = Record<string, number | null>

/** What a finished rep looked like, for the form rules. */
export type RepStats = {
  peakProgress: number
  peakAngle: number
  /** From leaving the start position to getting back to it */
  activeMs: number
  upMs: number
  downMs: number
  /** Time spent at the top of the movement */
  holdMs: number
  /** Metrics averaged over the top of the movement and over the start position before the rep */
  atPeak: Metrics
  atStart: Metrics
}

export type FormRule = {
  code: CueCode
  /** Joints drawn red on the camera while this cue is showing */
  joints: Joint[]
  check: (rep: RepStats) => boolean
}

export type MotionExerciseKey = 'sit-to-stand' | 'seated-knee-extension' | 'shoulder-flexion'

export type MotionExercise = {
  key: MotionExerciseKey
  name: string
  /** Catalog clips this exercise follows (convex/exerciseLibraryCatalog.ts) */
  clipIds: string[]
  /** Measure the side nearest the camera ("auto") or the leg the clip works, which must face the camera ("clip") */
  side: 'auto' | 'clip'
  /** Points that must be visible on the measured side */
  needed: Joint[]
  /** Where to put the phone and how to stand or sit */
  setup: string[]
  /** The primary angle that drives the rep count */
  primary: (frame: Frame, side: Side) => number | null
  primaryJoint: Joint
  /** Typical resting and full-movement angles; the resting angle is re-measured for each patient */
  rest: number
  target: number
  /**
   * Ask for the same range of movement from the patient's own measured start, instead of reaching the
   * fixed target angle. The camera reads a bent knee straighter than it is (about 20° near 90°,
   * less near straight), so a fixed target over-credits short movements. Capped just short of 180°.
   */
  relativeTarget?: boolean
  /**
   * Limb segments that stay the same length on screen while the patient moves side-on. When one
   * changes length by more than OUT_OF_PLANE (engine.ts), the limb is turning towards the camera and
   * the angle can't be trusted, so the frame is skipped.
   */
  segments?: [Joint, Joint][]
  /** Progress a rep needs to count, and from which a short attempt gets a "go further" cue */
  countAt: number
  partialAt: number
  partialCue: CueCode
  /** Expected hold at the top, if any */
  holdMs?: number
  /** Active time of one rep in the 3D demonstration, when the clip itself can't be measured */
  refActiveSeconds: number
  /** Extra measurements per frame, for the form rules */
  metrics: (frame: Frame, side: Side, dir: 1 | -1) => Metrics
  rules: FormRule[]
  /** Why the patient isn't ready to start yet, or null */
  startCheck: (primary: number) => string | null
}

const kneeAngle = (frame: Frame, side: Side) => angleAt(point(frame, 'hip', side), point(frame, 'knee', side), point(frame, 'ankle', side))

export const MOTION_EXERCISES: MotionExercise[] = [
  {
    key: 'sit-to-stand',
    name: 'Sit to stand',
    clipIds: ['sit-to-stand'],
    side: 'auto',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: [
      'Put your chair side-on to the phone, about 2 metres away.',
      'Prop the phone up at about hip height so your whole body, head to feet, fits on the screen.',
      'Sit on the front half of the chair with your feet flat.',
      'Roll trousers or a wrapper above the knee if you can, so the camera sees your knee clearly.',
    ],
    primary: kneeAngle,
    primaryJoint: 'knee',
    rest: 90,
    target: 170,
    relativeTarget: true,
    segments: [['knee', 'ankle']],
    countAt: 0.85,
    partialAt: 0.45,
    partialCue: 'sts_stand_tall',
    refActiveSeconds: 3.6,
    metrics: (frame, side, dir) => ({ lean: trunkLean(frame, side, dir) }),
    rules: [
      // Still bent forward at the top: the hips never came fully through
      { code: 'sts_chest_up', joints: ['shoulder', 'hip'], check: (r) => (r.atPeak.lean ?? 0) > 22 },
      { code: 'sts_slow_down', joints: ['knee', 'hip'], check: (r) => r.downMs > 0 && r.downMs < 900 },
    ],
    startCheck: (knee) => (knee > 125 ? 'Sit down on the chair to start.' : null),
  },
  {
    key: 'seated-knee-extension',
    name: 'Seated knee extension',
    clipIds: ['seated-knee-extension-left', 'seated-knee-extension-right'],
    side: 'clip',
    needed: ['hip', 'knee', 'ankle'],
    setup: [
      'Put your chair side-on to the phone, about 1.5 to 2 metres away, with the leg you are exercising nearest the phone.',
      'Prop the phone up at about seat height so your hips, knees and feet are on the screen.',
      'Sit tall with your back against the chair and your feet flat.',
      'Roll trousers or a wrapper above the knee if you can, so the camera sees your knee clearly.',
    ],
    primary: kneeAngle,
    primaryJoint: 'knee',
    rest: 90,
    target: 170,
    relativeTarget: true,
    segments: [['hip', 'knee'], ['knee', 'ankle']],
    countAt: 0.85,
    partialAt: 0.45,
    partialCue: 'ke_straighten',
    holdMs: 2000,
    refActiveSeconds: 5.2,
    metrics: (frame, side, dir) => ({ lean: trunkLean(frame, side, dir), thigh: thighRise(frame, side, dir) }),
    rules: [
      { code: 'ke_hold', joints: ['knee'], check: (r) => r.holdMs < 1000 },
      {
        code: 'ke_thigh_down',
        joints: ['hip', 'knee'],
        check: (r) => r.atPeak.thigh !== null && r.atStart.thigh !== null && r.atPeak.thigh - r.atStart.thigh > 18,
      },
      {
        code: 'ke_sit_tall',
        joints: ['shoulder', 'hip'],
        check: (r) => r.atPeak.lean !== null && r.atStart.lean !== null && r.atStart.lean - r.atPeak.lean > 15,
      },
      { code: 'ke_slow_down', joints: ['knee'], check: (r) => r.downMs > 0 && r.downMs < 700 },
    ],
    startCheck: (knee) => (knee > 125 ? 'Sit down with your foot flat on the floor to start.' : null),
  },
  {
    key: 'shoulder-flexion',
    name: 'Shoulder flexion',
    clipIds: ['shoulder-flexion'],
    side: 'auto',
    needed: ['shoulder', 'elbow', 'hip'],
    setup: [
      'Stand side-on to the phone, about 2 metres away.',
      'Prop the phone up at about chest height so your whole body and your raised arms fit on the screen.',
      'Stand tall with your arms by your sides, thumbs pointing forwards.',
    ],
    primary: shoulderFlexion,
    primaryJoint: 'shoulder',
    rest: 12,
    target: 160,
    segments: [['shoulder', 'elbow']],
    countAt: 0.8,
    partialAt: 0.45,
    partialCue: 'sf_higher',
    refActiveSeconds: 4.6,
    metrics: (frame, side, dir) => ({
      lean: trunkLean(frame, side, dir),
      elbow: angleAt(point(frame, 'shoulder', side), point(frame, 'elbow', side), point(frame, 'wrist', side)),
    }),
    rules: [
      // Elbow bending compared with the patient's own straight-arm start (absolute angles vary by body and camera)
      {
        code: 'sf_elbows',
        joints: ['elbow'],
        check: (r) =>
          r.atPeak.elbow !== null && (r.atStart.elbow !== null ? r.atStart.elbow - r.atPeak.elbow > 30 : r.atPeak.elbow < 135),
      },
      {
        code: 'sf_no_arch',
        joints: ['shoulder', 'hip'],
        check: (r) => r.atPeak.lean !== null && r.atStart.lean !== null && r.atStart.lean - r.atPeak.lean > 10,
      },
      { code: 'sf_slow_down', joints: ['shoulder'], check: (r) => r.downMs > 0 && r.downMs < 1000 },
    ],
    startCheck: (flexion) => (flexion > 45 ? 'Start with your arms by your sides.' : null),
  },
]

/** The camera-coach exercise for a library clip, if there is one. */
export function motionExerciseForClip(clipId: string | null | undefined): MotionExercise | null {
  if (!clipId) return null
  return MOTION_EXERCISES.find((e) => e.clipIds.includes(clipId)) ?? null
}

export function motionExercise(key: string): MotionExercise | null {
  return MOTION_EXERCISES.find((e) => e.key === key) ?? null
}
