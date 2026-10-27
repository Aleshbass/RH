/**
 * A physio's own exercise photos and videos: limits and the consent wording, shared by Convex
 * and the app. Limits are the fair-use limits in the company business model (Oct 2026).
 * Files are private on ImageKit and only open through short-lived signed links.
 */

export const OWN_MEDIA_LIMITS = {
  videos: 20,
  videoBytes: 50 * 1024 * 1024,
  videoSeconds: 5 * 60,
  photosPerExercise: 5,
  photoBytes: 10 * 1024 * 1024,
  totalBytes: 2 * 1024 * 1024 * 1024,
} as const

export type OwnMediaConsent = 'no_patient' | 'patient_consented'

/** What the physio confirms before uploading (network agreement clauses 5.8 and 12.2). */
export const OWN_MEDIA_CONSENT: Record<OwnMediaConsent, string> = {
  no_patient: 'No patient appears in these photos or video.',
  patient_consented: 'A patient appears, and I have their written consent to use it for exercise teaching.',
}

/** Where a physio's files live on ImageKit. Uploads are only accepted from their own folder. */
export function ownMediaFolder(userId: string) {
  return `/rehabify/own-exercises/${userId}`
}

export function formatMegabytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  return `${Math.max(0.1, bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
