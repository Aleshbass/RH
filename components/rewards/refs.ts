import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { RewardKind, TierKey } from '@/lib/rewards/rules'

/**
 * convex/rewards.ts, referenced by name: the generated api type sits at TypeScript's depth
 * limit (TS2589), so these spell out what each function takes and returns.
 */

export type Tier = { key: TierKey; name: string; min: number }

export type RedemptionStatus = 'active' | 'pending' | 'fulfilled' | 'cancelled' | 'ended'

export type MyRewards = {
  balance: number
  earned12m: number
  tier: Tier
  next: (Tier & { needed: number }) | null
  weekPoints: number
  week: { _id: string; points: number; label: string; at: number }[]
  history: { _id: string; points: number; label: string; reason: string; at: number }[]
  items: { _id: Id<'rewardItems'>; kind: RewardKind; title: string; description: string; cost: number; durationDays: number | null }[]
  redemptions: { _id: string; kind: RewardKind; title: string; cost: number; status: RedemptionStatus; endsAt: number | null; note: string | null; at: number }[]
  featuredUntil: number | null
  boostUntil: number | null
  cpd: { year: number; minutes: number; entries: { _id: string; minutes: number; label: string; source: string; at: number }[] }
} | null

export type CpdRecord = {
  name: string
  licence: string | null
  year: number
  minutes: number
  entries: { minutes: number; label: string; source: string; at: number }[]
} | null

export type AdminRedemption = {
  _id: Id<'rewardRedemptions'>
  userId: Id<'users'>
  name: string
  kind: RewardKind
  title: string
  cost: number
  status: RedemptionStatus
  endsAt: number | null
  note: string | null
  at: number
}

export type AdminRewards = {
  items: {
    _id: Id<'rewardItems'>
    kind: RewardKind
    title: string
    description: string
    cost: number
    durationDays: number | null
    stock: number | null
    active: boolean
  }[]
  pending: AdminRedemption[]
  recent: AdminRedemption[]
  top: { userId: Id<'users'>; name: string; balance: number; earned12m: number; tier: string; cpdMinutes: number }[]
}

const q = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'query', Args, Result>(name)
const m = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'mutation', Args, Result>(name)

export const rewardRefs = {
  mine: q<Record<string, never>, MyRewards>('rewards:getMyRewards'),
  myTier: q<Record<string, never>, { tier: Tier; balance: number } | null>('rewards:getMyTier'),
  redeem: m<{ itemId: Id<'rewardItems'> }, { status: RedemptionStatus; endsAt: number | null; balance: number; kind: RewardKind }>('rewards:redeemReward'),
  cpdRecord: q<{ year?: number }, CpdRecord>('rewards:getMyCpdRecord'),
  adminOverview: q<Record<string, never>, AdminRewards>('rewards:adminRewardsOverview'),
  adminAddStarters: m<Record<string, never>, { added: number }>('rewards:adminAddStarterRewards'),
  adminSaveItem: m<
    {
      itemId?: Id<'rewardItems'>
      kind: RewardKind
      title: string
      description: string
      cost: number
      durationDays?: number
      stock?: number
      active: boolean
    },
    { itemId: Id<'rewardItems'> }
  >('rewards:adminSaveRewardItem'),
  adminHandle: m<{ redemptionId: Id<'rewardRedemptions'>; action: 'fulfil' | 'cancel'; note?: string }, { ok: boolean }>(
    'rewards:adminHandleRedemption'
  ),
  adminAdjust: m<{ email: string; points: number; reason: string }, { balance: number }>('rewards:adminAdjustPoints'),
}
