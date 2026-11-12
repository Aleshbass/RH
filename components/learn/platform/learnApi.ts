/**
 * Rehabify Learn platform: Convex references and small helpers shared by the Learn shell,
 * home, catalogue and welcome step. Plain references because the generated `api` type is at
 * TypeScript's depth limit (TS2589).
 */

import { makeFunctionReference } from 'convex/server'
import type { LearnerIdentity } from '@/convex/learn'
import type { LearnerKind } from '@/lib/learn/catalog'
import { LEARN_URL } from '@/lib/site-hosts'
import { publicAppUrl } from '@/lib/public-app-url'

export type { LearnerIdentity }
export type SignedInLearner = Extract<LearnerIdentity, { signedIn: true }>

export const learnPlatformApi = {
  identity: makeFunctionReference<'query', Record<string, never>, LearnerIdentity>('learn:getLearnerIdentity'),
  saveProfile: makeFunctionReference<
    'mutation',
    { kind: LearnerKind; school?: string; studentLevel?: string; graduationYear?: number; profession?: string },
    string
  >('learn:saveLearnerProfile'),
}

/**
 * A Learn page's path. With NEXT_PUBLIC_LEARN_URL set (production) every Learn page is served on
 * learn.* (the main site 308s /learn there), where the middleware maps /x to /learn/x, so links
 * stay short. Without it (local, previews) Learn lives under /learn on the main site.
 */
export const learnPath = (path = '') => (LEARN_URL ? path || '/' : `/learn${path}`)

export const MSK_PROGRAM_PATH = learnPath('/programs/msk-specialist')
export const WELCOME_PATH = learnPath('/welcome')
export const MY_LEARNING_PATH = learnPath('/courses/my')

/** Sign-in / sign-up on Learn: back to `returnTo` (or the welcome step for a new account). */
export function learnSignInHref(returnTo = learnPath()) {
  return `/sign-in?redirect=${encodeURIComponent(returnTo)}`
}
export function learnSignUpHref(returnTo = WELCOME_PATH) {
  return `/sign-up?redirect=${encodeURIComponent(returnTo)}`
}

/**
 * A main-site page (dashboards, role-selection). Learn is on its own host in production, and the
 * Clerk session is shared across physioaroundme.com subdomains, so the person stays signed in.
 */
export function mainSiteUrl(path: string) {
  return LEARN_URL ? `${publicAppUrl()}${path}` : path
}
