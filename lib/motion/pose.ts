/**
 * Body points from the camera (MediaPipe Pose, 33 landmarks) and the 2D geometry used on them.
 *
 * Points are kept in "image units": x is multiplied by the frame's width / height so one unit is
 * the same distance across and down, and y grows downwards. Angles measured this way are the
 * angles a physio would see on the screen; the reference curves from the 3D clips are projected
 * the same way (lib/motion/reference.ts).
 */

export type Point = { x: number; y: number; z: number; v: number }
export type Frame = { t: number; points: Point[] }
export type Side = 'L' | 'R'

/** MediaPipe Pose landmark indices, by the person's own left and right. */
export const LANDMARK = {
  nose: 0,
  ear: { L: 7, R: 8 },
  shoulder: { L: 11, R: 12 },
  elbow: { L: 13, R: 14 },
  wrist: { L: 15, R: 16 },
  hip: { L: 23, R: 24 },
  knee: { L: 25, R: 26 },
  ankle: { L: 27, R: 28 },
  heel: { L: 29, R: 30 },
  toe: { L: 31, R: 32 },
} as const

export type Joint = Exclude<keyof typeof LANDMARK, 'nose'>

/** The points drawn on the camera and kept in snapshots of a rep (nose, ears, arms, legs). */
export const SKELETON_POINTS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] as const

/** Lines of the stick figure, as pairs of landmark indices. */
export const BONES: [number, number][] = [
  [11, 12], [11, 23], [12, 24], [23, 24],
  [11, 13], [13, 15], [12, 14], [14, 16],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  [7, 11], [8, 12],
]

/** A point is trusted from this visibility up; below it the angle is skipped and the patient told why (0.7, as in Das et al. 2026). */
export const VISIBLE = 0.7

export function point(frame: Frame, joint: Joint, side: Side): Point {
  return frame.points[LANDMARK[joint][side]]
}

export function visible(p: Point | undefined): p is Point {
  return Boolean(p && p.v >= VISIBLE)
}

/** Angle ABC in degrees (0-180), or null when a point isn't visible. */
export function angleAt(a: Point | undefined, b: Point | undefined, c: Point | undefined): number | null {
  if (!visible(a) || !visible(b) || !visible(c)) return null
  return angleBetween(a.x - b.x, a.y - b.y, c.x - b.x, c.y - b.y)
}

export function angleBetween(ux: number, uy: number, vx: number, vy: number): number | null {
  const lu = Math.hypot(ux, uy)
  const lv = Math.hypot(vx, vy)
  if (lu < 1e-6 || lv < 1e-6) return null
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Which way the person faces across the image in a side view: +1 towards larger x, -1 towards
 * smaller x. Toes sit in front of the heels and the nose in front of the ears.
 */
export function facing(frame: Frame, side: Side): 1 | -1 | null {
  let score = 0
  const toe = point(frame, 'toe', side)
  const heel = point(frame, 'heel', side)
  if (visible(toe) && visible(heel)) score += Math.sign(toe.x - heel.x) * 2
  const nose = frame.points[LANDMARK.nose]
  const ear = point(frame, 'ear', side)
  if (visible(nose) && visible(ear)) score += Math.sign(nose.x - ear.x)
  if (score === 0) return null
  return score > 0 ? 1 : -1
}

/**
 * Trunk lean from upright in degrees (shoulder over hip): positive leans forward, negative leans
 * back. `dir` is the facing direction (see facing()).
 */
export function trunkLean(frame: Frame, side: Side, dir: 1 | -1): number | null {
  const s = point(frame, 'shoulder', side)
  const h = point(frame, 'hip', side)
  if (!visible(s) || !visible(h)) return null
  const dx = (s.x - h.x) * dir
  const up = h.y - s.y
  if (up <= 1e-6 && Math.abs(dx) < 1e-6) return null
  return (Math.atan2(dx, up) * 180) / Math.PI
}

/** Thigh angle above horizontal (hip to knee), in degrees: positive when the knee is higher than the hip. */
export function thighRise(frame: Frame, side: Side, dir: 1 | -1): number | null {
  const h = point(frame, 'hip', side)
  const k = point(frame, 'knee', side)
  if (!visible(h) || !visible(k)) return null
  const forward = (k.x - h.x) * dir
  return (Math.atan2(h.y - k.y, Math.max(Math.abs(forward), 1e-6)) * 180) / Math.PI
}

/** Shoulder flexion seen from the side: the angle between the upper arm and the trunk (0 = arm by the side). */
export function shoulderFlexion(frame: Frame, side: Side): number | null {
  const s = point(frame, 'shoulder', side)
  const e = point(frame, 'elbow', side)
  const h = point(frame, 'hip', side)
  if (!visible(s) || !visible(e) || !visible(h)) return null
  return angleBetween(e.x - s.x, e.y - s.y, h.x - s.x, h.y - s.y)
}

/**
 * The side of the body nearest the camera in a side view. MediaPipe's z is depth (smaller is
 * nearer) and the far side is partly hidden, so both are used.
 */
export function nearSide(frame: Frame): Side | null {
  const joints: Joint[] = ['shoulder', 'hip', 'knee']
  let score = 0
  for (const j of joints) {
    const l = point(frame, j, 'L')
    const r = point(frame, j, 'R')
    if (!l || !r) continue
    score += (r.z - l.z) * 4 + (l.v - r.v)
  }
  if (Math.abs(score) < 0.05) return null
  return score > 0 ? 'L' : 'R'
}

/** How square-on the person stands: shoulder width over trunk height (about 0.1-0.3 side-on, 0.6+ facing the camera). */
export function frontalness(frame: Frame): number | null {
  const ls = frame.points[LANDMARK.shoulder.L]
  const rs = frame.points[LANDMARK.shoulder.R]
  const lh = frame.points[LANDMARK.hip.L]
  const rh = frame.points[LANDMARK.hip.R]
  if (!ls || !rs || !lh || !rh) return null
  const width = Math.abs(ls.x - rs.x)
  const height = Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2)
  if (height < 1e-6) return null
  return width / height
}
