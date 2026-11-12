/**
 * Typed references to convex/teamAccess.ts (blog writer and Learn instructor access by email).
 * Plain references, because the generated `api` type sits at TypeScript's depth limit (TS2589).
 */
import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'

export type TeamRole = 'blog_editor' | 'learn_instructor'

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = { blog_editor: 'Blog writer', learn_instructor: 'Learn instructor' }

export type TeamMember = {
  userId: Id<'users'>
  name: string
  email: string | null
  role: TeamRole
  since: number | null
  previousRole: string | null
}

export type TeamInvite = {
  inviteId: Id<'teamInvites'>
  email: string
  role: TeamRole
  invitedBy: string
  createdAt: number
  emailedAt: number | null
}

export type GrantResult = { status: 'granted' | 'invited' | 'already' | 'confirm'; name?: string; currentRole?: string }

export const teamAccessApi = {
  list: makeFunctionReference<'query', Record<string, never>, { members: TeamMember[]; pending: TeamInvite[] }>('teamAccess:adminTeamAccess'),
  grant: makeFunctionReference<'mutation', { email: string; role: TeamRole; confirm?: boolean }, GrantResult>('teamAccess:adminGrantTeamRole'),
  resend: makeFunctionReference<'mutation', { inviteId: Id<'teamInvites'> }, null>('teamAccess:adminResendTeamInvite'),
  remove: makeFunctionReference<'mutation', { inviteId?: Id<'teamInvites'>; userId?: Id<'users'> }, { restoredRole: string | null } | null>(
    'teamAccess:adminRemoveTeamAccess'
  ),
}
