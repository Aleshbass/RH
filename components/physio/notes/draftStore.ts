import { draftHasContent, sameDraft, type NoteDraft } from './progress'

/**
 * Unsaved notes, kept in this browser so closing the drawer (or the tab) loses nothing.
 *
 * Each draft belongs to the signed-in user, the patient and the note being edited ("new" for a
 * new note), and lasts 7 days. Loading clears drafts that have expired or belong to someone
 * else (a shared computer), and signing out clears your own. Storage can be blocked or cleared,
 * so every call is best effort.
 */

const PREFIX = 'rh_note_draft:'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type Stored = {
  v: 2
  userId: string
  savedAt: number
  draft: NoteDraft
  /** For an edit: the note as it was when the edit began, so a draft left behind by a later change is dropped */
  base?: NoteDraft
}

const keyFor = (userId: string, patientId: string, noteId?: string) => `${PREFIX}${userId}:${patientId}:${noteId ?? 'new'}`

function read(key: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const stored = JSON.parse(raw) as Stored
    return stored && stored.v === 2 && typeof stored.userId === 'string' && typeof stored.savedAt === 'number' && Array.isArray(stored.draft?.measures)
      ? stored
      : null
  } catch {
    return null
  }
}

/** Removes expired drafts, drafts from older versions, and (given a user) everyone else's. */
export function purgeNoteDrafts(userId?: string | null) {
  try {
    const storage = window.localStorage
    const now = Date.now()
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      const stored = read(key)
      if (!stored) {
        storage.removeItem(key)
        continue
      }
      const expired = now - stored.savedAt > MAX_AGE_MS || stored.savedAt > now + MAX_AGE_MS
      if (expired || (userId && stored.userId !== userId)) storage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing kept, nothing to clear
  }
}

/**
 * The user's unsaved draft for this patient (and note, when editing), or null. For an edit,
 * `base` is the note as it is now: a draft started from an earlier version is dropped.
 */
export function loadNoteDraft(userId: string, patientId: string, noteId?: string, base?: NoteDraft): NoteDraft | null {
  purgeNoteDrafts(userId)
  const key = keyFor(userId, patientId, noteId)
  const stored = read(key)
  if (!stored) return null
  const stale = noteId !== undefined && (!stored.base || !base || !sameDraft(stored.base, base))
  if (stale || !draftHasContent(stored.draft)) {
    clearNoteDraft(userId, patientId, noteId)
    return null
  }
  return stored.draft
}

export function saveNoteDraft(userId: string, patientId: string, draft: NoteDraft, noteId?: string, base?: NoteDraft) {
  try {
    const key = keyFor(userId, patientId, noteId)
    if (!draftHasContent(draft)) {
      window.localStorage.removeItem(key)
      return
    }
    const stored: Stored = { v: 2, userId, savedAt: Date.now(), draft, ...(base ? { base } : {}) }
    window.localStorage.setItem(key, JSON.stringify(stored))
  } catch {
    // Private mode or storage full: the note still saves normally
  }
}

export function clearNoteDraft(userId: string, patientId: string, noteId?: string) {
  try {
    window.localStorage.removeItem(keyFor(userId, patientId, noteId))
  } catch {
    // Nothing to clear
  }
}

/** Every draft of this user's in this browser, for signing out. */
export function clearUserNoteDrafts(userId: string | null | undefined) {
  if (!userId) return
  try {
    const storage = window.localStorage
    const mine: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(`${PREFIX}${userId}:`)) mine.push(key)
    }
    for (const key of mine) storage.removeItem(key)
  } catch {
    // Storage blocked
  }
}
