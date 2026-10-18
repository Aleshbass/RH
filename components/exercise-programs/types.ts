import type { LibraryItem } from '@/convex/exerciseLibrary'
import type { careTeamProgramView, patientProgramView, programView } from '@/convex/exercisePrograms'

// The generated `api` object degrades to `any` in the app (the project has ~190 Convex modules),
// so query results are cast to these types, which come straight from the Convex view builders.

export type LibraryEntry = LibraryItem
export type LibraryData = { version: string; access: 'staff' | 'licence'; label: string; items: LibraryEntry[] }

export type ProgramView = Awaited<ReturnType<typeof programView>>
export type CareTeamProgram = Awaited<ReturnType<typeof careTeamProgramView>>
export type MyProgram = Awaited<ReturnType<typeof patientProgramView>>

export type SharedProgramResult =
  | { ok: true; patientFirstName: string | null; expiresAt: number; program: ProgramView; doneToday: number[] }
  | { ok: false; reason: string }

// One member per failure state, so each `state` check narrows the union.
export type LinkStatus =
  | { state: 'not_found' }
  | { state: 'expired' }
  | { state: 'revoked' }
  | { state: 'locked' }
  | { state: 'needs_pin' | 'cooldown'; senderName: string; pinSource: 'phone' | 'custom'; lockedUntil: number | null; expiresAt: number }

/** The shape every player view needs (patient dashboard, share link, care-team preview). */
export type ProgramForPlayer = Pick<
  ProgramView,
  '_id' | 'title' | 'note' | 'goals' | 'voiceNoteUrl' | 'voiceNoteSeconds' | 'senderName' | 'clinicName' | 'createdAt' | 'items'
>
export type ProgramItem = ProgramForPlayer['items'][number]

/** What to call a list of items: "3 exercises", "2 exercises · 1 education". */
export function itemsSummary(items: { kind?: string | null }[]) {
  const education = items.filter((i) => i.kind === 'education').length
  const exercises = items.length - education
  const parts = []
  if (exercises || !education) parts.push(`${exercises} exercise${exercises === 1 ? '' : 's'}`)
  if (education) parts.push(`${education} education`)
  return parts.join(' · ')
}

export type LogInput = {
  itemIndex: number
  setsDone?: number
  painScore?: number
  difficulty?: 'easy' | 'ok' | 'hard'
  note?: string
}

/**
 * Posters are our own static files, so next/image can optimise them. Older exercises may have
 * photos on any host, which next/image would reject without a remotePatterns entry.
 */
export const isLocalImage = (src: string) => src.startsWith('/')

export function doseLabel(item: Pick<ProgramItem, 'sets' | 'reps' | 'holdSeconds'>) {
  if (item.sets === null || item.reps === null) return ''
  const base = `${item.sets} × ${item.reps}`
  return item.holdSeconds ? `${base} · hold ${item.holdSeconds}s` : base
}

export function sideLabel(slug: string | undefined, side: 'L' | 'R' | null) {
  if (!side) return null
  if (slug === 'bird-dog') return side === 'L' ? 'Left arm, right leg' : 'Right arm, left leg'
  return side === 'L' ? 'Left side' : 'Right side'
}
