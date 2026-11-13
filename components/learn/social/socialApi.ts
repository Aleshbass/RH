/**
 * Learn community rooms and Rehabify Spaces: Convex references, types and paths.
 * Plain references because the generated `api` type is at TypeScript's depth limit (TS2589).
 */

import { makeFunctionReference, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type * as community from '@/convex/learnCommunity'
import type * as spaces from '@/convex/learnSpaces'
import { learnPath } from '../platform/learnApi'

type Returns<T> = T extends RegisteredQuery<'public', infer _A, infer R> ? Awaited<R> : T extends RegisteredMutation<'public', infer _A, infer R> ? Awaited<R> : never

export type CommunityHome = Returns<typeof community.getCommunityHome>
export type RoomPage = Returns<typeof community.getRoom>
export type PostPage = Returns<typeof community.getPost>
export type CommunityRoom = CommunityHome['rooms'][number]
export type PostSummary = CommunityHome['latest'][number]
export type Author = NonNullable<PostSummary['author']>
export type ReportRow = Returns<typeof community.adminReports>[number]

export type SpacesList = Returns<typeof spaces.listSpaces>
export type SpaceCard = SpacesList['live'][number]
export type SpacePage = NonNullable<Returns<typeof spaces.getSpace>>
export type StageSeat = Returns<typeof spaces.getStage>[number]

type Target = { targetType: 'post' | 'reply'; targetId: string }

export const communityApi = {
  home: makeFunctionReference<'query', Record<string, never>, CommunityHome>('learnCommunity:getCommunityHome'),
  room: makeFunctionReference<'query', { slug: string; limit?: number }, RoomPage>('learnCommunity:getRoom'),
  post: makeFunctionReference<'query', { postId: string }, PostPage>('learnCommunity:getPost'),
  createPost: makeFunctionReference<
    'mutation',
    { roomSlug: string; kind: 'question' | 'discussion'; title: string; body: string },
    Id<'learnPosts'>
  >('learnCommunity:createPost'),
  reply: makeFunctionReference<'mutation', { postId: Id<'learnPosts'>; body: string }, Id<'learnReplies'>>('learnCommunity:reply'),
  toggleHelpful: makeFunctionReference<'mutation', Target, { marked: boolean }>('learnCommunity:toggleHelpful'),
  report: makeFunctionReference<'mutation', Target & { reason: string }, { hidden: boolean }>('learnCommunity:report'),
  remove: makeFunctionReference<'mutation', Target, null>('learnCommunity:remove'),
  adminReports: makeFunctionReference<'query', Record<string, never>, ReportRow[]>('learnCommunity:adminReports'),
  adminModerate: makeFunctionReference<'mutation', Target & { action: 'hide' | 'restore' | 'dismiss' }, null>('learnCommunity:adminModerate'),
}

export const spacesApi = {
  list: makeFunctionReference<'query', Record<string, never>, SpacesList>('learnSpaces:listSpaces'),
  get: makeFunctionReference<'query', { spaceId: string }, SpacePage | null>('learnSpaces:getSpace'),
  stage: makeFunctionReference<'query', { spaceId: string }, StageSeat[]>('learnSpaces:getStage'),
  create: makeFunctionReference<'mutation', { title: string; description?: string; scheduledFor?: number }, Id<'learnSpaces'>>(
    'learnSpaces:createSpace'
  ),
  cancel: makeFunctionReference<'mutation', { spaceId: Id<'learnSpaces'> }, null>('learnSpaces:cancelSpace'),
  toggleReminder: makeFunctionReference<'mutation', { spaceId: Id<'learnSpaces'> }, { reminded: boolean }>('learnSpaces:toggleReminder'),
  setHand: makeFunctionReference<'mutation', { spaceId: Id<'learnSpaces'>; raised: boolean }, null>('learnSpaces:setHand'),
  leaveStage: makeFunctionReference<'mutation', { spaceId: Id<'learnSpaces'> }, null>('learnSpaces:leaveStage'),
  join: makeFunctionReference<
    'action',
    { spaceId: string },
    {
      apiKey: string
      token: string
      streamUserId: string
      callType: string
      callId: string
      isHost: boolean
      canModerate: boolean
      isSpeaker: boolean
    }
  >('learnSpacesNode:joinSpace'),
  start: makeFunctionReference<'action', { spaceId: string }, { ok: boolean }>('learnSpacesNode:startSpace'),
  end: makeFunctionReference<'action', { spaceId: string }, { ok: boolean }>('learnSpacesNode:endSpace'),
  setSpeaker: makeFunctionReference<'action', { spaceId: string; userId: Id<'users'>; speaker: boolean }, { ok: boolean }>(
    'learnSpacesNode:setSpeaker'
  ),
}

export const COMMUNITY_PATH = learnPath('/community')
export const SPACES_PATH = learnPath('/spaces')
export const roomPath = (slug: string) => learnPath(`/community/${slug}`)
export const postPath = (id: string) => learnPath(`/community/post/${id}`)
export const spacePath = (id: string) => learnPath(`/spaces/${id}`)

export function errorText(err: unknown, fallback: string) {
  const data = (err as { data?: unknown })?.data
  if (typeof data === 'string' && data) return data
  return fallback
}

const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 hours ago", "in 2 days", "just now". */
export function relativeTime(at: number, now = Date.now()) {
  const seconds = Math.round((at - now) / 1000)
  if (Math.abs(seconds) < 60) return seconds > 0 ? 'in a moment' : 'just now'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'R'
  )
}
