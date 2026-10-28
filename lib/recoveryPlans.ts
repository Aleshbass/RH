/**
 * The digital recovery service a patient can add between sessions. Basic is always free and is
 * never taken away. Flex and Flex Max are paid 30-day plans (no automatic renewal). An admin
 * switches each one on from the admin console (Patient plans); until then they show as
 * "coming soon" and nobody is asked to pay. `available` below is the default before the live
 * state from Convex arrives (exercisePrograms.recoveryPlansLive); use withLiveState().
 *
 * Only the own patients of independent physiotherapists buy Flex. Rehabify Care and clinic
 * patients keep everything included (convex/helpers/patientPlans.ts decides who pays).
 */

export type RecoveryPlanId = 'basic' | 'flex' | 'flex_max'
export type PaidRecoveryPlanId = Exclude<RecoveryPlanId, 'basic'>

export type RecoveryPlan = {
  id: RecoveryPlanId
  name: string
  description: string
  /** What the plan adds, in short lines for offer cards. */
  features: string[]
  /** Price for one 30-day period, in kobo (0 for Basic). */
  priceKobo: number
  /** Shown only once the plan is available. */
  priceLabel: string
  available: boolean
}

/** Each paid period lasts this long from activation. */
export const RECOVERY_PLAN_DAYS = 30

export const RECOVERY_PLANS: RecoveryPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'The essential instructions you need to follow your physiotherapist’s plan. Always free, and never taken away.',
    features: ['Your exercises, doses and steps', 'Your physio’s notes and voice note', 'Education they share'],
    priceKobo: 0,
    priceLabel: 'Free',
    available: true,
  },
  {
    id: 'flex',
    name: 'Flex',
    description: 'Your interactive home programme, with exercise demo videos and progress tracking.',
    features: ['3D and video demonstrations', 'Your physio’s own photos and videos', 'Log sets, pain and difficulty', 'See your progress'],
    priceKobo: 150_000,
    priceLabel: '₦1,500 for 30 days',
    available: false,
  },
  {
    id: 'flex_max',
    name: 'Flex Max',
    description: 'Everything in Flex, plus Joy on WhatsApp for reminders and support.',
    features: ['Everything in Flex', 'Joy reminders on WhatsApp', 'Support from Joy between sessions'],
    priceKobo: 350_000,
    priceLabel: '₦3,500 for 30 days',
    available: false,
  },
]

/** Which paid plans are on sale (set by an admin). */
export type RecoveryPlansLive = { flexLive: boolean; flexMaxLive: boolean }

export function recoveryPlan(id: RecoveryPlanId): RecoveryPlan {
  return RECOVERY_PLANS.find((plan) => plan.id === id)!
}

export function isPlanLive(id: RecoveryPlanId, live: RecoveryPlansLive | null | undefined): boolean {
  if (id === 'basic') return true
  if (!live) return false
  return id === 'flex' ? live.flexLive : live.flexMaxLive
}

/** The plans with `available` taken from the live state (Basic is always available). */
export function withLiveState(live: RecoveryPlansLive | null | undefined): RecoveryPlan[] {
  return RECOVERY_PLANS.map((plan) => ({ ...plan, available: isPlanLive(plan.id, live) }))
}

export function recoveryPlanStatus(plan: RecoveryPlan) {
  return plan.available ? plan.priceLabel : 'Coming soon'
}
