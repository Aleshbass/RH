import { CAMERA_COACH_CLIPS, type CameraCoachKey } from '@/convex/cameraCoachClips'
import cueFile from './cues.json'
import {
  elbowAngle,
  hipAbduction,
  hipAngle,
  kneeAngle,
  shoulderFlexion,
  sideLean,
  thighRise,
  trunkBend,
  trunkLean,
  type Frame,
  type Joint,
  type Side,
} from './pose'

/**
 * The exercises the camera coach can follow, and how each is judged: movements in one plane that a
 * single phone camera measures well, seen side-on (or facing the phone for arm and hip lifts out to
 * the side). Stretches, holds, small hand and neck movements keep the 3D demonstration and
 * "I did it" logging only.
 *
 * Angles are degrees in the picture (see pose.ts). A rep is measured as "progress" from the
 * resting angle (calibrated from the patient's own start position) to the target angle:
 * 0 at rest, 1 at the full movement. The target can be above the rest angle (straightening) or
 * below it (bending).
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
  /** Towards the full movement, and back to the start */
  upMs: number
  downMs: number
  /** Time spent at the full movement */
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

export type MotionExerciseKey = CameraCoachKey

export type MotionExercise = {
  key: MotionExerciseKey
  name: string
  /** Catalog clips this exercise follows (convex/cameraCoachClips.ts) */
  clipIds: string[]
  /** How the patient stands to the phone: side-on (the default) or facing it */
  view?: 'side' | 'front'
  /** Lying or kneeling on the floor, so the phone goes low down */
  floor?: boolean
  /**
   * Measure the side nearest the camera ("auto") or the arm or leg the clip works ("clip"), which
   * must face the camera in a side view
   */
  side: 'auto' | 'clip'
  /** Which limb the clip's side refers to, for "Exercising your left leg" */
  limb: 'leg' | 'arm'
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
   * less near straight), so a fixed target over-credits short movements. Capped just short of a
   * fully straight (or fully bent) joint.
   */
  relativeTarget?: boolean
  /**
   * Limb segments that stay the same length on screen while the patient moves in the camera's
   * plane. When one changes length by more than OUT_OF_PLANE (engine.ts), the limb is turning
   * towards the camera and the angle can't be trusted, so the frame is skipped.
   */
  segments?: [Joint, Joint][]
  /** Progress a rep needs to count, and from which a short attempt gets a "go further" cue */
  countAt: number
  partialAt: number
  partialCue: CueCode
  /** Expected hold at the full movement, if any */
  holdMs?: number
  /** Active time of one rep in the 3D demonstration, when the clip itself can't be measured */
  refActiveSeconds: number
  /** Extra measurements per frame, for the form rules */
  metrics: (frame: Frame, side: Side, dir: 1 | -1) => Metrics
  rules: FormRule[]
  /** Why the patient isn't ready to start yet, or null */
  startCheck: (primary: number) => string | null
}

const clips = (key: MotionExerciseKey) => [...CAMERA_COACH_CLIPS[key]]
const none = () => ({})

// Phone placement, shared by exercises done the same way
const KNEE_TIP = 'Roll trousers or a wrapper above the knee if you can, so the camera sees your knee clearly.'
const SIDE_STANDING = [
  'Stand side-on to the phone, about 2 metres away.',
  'Prop the phone up at about hip height so your whole body, head to feet, fits on the screen.',
]
const SIDE_FLOOR = (who: string) => [
  'Put your mat side-on to the phone, about 2 metres away.',
  'Stand the phone on the floor or a low step, propped up so your whole body fits on the screen.',
  who,
]
const FACING = [
  'Stand facing the phone, about 2 to 2.5 metres away.',
  'Prop the phone up at about chest height so your whole body and your raised arms fit on the screen.',
]

/** A movement that went too fast towards the full position, or back from it */
const tooFastDown = (ms: number) => (r: RepStats) => r.downMs > 0 && r.downMs < ms
const tooFastUp = (ms: number) => (r: RepStats) => r.upMs > 0 && r.upMs < ms

export const MOTION_EXERCISES: MotionExercise[] = [
  {
    key: 'sit-to-stand',
    name: 'Sit to stand',
    clipIds: clips('sit-to-stand'),
    side: 'auto',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: [
      'Put your chair side-on to the phone, about 2 metres away.',
      'Prop the phone up at about hip height so your whole body, head to feet, fits on the screen.',
      'Sit on the front half of the chair with your feet flat.',
      KNEE_TIP,
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
      { code: 'sts_slow_down', joints: ['knee', 'hip'], check: tooFastDown(900) },
    ],
    startCheck: (knee) => (knee > 125 ? 'Sit down on the chair to start.' : null),
  },
  {
    key: 'seated-knee-extension',
    name: 'Seated knee extension',
    clipIds: clips('seated-knee-extension'),
    side: 'clip',
    limb: 'leg',
    needed: ['hip', 'knee', 'ankle'],
    setup: [
      'Put your chair side-on to the phone, about 1.5 to 2 metres away, with the leg you are exercising nearest the phone.',
      'Prop the phone up at about seat height so your hips, knees and feet are on the screen.',
      'Sit tall with your back against the chair and your feet flat.',
      KNEE_TIP,
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
      { code: 'ke_slow_down', joints: ['knee'], check: tooFastDown(700) },
    ],
    startCheck: (knee) => (knee > 125 ? 'Sit down with your foot flat on the floor to start.' : null),
  },
  {
    key: 'shoulder-flexion',
    name: 'Shoulder flexion',
    clipIds: clips('shoulder-flexion'),
    side: 'auto',
    limb: 'arm',
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
    metrics: (frame, side, dir) => ({ lean: trunkLean(frame, side, dir), elbow: elbowAngle(frame, side) }),
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
      { code: 'sf_slow_down', joints: ['shoulder'], check: tooFastDown(1000) },
    ],
    startCheck: (flexion) => (flexion > 45 ? 'Start with your arms by your sides.' : null),
  },

  // ─── Squats: the knee bends from standing (the target is below the rest angle) ───
  {
    key: 'mini-squat',
    name: 'Mini squat',
    clipIds: clips('mini-squat'),
    side: 'auto',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: [...SIDE_STANDING, 'Stand tall with your feet hip-width apart.', KNEE_TIP],
    primary: kneeAngle,
    primaryJoint: 'knee',
    rest: 172,
    target: 135,
    relativeTarget: true,
    segments: [['knee', 'ankle']],
    countAt: 0.8,
    partialAt: 0.4,
    partialCue: 'squat_lower',
    refActiveSeconds: 3.2,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['knee', 'hip'], check: tooFastUp(500) }],
    startCheck: (knee) => (knee < 150 ? 'Stand up tall to start.' : null),
  },
  {
    key: 'chair-squat',
    name: 'Chair squat',
    clipIds: clips('chair-squat'),
    side: 'auto',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: [
      'Put your chair side-on to the phone, about 2 metres away, and stand in front of it.',
      'Prop the phone up at about hip height so your whole body, head to feet, fits on the screen.',
      KNEE_TIP,
    ],
    primary: kneeAngle,
    primaryJoint: 'knee',
    rest: 172,
    target: 100,
    relativeTarget: true,
    segments: [['knee', 'ankle']],
    countAt: 0.8,
    partialAt: 0.4,
    partialCue: 'squat_lower',
    refActiveSeconds: 3.6,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['knee', 'hip'], check: tooFastUp(700) }],
    startCheck: (knee) => (knee < 150 ? 'Stand up tall to start.' : null),
  },
  {
    key: 'wall-squat',
    name: 'Wall squat',
    clipIds: clips('wall-squat'),
    side: 'auto',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: [...SIDE_STANDING, 'Stand with your back against a wall and your feet a step out in front of you.', KNEE_TIP],
    primary: kneeAngle,
    primaryJoint: 'knee',
    // Feet a step out in front, so the knees are already a little bent at the start
    rest: 158,
    target: 122,
    relativeTarget: true,
    segments: [['knee', 'ankle']],
    countAt: 0.8,
    partialAt: 0.4,
    partialCue: 'squat_lower',
    refActiveSeconds: 3.5,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['knee', 'hip'], check: tooFastUp(700) }],
    startCheck: (knee) => (knee < 140 ? 'Stand up tall against the wall to start.' : null),
  },
  {
    key: 'single-leg-decline-squat',
    name: 'Single-leg decline squat',
    clipIds: clips('single-leg-decline-squat'),
    side: 'clip',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: [
      'Put your decline board side-on to the phone, about 2 metres away, with the leg you are exercising nearest the phone.',
      'Prop the phone up at about hip height so your whole body, head to feet, fits on the screen.',
      KNEE_TIP,
    ],
    primary: kneeAngle,
    primaryJoint: 'knee',
    rest: 172,
    target: 120,
    relativeTarget: true,
    segments: [['knee', 'ankle']],
    countAt: 0.8,
    partialAt: 0.4,
    partialCue: 'squat_lower',
    refActiveSeconds: 5,
    metrics: none,
    // The demonstration takes about three seconds going down
    rules: [{ code: 'slow_down', joints: ['knee'], check: tooFastUp(1500) }],
    startCheck: (knee) => (knee < 150 ? 'Stand up tall on the board to start.' : null),
  },

  // ─── Arms, side-on ───
  {
    key: 'wall-push-up',
    name: 'Wall push-up',
    clipIds: clips('wall-push-up'),
    side: 'auto',
    limb: 'arm',
    needed: ['shoulder', 'elbow', 'wrist', 'hip'],
    setup: [
      'Stand side-on to the phone, about 2 metres away, facing a wall a little more than arm’s length from you.',
      'Prop the phone up at about chest height so your whole body and the wall fit on the screen.',
      'Put your hands on the wall at shoulder height, arms straight.',
    ],
    primary: elbowAngle,
    primaryJoint: 'elbow',
    // Reaching forward to the wall, the camera reads a straight arm as about 145-170°
    rest: 152,
    target: 92,
    relativeTarget: true,
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'push_lower',
    refActiveSeconds: 3,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['elbow'], check: tooFastUp(500) }],
    startCheck: (elbow) => (elbow < 125 ? 'Straighten your arms against the wall to start.' : null),
  },
  {
    key: 'band-row',
    name: 'Rowing with a resistance band',
    clipIds: clips('band-row'),
    side: 'auto',
    limb: 'arm',
    needed: ['shoulder', 'elbow', 'wrist', 'hip'],
    setup: [
      'Tie the band to a door handle and stand side-on to the phone, about 2 metres away, facing the door.',
      'Prop the phone up at about chest height so your whole body fits on the screen.',
      'Hold the band with your arms straight out in front of you.',
    ],
    primary: elbowAngle,
    primaryJoint: 'elbow',
    rest: 155,
    target: 80,
    relativeTarget: true,
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'row_further',
    refActiveSeconds: 3.5,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['elbow'], check: tooFastDown(700) }],
    startCheck: (elbow) => (elbow < 125 ? 'Start with your arms straight out in front of you.' : null),
  },

  // ─── Sitting, side-on ───
  {
    key: 'forward-bend-sitting',
    name: 'Forward bend in sitting',
    clipIds: clips('forward-bend-sitting'),
    side: 'auto',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee'],
    setup: [
      'Put your chair side-on to the phone, about 2 metres away.',
      'Prop the phone up at about seat height so your head, hips and feet are on the screen.',
      'Sit tall with your feet apart.',
    ],
    primary: trunkBend,
    primaryJoint: 'hip',
    rest: 5,
    target: 55,
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'bend_further',
    holdMs: 1500,
    refActiveSeconds: 6,
    metrics: none,
    rules: [
      { code: 'hold_top', joints: ['shoulder', 'hip'], check: (r) => r.holdMs < 600 },
      { code: 'slow_down', joints: ['shoulder', 'hip'], check: tooFastDown(900) },
    ],
    startCheck: (bend) => (bend > 25 ? 'Sit up tall to start.' : null),
  },

  // ─── On the floor, side-on, phone low down ───
  {
    key: 'glute-bridge',
    name: 'Glute bridge',
    clipIds: clips('glute-bridge'),
    floor: true,
    side: 'auto',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: SIDE_FLOOR('Lie on your back with your knees bent and your feet flat.'),
    primary: hipAngle,
    primaryJoint: 'hip',
    rest: 145,
    target: 178,
    relativeTarget: true,
    segments: [['knee', 'ankle']],
    countAt: 0.8,
    partialAt: 0.4,
    partialCue: 'bridge_higher',
    holdMs: 1000,
    refActiveSeconds: 4.5,
    metrics: none,
    rules: [
      { code: 'hold_top', joints: ['hip'], check: (r) => r.holdMs < 400 },
      { code: 'slow_down', joints: ['hip'], check: tooFastDown(700) },
    ],
    startCheck: (hip) => (hip > 162 ? 'Lie down with your hips on the mat to start.' : null),
  },
  {
    key: 'straight-leg-raise',
    name: 'Straight leg raise',
    clipIds: clips('straight-leg-raise'),
    floor: true,
    side: 'clip',
    limb: 'leg',
    needed: ['shoulder', 'hip', 'knee', 'ankle'],
    setup: SIDE_FLOOR('Lie on your back with the leg you are exercising nearest the phone and your other knee bent.'),
    primary: hipAngle,
    primaryJoint: 'hip',
    // Up to the height of the bent knee: about 25-30° in the demonstration
    rest: 172,
    target: 145,
    relativeTarget: true,
    segments: [['hip', 'knee']],
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'leg_higher',
    holdMs: 1000,
    refActiveSeconds: 4.5,
    // No straight-knee check: side-on, the bent other leg overlaps it and the camera mixes them up
    metrics: none,
    rules: [
      { code: 'hold_top', joints: ['hip'], check: (r) => r.holdMs < 400 },
      { code: 'slow_down', joints: ['hip'], check: tooFastDown(450) },
    ],
    startCheck: (hip) => (hip < 160 ? 'Lie with the leg straight on the mat to start.' : null),
  },
  {
    key: 'heel-slides',
    name: 'Heel slides',
    clipIds: clips('heel-slides'),
    floor: true,
    side: 'clip',
    limb: 'leg',
    needed: ['hip', 'knee', 'ankle'],
    setup: SIDE_FLOOR('Lie on your back with your legs straight, the leg you are exercising nearest the phone.'),
    primary: kneeAngle,
    primaryJoint: 'knee',
    rest: 172,
    target: 95,
    relativeTarget: true,
    segments: [['hip', 'knee'], ['knee', 'ankle']],
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'slide_further',
    refActiveSeconds: 4.5,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['knee'], check: (r) => r.activeMs > 0 && r.activeMs < 1500 }],
    startCheck: (knee) => (knee < 150 ? 'Start with your leg straight on the mat.' : null),
  },
  {
    key: 'bird-dog',
    name: 'Bird-dog',
    clipIds: clips('bird-dog'),
    floor: true,
    side: 'clip',
    limb: 'arm',
    needed: ['shoulder', 'elbow', 'hip'],
    setup: SIDE_FLOOR('Get onto your hands and knees, with the arm you are reaching with nearest the phone.'),
    primary: shoulderFlexion,
    primaryJoint: 'shoulder',
    rest: 90,
    target: 170,
    segments: [['shoulder', 'elbow']],
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'reach_further',
    holdMs: 1000,
    refActiveSeconds: 4.5,
    metrics: none,
    rules: [
      { code: 'hold_top', joints: ['shoulder'], check: (r) => r.holdMs < 400 },
      { code: 'slow_down', joints: ['shoulder'], check: tooFastDown(600) },
    ],
    startCheck: (arm) => (arm > 125 ? 'Start on your hands and knees.' : null),
  },

  // ─── Facing the phone ───
  {
    key: 'assisted-abduction',
    name: 'Assisted arm lift out to the side',
    clipIds: clips('assisted-abduction'),
    view: 'front',
    side: 'clip',
    limb: 'arm',
    needed: ['shoulder', 'elbow', 'hip'],
    setup: [...FACING, 'Hold the stick in both hands in front of you, palms up.'],
    primary: shoulderFlexion,
    primaryJoint: 'shoulder',
    rest: 25,
    target: 110,
    segments: [['shoulder', 'elbow']],
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'sf_higher',
    refActiveSeconds: 4.5,
    metrics: none,
    rules: [{ code: 'sf_slow_down', joints: ['shoulder'], check: tooFastDown(800) }],
    startCheck: (arm) => (arm > 50 ? 'Start with your elbows by your sides.' : null),
  },
  {
    key: 'scaption',
    name: 'Scaption',
    clipIds: clips('scaption'),
    view: 'front',
    side: 'auto',
    limb: 'arm',
    needed: ['shoulder', 'elbow', 'hip'],
    setup: [...FACING, 'Stand tall with your arms by your sides, thumbs up.'],
    primary: shoulderFlexion,
    primaryJoint: 'shoulder',
    rest: 12,
    target: 90,
    segments: [['shoulder', 'elbow']],
    countAt: 0.8,
    partialAt: 0.4,
    partialCue: 'sf_higher',
    refActiveSeconds: 3.6,
    metrics: (frame, side) => ({ elbow: elbowAngle(frame, side) }),
    rules: [
      {
        code: 'sf_elbows',
        joints: ['elbow'],
        check: (r) => r.atPeak.elbow !== null && r.atStart.elbow !== null && r.atStart.elbow - r.atPeak.elbow > 30,
      },
      { code: 'sf_slow_down', joints: ['shoulder'], check: tooFastDown(800) },
    ],
    startCheck: (arm) => (arm > 45 ? 'Start with your arms by your sides.' : null),
  },
  {
    key: 'wall-angels',
    name: 'Wall angels',
    clipIds: clips('wall-angels'),
    view: 'front',
    side: 'auto',
    limb: 'arm',
    needed: ['shoulder', 'elbow', 'hip'],
    setup: [...FACING, 'Stand with your back against a wall, arms bent in a goalpost shape against it.'],
    primary: shoulderFlexion,
    primaryJoint: 'shoulder',
    rest: 90,
    target: 150,
    segments: [['shoulder', 'elbow']],
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'reach_further',
    refActiveSeconds: 4.5,
    metrics: none,
    rules: [{ code: 'slow_down', joints: ['shoulder', 'elbow'], check: tooFastDown(700) }],
    startCheck: (arm) => (arm < 60 || arm > 120 ? 'Start with your arms in a goalpost shape against the wall.' : null),
  },
  {
    key: 'standing-hip-abduction',
    name: 'Standing hip abduction',
    clipIds: clips('standing-hip-abduction'),
    view: 'front',
    side: 'clip',
    limb: 'leg',
    needed: ['hip', 'knee', 'ankle'],
    setup: [
      'Stand facing the phone, about 2 to 2.5 metres away, holding a chair or counter beside you.',
      'Prop the phone up at about hip height so your whole body, head to feet, fits on the screen.',
      'Stand tall with your feet together and your toes pointing forward.',
    ],
    primary: hipAbduction,
    primaryJoint: 'hip',
    rest: 95,
    target: 120,
    relativeTarget: true,
    segments: [['hip', 'knee']],
    countAt: 0.75,
    partialAt: 0.35,
    partialCue: 'leg_higher',
    holdMs: 800,
    refActiveSeconds: 3,
    metrics: (frame) => ({ lean: sideLean(frame) }),
    rules: [
      {
        code: 'no_lean',
        joints: ['shoulder', 'hip'],
        check: (r) => r.atPeak.lean !== null && r.atStart.lean !== null && r.atPeak.lean - r.atStart.lean > 10,
      },
      { code: 'slow_down', joints: ['hip'], check: tooFastDown(500) },
    ],
    startCheck: (hip) => (hip > 110 ? 'Stand with your feet together to start.' : null),
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
