import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { TierKey } from '@/lib/rewards/rules'

/**
 * convex/community.ts, referenced by name: the generated api type sits at TypeScript's depth
 * limit (TS2589), so these spell out what each function takes and returns.
 */

export type CommunityAuthor = { name: string; tierKey: TierKey; tierName: string; role: 'lead' | 'moderator' | 'rehabify' | null }

export type PostRow = {
  _id: Id<'communityPosts'>
  kind: 'case' | 'question'
  title: string
  excerpt: string
  bodyRegion: string | null
  needsSenior: boolean
  status: 'open' | 'closed' | 'hidden'
  caseNumber: number | null
  closesAt: number | null
  revealed: boolean
  cpdMinutes: number | null
  answerCount: number
  helpfulCount: number
  author: CommunityAuthor
  lastActivityAt: number
  createdAt: number
}

export type CommunityHome = {
  current: PostRow | null
  pastCases: PostRow[]
  questions: PostRow[]
  me: { canLead: boolean; canModerate: boolean; cpdMinutes: number; tierKey: TierKey; tierName: string }
} | null

export type PostDetail = {
  post: PostRow & { body: string; reveal: { answer: string; teaching: string; at: number } | null }
  poll: {
    total: number
    myVote: string | null
    showResults: boolean
    options: { key: string; label: string; votes: number | null }[]
  } | null
  answers: {
    _id: Id<'communityAnswers'>
    body: string
    usefulCount: number
    helpful: boolean
    helpfulByLead: boolean
    hidden: boolean
    mine: boolean
    iFoundUseful: boolean
    author: CommunityAuthor
    createdAt: number
  }[]
  me: { isAuthor: boolean; canMarkHelpful: boolean; canLead: boolean; canModerate: boolean; answered: boolean }
} | null

export type MyActivity = {
  posts: PostRow[]
  answers: { answerId: Id<'communityAnswers'>; postId: Id<'communityPosts'>; title: string; kind: 'case' | 'question'; usefulCount: number; helpful: boolean; at: number }[]
  helpfulTotal: number
  usefulTotal: number
} | null

export type AdminCommunity = {
  reports: {
    _id: Id<'communityReports'>
    postId: Id<'communityPosts'>
    answerId: Id<'communityAnswers'> | null
    postTitle: string
    text: string
    hidden: boolean
    reason: string
    by: string
    at: number
  }[]
  hiddenPosts: { _id: Id<'communityPosts'>; title: string; kind: 'case' | 'question' }[]
  roles: { _id: string; role: 'lead' | 'moderator'; name: string; email: string }[]
} | null

const q = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'query', Args, Result>(name)
const m = <Args extends Record<string, unknown>, Result>(name: string) => makeFunctionReference<'mutation', Args, Result>(name)

export const communityRefs = {
  home: q<Record<string, never>, CommunityHome>('community:getCommunityHome'),
  mine: q<Record<string, never>, MyActivity>('community:getMyCommunityActivity'),
  post: q<{ postId: Id<'communityPosts'> }, PostDetail>('community:getCommunityPost'),
  ask: m<{ title: string; body: string; bodyRegion?: string; needsSenior?: boolean; anonymised: boolean }, { postId: Id<'communityPosts'> }>(
    'community:askQuestion'
  ),
  publishCase: m<
    { title: string; body: string; bodyRegion?: string; pollOptions: string[]; closesAt: number; anonymised: boolean },
    { postId: Id<'communityPosts'>; caseNumber: number }
  >('community:publishCase'),
  answer: m<{ postId: Id<'communityPosts'>; body: string }, { answerId: Id<'communityAnswers'> }>('community:answerPost'),
  vote: m<{ postId: Id<'communityPosts'>; option: string }, { ok: boolean }>('community:voteOnCase'),
  useful: m<{ answerId: Id<'communityAnswers'> }, { useful: boolean }>('community:toggleUseful'),
  helpful: m<{ answerId: Id<'communityAnswers'> }, { ok: boolean }>('community:markHelpful'),
  reveal: m<{ postId: Id<'communityPosts'>; answer: string; teaching: string }, { logged: number }>('community:revealCase'),
  setClosed: m<{ postId: Id<'communityPosts'>; closed: boolean }, { ok: boolean }>('community:setQuestionClosed'),
  report: m<{ postId: Id<'communityPosts'>; answerId?: Id<'communityAnswers'>; reason: string }, { ok: boolean }>('community:reportCommunity'),
  moderate: m<{ postId: Id<'communityPosts'>; answerId?: Id<'communityAnswers'>; hidden: boolean }, { ok: boolean }>('community:moderateCommunity'),
  adminOverview: q<Record<string, never>, AdminCommunity>('community:adminCommunityOverview'),
  adminSetRole: m<{ email: string; role: 'lead' | 'moderator' | 'none' }, { ok: boolean }>('community:adminSetCommunityRole'),
}

/** "Closes Sunday", "Closes in 3 h", "Closed". */
export function closesLabel(closesAt: number | null, status: string) {
  if (status !== 'open' || !closesAt) return 'Closed'
  const left = closesAt - Date.now()
  if (left <= 0) return 'Closing now'
  if (left < 86_400_000) return `Closes in ${Math.max(1, Math.round(left / 3_600_000))} h`
  return `Closes ${new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' }).format(closesAt)}`
}
