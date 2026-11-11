import type { InviteLink } from './refs'

/**
 * One request per patient's link, shared: Add patient starts it the moment the patient is saved
 * (while the drawer slides to step 2), and step 2 picks up the same promise, so the link is
 * usually ready before it's needed. Reopening within a few minutes is instant.
 */
type Create = (args: { patientId: string }) => Promise<InviteLink>
const cache = new Map<string, { at: number; promise: Promise<InviteLink> }>()
const FRESH_MS = 10 * 60_000

export function getInviteLink(create: Create, patientId: string): Promise<InviteLink> {
  const hit = cache.get(patientId)
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.promise
  const promise = create({ patientId }).catch((error) => {
    cache.delete(patientId)
    throw error
  })
  cache.set(patientId, { at: Date.now(), promise })
  return promise
}

/** "They're here: QR" remembered per browser: physios who invite in the room get the QR first. */
const QR_KEY = 'rh_invite_prefers_qr'
export const prefersQr = () => {
  try {
    return localStorage.getItem(QR_KEY) === '1'
  } catch {
    return false
  }
}
export const rememberQr = (on: boolean) => {
  try {
    localStorage.setItem(QR_KEY, on ? '1' : '0')
  } catch {
    // Not remembered: fine
  }
}
