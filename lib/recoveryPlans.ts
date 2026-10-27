/**
 * The digital recovery service a patient can add between sessions. Basic is always free and is
 * never taken away. Flex and Flex Max are paid 30-day plans (no automatic renewal), shown as
 * "coming soon" until they launch: set `available` and the price then.
 */

export type RecoveryPlan = {
  id: 'basic' | 'flex' | 'flex_max'
  name: string
  description: string
  /** Shown only once the plan is available. */
  priceLabel: string
  available: boolean
}

export const RECOVERY_PLANS: RecoveryPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'The essential instructions you need to follow your physiotherapist’s plan. Always free, and never taken away.',
    priceLabel: 'Free',
    available: true,
  },
  {
    id: 'flex',
    name: 'Flex',
    description: 'Your interactive home programme, with exercise demo videos and progress tracking.',
    priceLabel: '₦1,500 for 30 days',
    available: false,
  },
  {
    id: 'flex_max',
    name: 'Flex Max',
    description: 'Everything in Flex, plus Joy on WhatsApp for reminders and support.',
    priceLabel: '₦3,500 for 30 days',
    available: false,
  },
]

export function recoveryPlanStatus(plan: RecoveryPlan) {
  return plan.available ? plan.priceLabel : 'Coming soon'
}
