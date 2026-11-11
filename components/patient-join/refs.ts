import { makeFunctionReference } from 'convex/server'

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)

export type JoinStatus = 'not_invited' | 'invited' | 'joined' | 'programme_started'
export type PatientJoinState = { status: JoinStatus; canSendLink: boolean; sentAt: number | null; openedAt: number | null }

type Sender = { physioName: string | null; physioImageUrl: string | null; clinicName: string | null }

export type JoinPage =
  | { state: 'not_found' }
  | ({ state: 'used' | 'expired' } & Sender)
  | ({
      state: 'ok'
      purpose: 'join' | 'reset'
      access: 'placeholder' | 'pin' | 'rehabify_login' | 'own_account'
      viewer: 'signed_out' | 'this_patient' | 'someone_else'
      patient: { firstName: string; lastName: string; phone: string }
    } & Sender)

export type PhysioLinkPage =
  | { state: 'not_found' }
  | {
      state: 'ok'
      physioName: string
      physioImageUrl: string | null
      clinicName: string | null
      signedIn: { role: string | null; firstName: string | null; alreadyLinked: boolean } | null
    }

/** What a join or sign-in action returns. `ticket: null` means the login is ready but signing in must be done by hand. */
export type JoinResult =
  | { ok: true; ticket: string | null; reason?: string; existing?: boolean }
  | { ok: false; reason: string; message?: string; attemptsLeft?: number; lockedUntil?: number; physioName?: string }

export type PinSignInResult =
  | { ok: true; ticket: string }
  | { ok: false; reason: 'choose'; choices: { loginId: string; firstName: string }[] }
  | { ok: false; reason: string; message?: string; attemptsLeft?: number; lockedUntil?: number }

export type InviteLink =
  | { ok: true; url: string; message: string; whatsappUrl: string; hasPhone: boolean; purpose: 'join' | 'reset'; expiresAt: number }
  | { ok: false; reason: 'own_account' }

type Details = { firstName: string; lastName: string; phone: string; pin: string; accepted: Record<string, string> }

export const joinRefs = {
  getJoinPage: makeFunctionReference<'query', { code: string }, JoinPage>('patientJoin:getJoinPage'),
  markJoinOpened: makeFunctionReference<'mutation', { code: string }, null>('patientJoin:markJoinOpened'),
  completeJoin: makeFunctionReference<'action', Details & { code: string }, JoinResult>('actions/patientJoin:completeJoin'),
  getPhysioLinkPage: makeFunctionReference<'query', { slug: string }, PhysioLinkPage>('patientJoin:getPhysioLinkPage'),
  joinWithPhysioLink: makeFunctionReference<'action', Details & { slug: string; email?: string }, JoinResult>(
    'actions/patientJoin:joinWithPhysioLink'
  ),
  joinPhysioSignedIn: makeFunctionReference<'mutation', { slug: string }, { added: boolean }>('patientJoin:joinPhysioSignedIn'),
  signInWithPin: makeFunctionReference<'action', { phone: string; pin: string; loginId?: string }, PinSignInResult>(
    'actions/patientJoin:signInWithPin'
  ),
  createInviteLink: makeFunctionReference<'action', { patientId: string }, InviteLink>('actions/patientJoin:createInviteLink'),
  markInviteSent: makeFunctionReference<'mutation', { patientId: string }, null>('patientJoin:markInviteSent'),
  getJoinStatus: makeFunctionReference<'query', { patientId: string }, PatientJoinState | null>('patientJoin:getJoinStatus'),
  myPinLogin: makeFunctionReference<'query', Record<string, never>, { phone: string } | null>('patientJoin:myPinLogin'),
  findInMyCareByPhone: makeFunctionReference<
    'query',
    { phone: string },
    { patientId: string; name: string; firstName: string | null; patientNumber: string | null; join: PatientJoinState } | null
  >('patientJoin:findInMyCareByPhone'),
}

/** Set before the first visit to the dashboard after joining: the "add to home screen" prompt opens once. */
export const JUST_JOINED_KEY = 'rh_just_joined'
export const AFTER_JOIN_PATH = '/dashboard/patient?welcome=joined'
