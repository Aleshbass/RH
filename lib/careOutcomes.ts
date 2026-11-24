/**
 * How a "Patients looking for care" case went after the team reached out (owner, 24 Nov 2026).
 * Picked when logging a follow-up or resolving a case (convex/careQueue.ts, the care queue page).
 */
export const CARE_OUTCOMES = ['booked', 'book_later', 'just_looking', 'no_response', 'feedback', 'not_suitable', 'other'] as const

export type CareOutcome = (typeof CARE_OUTCOMES)[number]

export const CARE_OUTCOME_LABEL: Record<CareOutcome, string> = {
  booked: 'Booked or paired with a physio',
  book_later: 'Plans to book later',
  just_looking: 'Just checking out the website',
  no_response: "Didn't respond",
  feedback: 'Shared feedback',
  not_suitable: 'Not for us (service or area)',
  other: 'Other',
}

export const isCareOutcome = (value: unknown): value is CareOutcome =>
  typeof value === 'string' && (CARE_OUTCOMES as readonly string[]).includes(value)
