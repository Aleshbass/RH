import {
  functionalDef,
  romDef,
  specialTestDef,
  strengthDef,
  type ClinicalMeasure,
  type Region,
} from '@/convex/helpers/clinicalMeasures'

/**
 * Quick sets: one tap lays out the measures commonly taken for a presentation, ready for the
 * physio to fill in. Nothing is pre-scored, rows left empty are skipped, and every measure is one
 * from the catalogue (convex/helpers/clinicalMeasures.ts), so it charts like any other.
 *
 * Chosen from common practice and core outcome sets (e.g. OARSI's performance tests for hip and
 * knee OA, CDC STEADI for falls). To be checked by Rehabify's clinical lead (Mary).
 */

/** A measure to take, without a result. `sided`: taken on the side(s) the physio picks. */
export type SetItem = { measure: Omit<ClinicalMeasure, 'id' | 'side'>; sided: boolean }

export type QuickSet = {
  key: string
  label: string
  /** The body area it suits, to suggest it first */
  region: Region | null
  /** Words in the condition that suggest it */
  words: string[]
  items: SetItem[]
}

/** Whether the catalogue measures this per side (custom measures say so themselves). */
function sidedInCatalogue(m: Omit<ClinicalMeasure, 'id' | 'side'>) {
  if (m.kind === 'rom') return romDef(m.key)?.sided ?? false
  if (m.kind === 'strength') return strengthDef(m.key)?.sided ?? false
  if (m.kind === 'functional') return functionalDef(m.key)?.sided ?? false
  if (m.kind === 'special_test') return specialTestDef(m.key)?.sided ?? false
  return false
}

const item = (measure: Omit<ClinicalMeasure, 'id' | 'side'>, sided = sidedInCatalogue(measure)): SetItem => ({ measure, sided })

const pain = (location: string) => item({ kind: 'pain', key: 'nprs', location, context: 'movement' })
const psfs = item({ kind: 'psfs', key: 'psfs' })
const outcome = (key: string) => item({ kind: 'outcome', key })
const rom = (key: string) => item({ kind: 'rom', key, method: 'arom' })
const mmt = (key: string) => item({ kind: 'strength', key, method: 'mmt' })
const dyn = (key: string) => item({ kind: 'strength', key, method: 'dynamometer' })
const functional = (key: string, context?: string) => item({ kind: 'functional', key, ...(context ? { context } : {}) })
const special = (key: string) => item({ kind: 'special_test', key })

export const QUICK_SETS: QuickSet[] = [
  {
    key: 'knee_oa',
    label: 'Knee OA',
    region: 'knee',
    words: ['oa', 'osteoarth', 'arthritis', 'degenerat'],
    items: [pain('Knee'), psfs, outcome('lefs'), rom('knee_flexion'), rom('knee_extension_deficit'), mmt('knee_extension'), functional('chair_stand_30s'), functional('tug')],
  },
  {
    key: 'knee_post_op',
    label: 'ACL / knee surgery',
    region: 'knee',
    words: ['acl', 'reconstruct', 'tkr', 'tka', 'replacement', 'post-op', 'post op', 'postop', 'menisc', 'arthroscop'],
    items: [
      pain('Knee'),
      outcome('lefs'),
      rom('knee_flexion'),
      rom('knee_extension_deficit'),
      dyn('knee_extension'),
      dyn('knee_flexion'),
      functional('single_leg_stance'),
      item({ kind: 'outcome', key: 'custom', label: 'Single-leg hop for distance', unit: 'cm', better: 'higher' }, true),
    ],
  },
  {
    key: 'low_back',
    label: 'Low back pain',
    region: 'lumbar',
    words: ['back', 'lumbar', 'sciatica', 'lbp'],
    items: [pain('Lower back'), psfs, outcome('mskhq'), rom('lumbar_flexion'), rom('lumbar_extension'), rom('lumbar_fingertip_floor'), special('slr')],
  },
  {
    key: 'neck',
    label: 'Neck pain',
    region: 'cervical',
    words: ['neck', 'cervical', 'whiplash'],
    items: [pain('Neck'), psfs, outcome('mskhq'), rom('cervical_flexion'), rom('cervical_extension'), rom('cervical_rotation'), rom('cervical_lateral_flexion')],
  },
  {
    key: 'shoulder',
    label: 'Shoulder pain',
    region: 'shoulder',
    words: ['shoulder', 'rotator', 'frozen', 'subacromial', 'capsulitis'],
    items: [
      pain('Shoulder'),
      outcome('spadi'),
      rom('shoulder_flexion'),
      rom('shoulder_abduction'),
      rom('shoulder_external_rotation'),
      rom('shoulder_internal_rotation'),
      mmt('shoulder_external_rotation'),
    ],
  },
  {
    key: 'ankle_sprain',
    label: 'Ankle sprain',
    region: 'ankle_foot',
    words: ['sprain', 'ankle', 'atfl', 'inversion'],
    items: [pain('Ankle & foot'), outcome('lefs'), rom('ankle_foot_knee_to_wall'), functional('single_leg_stance'), special('anterior_drawer_ankle'), special('talar_tilt')],
  },
  {
    key: 'dizziness',
    label: 'Dizziness',
    region: 'vestibular',
    words: ['dizz', 'vertigo', 'bppv', 'vestibular'],
    items: [outcome('dhi'), special('dix_hallpike'), special('supine_roll'), functional('tug'), functional('sit_to_stand_5x')],
  },
  {
    key: 'falls',
    label: 'Falls risk',
    region: null,
    words: ['fall', 'balance', 'frail', 'elderly', 'older adult', 'unsteady'],
    items: [functional('tug'), functional('chair_stand_30s'), outcome('berg'), functional('ten_metre_walk', 'Comfortable'), functional('functional_reach')],
  },
]

/** Sets for this patient first: those whose words appear in the condition, then the area's. */
export function orderedSets(region: Region | null, condition?: string | null): { set: QuickSet; suggested: boolean }[] {
  const lower = condition?.toLowerCase() ?? ''
  // At the start of a word, so "oa" finds "Knee OA" but not "road"
  const mentions = (word: string) => lower.split(/[^a-z0-9-]+/).some((w) => w.startsWith(word)) || (word.includes(' ') && lower.includes(word))
  const score = (set: QuickSet) => (lower && set.words.some(mentions) ? 2 : 0) + (region && set.region === region ? 1 : 0)
  return QUICK_SETS.map((set, index) => ({ set, index, score: score(set) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ set, score: s }) => ({ set, suggested: s > 0 }))
}
