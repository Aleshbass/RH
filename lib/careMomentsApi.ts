import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { CareMomentKind } from '@/convex/helpers/careMoments'

export type CareMomentSettings = {
  autoBirthday: boolean
  birthdayMessage: string | null
  includePastPatients: boolean
  anniversaries: boolean
  dischargeCheckins: boolean
}

export type CareMomentItem = {
  _id: Id<'careMoments'>
  kind: CareMomentKind
  date: string
  years: number | null
  status: 'upcoming' | 'sent' | 'called' | 'skipped'
  autoSent: boolean
  /** The patient, or the team member (team_birthday) */
  personId: Id<'users'>
  name: string
  firstName: string | null
  imageUrl: string | null
  whatsappPhone: string | null
  clinicianName: string | null
  sender: string
  message: string
}

export type CareMoments = {
  today: string
  items: CareMomentItem[]
  settings: CareMomentSettings
  canEditSettings: boolean
  patientCount: number | null
  missingBirthdayCount: number | null
} | null

export type MyBirthday = {
  /** Patients are celebrated by their care team; physios, clinic owners and teams by Rehabify */
  audience: 'patient' | 'team'
  monthDay: string | null
  birthYear: number | null
  optedOut: boolean
  celebratedBy: string | null
} | null

type Scope = { scope: 'clinic' | 'physio' }

/** Plain references to convex/careMoments.ts: the generated `api` type is at TypeScript's depth limit (TS2589). */
export const careMomentsApi = {
  moments: makeFunctionReference<'query', Scope, CareMoments>('careMoments:getMyMoments'),
  send: makeFunctionReference<'mutation', { momentId: Id<'careMoments'>; message: string }, { success: boolean }>(
    'careMoments:sendCareMoment'
  ),
  mark: makeFunctionReference<
    'mutation',
    { momentId: Id<'careMoments'>; status: 'called' | 'skipped' | 'upcoming' },
    { success: boolean }
  >('careMoments:markCareMoment'),
  saveSettings: makeFunctionReference<
    'mutation',
    Scope & Omit<CareMomentSettings, 'birthdayMessage'> & { birthdayMessage?: string },
    { success: boolean }
  >('careMoments:saveCareMomentSettings'),
  myBirthday: makeFunctionReference<'query', Record<string, never>, MyBirthday>('careMoments:getMyBirthday'),
  setMyBirthday: makeFunctionReference<'mutation', { month: number; day: number; year?: number }, { success: boolean }>(
    'careMoments:setMyBirthday'
  ),
  setOptOut: makeFunctionReference<'mutation', { optOut: boolean }, { success: boolean }>('careMoments:setMyCelebrationsOptOut'),
}
