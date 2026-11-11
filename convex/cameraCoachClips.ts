/**
 * The exercises the camera coach follows, and the library clips each one covers. One list for the
 * app (lib/motion/exercises.ts, which holds how each is measured) and the server (guidedSessions.ts,
 * which only saves sessions for these clips).
 */
export const CAMERA_COACH_CLIPS = {
  // Side-on to the phone
  "sit-to-stand": ["sit-to-stand"],
  "seated-knee-extension": ["seated-knee-extension-left", "seated-knee-extension-right"],
  "shoulder-flexion": ["shoulder-flexion"],
  "mini-squat": ["mini-squat"],
  "chair-squat": ["chair-squat"],
  "wall-squat": ["wall-squat"],
  "single-leg-decline-squat": ["single-leg-decline-squat-left", "single-leg-decline-squat-right"],
  "wall-push-up": ["wall-push-up"],
  "band-row": ["band-row"],
  "forward-bend-sitting": ["forward-bend-sitting"],
  // Lying or kneeling, side-on, with the phone low down
  "glute-bridge": ["glute-bridge"],
  "straight-leg-raise": ["straight-leg-raise-left", "straight-leg-raise-right"],
  "heel-slides": ["heel-slides-left", "heel-slides-right"],
  "bird-dog": ["bird-dog-left", "bird-dog-right"],
  // Facing the phone
  "assisted-abduction": ["assisted-abduction-left", "assisted-abduction-right"],
  "scaption": ["scaption"],
  "wall-angels": ["wall-angels"],
  "standing-hip-abduction": ["standing-hip-abduction-left", "standing-hip-abduction-right"],
} as const satisfies Record<string, readonly string[]>;

export type CameraCoachKey = keyof typeof CAMERA_COACH_CLIPS;
