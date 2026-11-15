/** Learn points, badges and the leaderboard: function references (convex/learnPoints.ts) and shared bits. */
import { makeFunctionReference } from 'convex/server'
import {
  Award,
  BookOpen,
  CheckCircle2,
  Crown,
  Flame,
  GraduationCap,
  HeartPulse,
  MessageCircle,
  Mic,
  ShieldCheck,
  Star,
  Target,
  ThumbsUp,
} from '@/components/icons'
import { learnPath } from '../platform/learnApi'

export const LEADERBOARD_PATH = learnPath('/leaderboard')
export const PROGRESS_PATH = learnPath('/progress')

export type Period = 'month' | 'all'
export type Scope = 'all' | 'students' | 'physios'

export type LeaderRow = { rank: number; name: string; imageUrl: string | null; tag: { kind: string; label: string }; points: number; isMe: boolean }
export type LeaderboardData =
  | { state: 'join'; signedIn: boolean }
  | {
      state: 'ok'
      month: string
      monthLabel: string
      rows: LeaderRow[]
      me: { name: string; imageUrl: string | null; points: number; rank: number | null; hidden: boolean; ranks: boolean }
      totalRanked: number
    }

export type ProgressData =
  | { state: 'join'; signedIn: boolean }
  | {
      state: 'ok'
      name: string
      imageUrl: string | null
      total: number
      monthPoints: number
      monthLabel: string
      rank: number | null
      ranked: number
      canRank: boolean
      hidden: boolean
      streak: number
      bestStreak: number
      counts: Record<string, number>
      badges: { id: string; name: string; how: string; earnedAt: number | null; detail: string | null }[]
      weeks: { start: number; points: number }[]
      recent: { label: string; points: number; at: number }[]
      sims: { slug: string; title: string; score: number; passed: boolean }[]
    }

export type AdminMonthTop = {
  month: string
  monthLabel: string
  closed: boolean
  months: { month: string; label: string }[]
  top: { userId: string; rank: number; points: number; name: string; tag: string; email: string | null; phone: string | null; contacted: boolean }[]
}

export const pointsApi = {
  leaderboard: makeFunctionReference<'query', { period: Period; scope: Scope }, LeaderboardData>('learnPoints:leaderboard'),
  myPoints: makeFunctionReference<'query', Record<string, never>, { total: number } | null>('learnPoints:myPoints'),
  myProgress: makeFunctionReference<'query', Record<string, never>, ProgressData>('learnPoints:myProgress'),
  setHidden: makeFunctionReference<'mutation', { hidden: boolean }, { hidden: boolean }>('learnPoints:setLeaderboardHidden'),
  adminMonthTop: makeFunctionReference<'query', { month?: string }, AdminMonthTop>('learnPoints:adminMonthTop'),
  adminMarkContacted: makeFunctionReference<'mutation', { month: string; userId: string; contacted: boolean }, null>('learnPoints:adminMarkContacted'),
}

/** An icon per badge (lib/learn/points.ts LEARN_BADGES). */
export const BADGE_ICON: Record<string, typeof Award> = {
  'first-step': BookOpen,
  'course-finisher': GraduationCap,
  'case-cracker': HeartPulse,
  'red-flag-hunter': Target,
  'ice-breaker': MessageCircle,
  'helping-hand': ThumbsUp,
  'on-stage': Mic,
  'streak-7': Flame,
  certified: ShieldCheck,
  'club-1000': Star,
  'top-10': Crown,
}
export const DefaultBadgeIcon = CheckCircle2

export const formatPoints = (n: number) => n.toLocaleString('en-NG')
