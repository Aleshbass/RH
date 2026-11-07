/**
 * The physio profiles opened in this browser on Find a Physio (newest first, last 10). Sent with
 * "Help me choose a physio", and once when a patient is signed in, so the care team can see who
 * they were considering. Kept on this device only until then.
 */
const KEY = 'rh_viewed_physios'
const MAX = 10
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

type Entry = { id: string; at: number }

function read(): Entry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - MAX_AGE_MS
    return parsed.filter((e): e is Entry => typeof e?.id === 'string' && typeof e?.at === 'number' && e.at >= cutoff)
  } catch {
    return []
  }
}

export function rememberViewedPhysio(id: string) {
  try {
    const next = [{ id, at: Date.now() }, ...read().filter((e) => e.id !== id)].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage blocked: nothing to remember
  }
}

export function viewedPhysioIds(): string[] {
  if (typeof window === 'undefined') return []
  return read().map((e) => e.id)
}
