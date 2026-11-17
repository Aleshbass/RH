/**
 * Individual Pro (convex/physioPlans.ts): references and types. Plain references because the
 * generated `api` type is at TypeScript's depth limit (TS2589).
 */
import { makeFunctionReference, type RegisteredQuery } from 'convex/server'
import type * as plans from '@/convex/physioPlans'

type Returns<T> = T extends RegisteredQuery<'public', infer _A, infer R> ? Awaited<R> : never

export type MyPlan = NonNullable<Returns<typeof plans.getMyPlan>>
export type AdminPlans = Returns<typeof plans.adminOverview>
export type Purpose = 'upgrade' | 'card' | 'renew'

export const planApi = {
  mine: makeFunctionReference<'query', Record<string, never>, MyPlan | null>('physioPlans:getMyPlan'),
  start: makeFunctionReference<'action', { purpose: Purpose }, { authorizationUrl: string }>('physioPlans:startCheckout'),
  verify: makeFunctionReference<'action', { reference: string }, { ok: boolean; already?: boolean; reason?: string; kind?: string }>(
    'physioPlans:verifyPayment'
  ),
  cancel: makeFunctionReference<'mutation', Record<string, never>, { endsAt: number | null }>('physioPlans:cancelPro'),
  keep: makeFunctionReference<'mutation', Record<string, never>, null>('physioPlans:keepPro'),
  removeCard: makeFunctionReference<'mutation', Record<string, never>, null>('physioPlans:removeCard'),
  dismissAnnouncement: makeFunctionReference<'mutation', Record<string, never>, null>('physioPlans:dismissAnnouncement'),
  adminOverview: makeFunctionReference<'query', Record<string, never>, AdminPlans>('physioPlans:adminOverview'),
  adminSave: makeFunctionReference<'mutation', Record<string, number | string | boolean>, null>('physioPlans:adminSaveSettings'),
  adminGrant: makeFunctionReference<'mutation', { email: string; days: number; reason: string }, null>('physioPlans:adminGrant'),
  adminRevoke: makeFunctionReference<'mutation', { grantId: string }, null>('physioPlans:adminRevokeGrant'),
}

export const PLAN_PAGE = '/dashboard/physiotherapist/settings/plan'
