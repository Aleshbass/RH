/**
 * Typed references to convex/learnAdmins.ts (Learn super admins) and convex/learnGroups.ts
 * (small groups). Plain references, because the generated `api` type sits at TypeScript's depth
 * limit (TS2589).
 */
import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'

// ── Learn super admins ────────────────────────────────────────────────────────

export type LearnAdminRow = {
  userId: Id<'users'>
  name: string
  email: string | null
  imageUrl: string | null
  role: string | null
  addedBy: string
  addedAt: number
}

export const learnAdminMeRef = makeFunctionReference<'query', Record<string, never>, { learnAdmin: boolean; platformAdmin: boolean }>(
  'learnAdmins:me'
)
export const learnAdminListRef = makeFunctionReference<'query', Record<string, never>, LearnAdminRow[]>('learnAdmins:list')
export const learnAdminAddRef = makeFunctionReference<'mutation', { email: string }, { name: string; already: boolean }>('learnAdmins:add')
export const learnAdminRemoveRef = makeFunctionReference<'mutation', { userId: Id<'users'> }, null>('learnAdmins:remove')

// ── Groups ────────────────────────────────────────────────────────────────────

export const GROUP_COLORS = ['lime', 'sky', 'amber', 'rose', 'violet', 'teal'] as const
export type GroupColor = (typeof GROUP_COLORS)[number]

/** Solid dot + soft fill for each group colour (literal colours: they read the same in dark mode). */
export const GROUP_TONE: Record<string, { dot: string; soft: string; ink: string }> = {
  lime: { dot: '#00cd0f', soft: 'rgb(0 205 15 / 0.12)', ink: '#0b6b14' },
  sky: { dot: '#38bdf8', soft: 'rgb(56 189 248 / 0.14)', ink: '#0369a1' },
  amber: { dot: '#f59e0b', soft: 'rgb(245 158 11 / 0.15)', ink: '#92400e' },
  rose: { dot: '#f43f5e', soft: 'rgb(244 63 94 / 0.13)', ink: '#9f1239' },
  violet: { dot: '#8b5cf6', soft: 'rgb(139 92 246 / 0.14)', ink: '#5b21b6' },
  teal: { dot: '#14b8a6', soft: 'rgb(20 184 166 / 0.14)', ink: '#115e59' },
}
export const groupTone = (color: string | null | undefined) => GROUP_TONE[color ?? ''] ?? GROUP_TONE.lime

export type GroupRole = 'member' | 'lead'

export type AdminGroupRow = {
  id: Id<'learnGroups'>
  name: string
  description: string | null
  color: string
  memberCount: number
  archived: boolean
  leads: string[]
  roomSlug: string
  postCount: number
  lastActivityAt: number | null
  createdAt: number
}

export type AdminGroupMember = {
  userId: Id<'users'>
  name: string
  email: string | null
  imageUrl: string | null
  tag: string | null
  isLearnMember: boolean
  role: GroupRole
  addedAt: number
  courses: number
  casesPassed: number
  posts: number
}

export type AdminGroup = {
  id: Id<'learnGroups'>
  name: string
  description: string | null
  color: string
  archived: boolean
  memberCount: number
  roomSlug: string
  maxMembers: number
  members: AdminGroupMember[]
}

export type PersonResult = {
  userId: Id<'users'>
  name: string
  email: string | null
  imageUrl: string | null
  tag: string | null
  isLearnMember: boolean
  inGroup: boolean
}

export type MyGroup = {
  id: Id<'learnGroups'>
  name: string
  description: string | null
  color: string
  memberCount: number
  role: GroupRole
  roomSlug: string
  postCount: number
  lastActivityAt: number | null
}

export const groupsListRef = makeFunctionReference<'query', Record<string, never>, AdminGroupRow[]>('learnGroups:adminList')
export const groupRef = makeFunctionReference<'query', { groupId: Id<'learnGroups'> }, AdminGroup | null>('learnGroups:adminGroup')
export const groupCreateRef = makeFunctionReference<'mutation', { name: string; description?: string; color?: GroupColor }, Id<'learnGroups'>>(
  'learnGroups:adminCreate'
)
export const groupUpdateRef = makeFunctionReference<
  'mutation',
  { groupId: Id<'learnGroups'>; name?: string; description?: string; color?: GroupColor },
  null
>('learnGroups:adminUpdate')
export const groupArchiveRef = makeFunctionReference<'mutation', { groupId: Id<'learnGroups'>; archived: boolean }, null>(
  'learnGroups:adminSetArchived'
)
export const groupSearchRef = makeFunctionReference<'query', { q: string; groupId?: Id<'learnGroups'> }, PersonResult[]>(
  'learnGroups:adminSearchPeople'
)
export const groupAddRef = makeFunctionReference<
  'mutation',
  { groupId: Id<'learnGroups'>; userIds: Id<'users'>[]; role?: GroupRole },
  { added: number; skipped: string[] }
>('learnGroups:adminAddMembers')
export const groupRemoveRef = makeFunctionReference<'mutation', { groupId: Id<'learnGroups'>; userId: Id<'users'> }, null>(
  'learnGroups:adminRemoveMember'
)
export const groupSetRoleRef = makeFunctionReference<'mutation', { groupId: Id<'learnGroups'>; userId: Id<'users'>; role: GroupRole }, null>(
  'learnGroups:adminSetMemberRole'
)
export const myGroupsRef = makeFunctionReference<'query', Record<string, never>, MyGroup[]>('learnGroups:myGroups')
