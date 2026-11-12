/**
 * Typed references to convex/teamAccess.ts (blog writer and Learn instructor access by email or
 * WhatsApp number). Plain references, because the generated `api` type sits at TypeScript's depth
 * limit (TS2589).
 */
import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'

export type TeamRole = 'blog_editor' | 'learn_instructor'

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = { blog_editor: 'Blog writer', learn_instructor: 'Learn instructor' }

/** Where each role starts in the admin console. */
export const TEAM_ROLE_HOME: Record<TeamRole, string> = { blog_editor: '/dashboard/admin/blog', learn_instructor: '/dashboard/admin/learn/courses' }

export type TeamMember = {
  userId: Id<'users'>
  name: string
  email: string | null
  phone: string | null
  role: TeamRole
  since: number | null
  previousRole: string | null
}

export type TeamInvite = {
  inviteId: Id<'teamInvites'>
  email: string | null
  phone: string | null
  role: TeamRole
  invitedBy: string
  createdAt: number
  emailedAt: number | null
  linkExpired: boolean
}

export type GrantResult = {
  status: 'granted' | 'invited' | 'already' | 'confirm'
  name?: string
  currentRole?: string
  channel?: 'email' | 'phone'
  phone?: string
  link?: string
}

export type InvitePreview =
  | { state: 'invalid' }
  | { state: 'expired' }
  | { state: 'accepted'; role: TeamRole; roleLabel: string }
  | { state: 'ok'; role: TeamRole; roleLabel: string; invitedBy: string }

export const teamAccessApi = {
  list: makeFunctionReference<'query', Record<string, never>, { members: TeamMember[]; pending: TeamInvite[] }>('teamAccess:adminTeamAccess'),
  grant: makeFunctionReference<'mutation', { contact: string; role: TeamRole; confirm?: boolean }, GrantResult>('teamAccess:adminGrantTeamRole'),
  inviteLink: makeFunctionReference<'mutation', { inviteId: Id<'teamInvites'>; email?: boolean }, { link: string; phone: string | null; role: TeamRole }>(
    'teamAccess:adminInviteLink'
  ),
  remove: makeFunctionReference<'mutation', { inviteId?: Id<'teamInvites'>; userId?: Id<'users'> }, { restoredRole: string | null } | null>(
    'teamAccess:adminRemoveTeamAccess'
  ),
  preview: makeFunctionReference<'query', { code: string }, InvitePreview>('teamAccess:teamInvitePreview'),
  accept: makeFunctionReference<
    'mutation',
    { code: string; confirm?: boolean },
    { status: 'accepted' | 'confirm' | 'not_ready'; home?: string; currentRole?: string }
  >('teamAccess:acceptTeamInvite'),
  intro: makeFunctionReference<'query', Record<string, never>, { show: boolean }>('teamAccess:accessIntro'),
  dismissIntro: makeFunctionReference<'mutation', Record<string, never>, null>('teamAccess:dismissAccessIntro'),
}

/** The invite as a WhatsApp message to that number, ready to send from the admin's own WhatsApp. */
export function whatsappInviteUrl(phone: string, link: string, role: TeamRole) {
  const what = role === 'blog_editor' ? 'write articles for the Rehabify blog' : 'build video courses on Rehabify Learn'
  const text = [
    `Hi! You're invited to ${what}.`,
    `Open this link, then sign in or create your Rehabify account: ${link}`,
    'The link works once and expires in 14 days.',
  ].join('\n\n')
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

/** "+2348031234567" as "+234 803 123 4567". */
export function formatPhone(phone: string) {
  const m = phone.match(/^\+234(\d{3})(\d{3})(\d{4})$/)
  return m ? `+234 ${m[1]} ${m[2]} ${m[3]}` : phone
}
