/**
 * Reward points for physiotherapists: what earns them, the tiers, and the starter rewards.
 * Plain TypeScript, shared by convex/rewards.ts and the dashboards. The owner tunes the numbers
 * here; prices of rewards are set by admins in the catalogue.
 *
 * Points reward helping other clinicians and good care. They never come from referring patients,
 * bookings or payments, and they last 12 months.
 */

export type EarnReason =
  | 'template_used'
  | 'exercise_approved'
  | 'exercise_prescribed'
  | 'discharge_scores'
  | 'card_shared'
  | 'answer_helpful'
  | 'case_answered'
  | 'masterclass_attended'

export const EARN: Record<EarnReason, { points: number; label: string; dailyCap: number }> = {
  template_used: { points: 10, label: 'Another physio used your template', dailyCap: 100 },
  exercise_approved: { points: 25, label: 'Your exercise joined the Rehabify library', dailyCap: 100 },
  exercise_prescribed: { points: 5, label: 'Another physio prescribed your exercise', dailyCap: 50 },
  discharge_scores: { points: 20, label: 'Discharge with complete scores', dailyCap: 200 },
  card_shared: { points: 20, label: 'Shared your first feedback card', dailyCap: 20 },
  answer_helpful: { points: 50, label: 'Answer marked helpful', dailyCap: 200 },
  case_answered: { points: 5, label: 'Answered the Case of the Week', dailyCap: 10 },
  masterclass_attended: { points: 10, label: 'Masterclass attended', dailyCap: 20 },
}

/** How long earned points last. */
export const POINTS_LIFETIME_DAYS = 365

export type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum'

/** By points earned in the last 12 months (spending never lowers a tier). */
export const TIERS: { key: TierKey; name: string; min: number }[] = [
  { key: 'bronze', name: 'Bronze', min: 0 },
  { key: 'silver', name: 'Silver', min: 500 },
  { key: 'gold', name: 'Gold', min: 1500 },
  { key: 'platinum', name: 'Platinum', min: 4000 },
]

export function tierFor(earned12m: number) {
  return [...TIERS].reverse().find((t) => earned12m >= t.min) ?? TIERS[0]
}

export function nextTier(earned12m: number) {
  const next = TIERS.find((t) => t.min > earned12m)
  return next ? { ...next, needed: next.min - earned12m } : null
}

export type RewardKind = 'featured_profile' | 'referral_boost' | 'masterclass_seat' | 'cpd_certificate' | 'custom'

/** What each kind of reward does when redeemed. */
export const REWARD_KIND: Record<RewardKind, { label: string; effect: string; instant: boolean }> = {
  featured_profile: {
    label: 'Featured profile',
    effect: 'Your profile shows first among physios who match a patient’s search, with a Featured label.',
    instant: true,
  },
  referral_boost: {
    label: 'Referral boost',
    effect:
      'When two physios are an equal fit, you come first in Find a physio and at the top of Rehabify’s list when we assign patients. Location, skills and availability always come first, and the Rehabify team still decides.',
    instant: true,
  },
  masterclass_seat: {
    label: 'Masterclass seat',
    effect: 'A seat at the next Rehabify masterclass. The team confirms your place by email.',
    instant: false,
  },
  cpd_certificate: {
    label: 'CPD record',
    effect: 'A PDF record of the learning you’ve logged on Rehabify this year.',
    instant: true,
  },
  custom: { label: 'Reward', effect: 'The Rehabify team gets in touch to arrange it.', instant: false },
}

/** Added by an admin with one tap when the catalogue is empty; prices can be changed after. */
export const STARTER_REWARDS: { kind: RewardKind; title: string; cost: number; durationDays?: number; description: string }[] = [
  { kind: 'referral_boost', title: 'Referral boost · 7 days', cost: 500, durationDays: 7, description: REWARD_KIND.referral_boost.effect },
  { kind: 'featured_profile', title: 'Featured profile · 7 days', cost: 600, durationDays: 7, description: REWARD_KIND.featured_profile.effect },
  { kind: 'masterclass_seat', title: 'Masterclass seat', cost: 800, description: REWARD_KIND.masterclass_seat.effect },
  { kind: 'cpd_certificate', title: 'CPD record', cost: 0, description: REWARD_KIND.cpd_certificate.effect },
]

/** CPD this year, rounded the way people read it: "6 h", "1.5 h", "45 min". */
export function cpdHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round((minutes / 60) * 10) / 10
  return `${hours} h`
}
