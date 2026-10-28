/**
 * Patient-reported outcome questionnaires: shared types. Plain TypeScript (no React, no Convex
 * imports) so the catalogue and scoring run the same in Convex functions and in the app.
 */

export type InstrumentKey = 'lefs' | 'spadi' | 'koos12' | 'hoos12' | 'psfs' | 'nprs'

export type ScaleOption = { value: number; label: string }

/**
 * How an item is answered: one of a few labelled options (shown as a list), or a 0–10 number
 * line with words at each end.
 */
export type Scale =
  | { kind: 'choice'; options: ScaleOption[] }
  | { kind: 'numeric'; min: number; max: number; minLabel: string; maxLabel: string }

export type Section = {
  id: string
  title: string
  /** The question the items in this section answer (published wording) */
  stem?: string
  /** Default scale for the items in this section */
  scale?: Scale
}

export type Item = {
  id: string
  section: string
  text: string
  /** Overrides the section's scale */
  scale?: Scale
}

export type Subscale = {
  key: string
  label: string
  /** Item positions (0-based) in the instrument's item list */
  items: number[]
}

export type Mcid = {
  /** Smallest change in the total score that matters to patients */
  value: number
  source: string
  /** True when it is borrowed or estimated rather than established for this exact form */
  approximate?: boolean
}

export type InstrumentDef = {
  key: InstrumentKey
  /** Short name, e.g. "LEFS" */
  short: string
  /** Full name */
  name: string
  /** For the physio: what it measures and who it suits */
  summary: string
  /** For the patient: what it asks about, in plain words */
  patientIntro: string
  /** Rough time to fill in */
  minutes: number
  /** 'items' are fixed questions; 'psfs' is the patient's own activities */
  kind: 'items' | 'psfs'
  /** Which way is better for the total score */
  better: 'higher' | 'lower'
  range: { min: number; max: number }
  /** The published instructions shown before the first question */
  instructions: string
  sections: Section[]
  items: Item[]
  subscales: Subscale[]
  /** The total's label in results ("Total", "Summary"...) */
  totalLabel: string
  /** One line on how it's scored, shown to physios */
  scoringNote: string
  mcid?: Mcid
  /** Where the wording and scoring come from */
  source: string
  /** Items can be answered "Doesn't apply to me" (scored as missing, per the published rule) */
  allowNotApplicable?: boolean
  /** Items per screen in the patient's form */
  pageSize?: number
  /** Bump when wording or scoring changes, so old responses keep their meaning */
  version: number
}

/**
 * One stored answer per item, in catalogue order: the item's value, NOT_APPLICABLE when the
 * patient said it doesn't apply to them (only where the instrument allows it), or null when it
 * was left blank (only possible when a physio enters a paper form). Both count as missing.
 */
export type AnswerValue = number | null

/** "Doesn't apply to me", kept apart from a blank answer. */
export const NOT_APPLICABLE = -1

export type PsfsActivity = { activity: string; score: number | null }

export type SubscaleScore = { key: string; label: string; value: number | null }

export type ScoreResult = {
  total: number | null
  subscales: SubscaleScore[]
  answered: number
  missing: number
}
