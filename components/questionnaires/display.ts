import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns'
import { compareScores, type ScoreChange } from '@/lib/questionnaires/scoring'
import type { InstrumentDef } from '@/lib/questionnaires/types'

/** "today 10:00", "tomorrow 10:00", "Tue 4 Nov, 10:00" */
export function whenText(ms: number) {
  if (isToday(ms)) return `today ${format(ms, 'h:mm a')}`
  if (isTomorrow(ms)) return `tomorrow ${format(ms, 'h:mm a')}`
  return format(ms, 'EEE d MMM, h:mm a')
}

export type WaitingState = { label: string; tone: 'blue' | 'amber' | 'red' | 'neutral' }

/** Where a sent questionnaire stands, for a badge. */
export function waitingState(row: { expired: boolean; dueAt: number | null; hasDraft: boolean }, now = Date.now()): WaitingState {
  if (row.expired) return { label: 'Not filled in', tone: 'neutral' }
  if (row.dueAt && row.dueAt < now) return { label: 'Overdue', tone: 'red' }
  if (row.hasDraft) return { label: 'Started', tone: 'amber' }
  if (row.dueAt && row.dueAt - now < 24 * 3_600_000) return { label: 'Due soon', tone: 'amber' }
  return { label: 'Waiting', tone: 'blue' }
}

export function sentText(row: { sentAt: number; dueAt: number | null; appointmentId: unknown }) {
  const sent = `Sent ${formatDistanceToNowStrict(row.sentAt, { addSuffix: true })}`
  if (!row.dueAt) return sent
  return `${sent} · ${row.appointmentId ? 'before the visit on' : 'due'} ${whenText(row.dueAt)}`
}

/** Badge tone for a change: green or red only when it's at least the MCID. */
export function changeTone(change: ScoreChange): 'green' | 'red' | 'neutral' {
  if (!change.meaningful) return 'neutral'
  return change.tone === 'better' ? 'green' : change.tone === 'worse' ? 'red' : 'neutral'
}

/** "+12 points, better" or "+4 points, better (less than the MCID)" */
export function changeLabel(def: InstrumentDef, change: ScoreChange) {
  if (change.tone === 'same' || change.meaningful || !def.mcid) return change.text
  return `${change.text}, under ${def.mcid.value}`
}

export { compareScores }
