'use client'

import type { ReactNode } from 'react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { listCarePlanTemplates } from '@/convex/physioCare'
import type { QueryResult } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'

/**
 * The generated api types sit at TypeScript's depth limit, so the workspace drawers read their
 * Convex functions untyped; results are cast to the type of the function they came from.
 */
const root = api as unknown as Record<string, Record<string, unknown>>
export const workspaceApi = {
  physioCare: root.physioCare,
  billing: root.billing,
  physioBilling: root.physioBilling,
  users: root.users,
}

export type CarePlanTemplate = QueryResult<typeof listCarePlanTemplates>[number]

export type EpisodeSource =
  | 'referred'
  | 'existing_patient'
  | 'marketplace'
  | 'booking_link'
  | 'clinic'
  | 'invite'
  | 'joy_whatsapp'
  | 'other'

export type Outcome = 'goals_met' | 'partially_met' | 'not_met' | 'referred_on' | 'stopped_attending'

export type Goal = { description: string; targetValue: string; timeline: string; measurable: boolean; achieved?: boolean }

export type CheckIn = {
  _id: Id<'patientCheckIns'>
  painScore: number
  functionScore?: number
  mood?: 'great' | 'good' | 'okay' | 'low'
  exercisesDone: 'all' | 'some' | 'none'
  note?: string
  flagged: boolean
  flagReason?: string
  reviewedAt?: number
  createdAt: number
}

/** One home-programme log (the patient did an exercise), as getPatientWorkspace returns it. */
export type ExerciseLog = {
  _id: Id<'exerciseProgramLogs'>
  programTitle: string
  exerciseName: string
  painScore: number | null
  difficulty: 'easy' | 'ok' | 'hard' | null
  note: string | null
  source: 'app' | 'link'
  createdAt: number
  reviewedAt: number | null
}

export const DIFFICULTY_LABELS: Record<'easy' | 'ok' | 'hard', string> = { easy: 'Easy', ok: 'Just right', hard: 'Hard' }

/** Pain at or above this in a check-in or exercise log needs the physio's attention (as on the server). */
export const HIGH_PAIN = 7

/** Shape returned by api.physioCare.getPatientWorkspace. */
export type Workspace = {
  patient: {
    _id: Id<'users'>
    firstName?: string
    lastName?: string
    email?: string
    phoneNumber?: string
    imageUrl?: string
    patientNumber?: string
  }
  profile: {
    dateOfBirth?: string
    gender?: string
    /** patientProfiles.medicalHistorySummary (free text) */
    medicalHistory: string | null
    city: string | null
    emergencyContact: { name: string; relationship: string; phone: string } | null
  } | null
  relationship: { status: string; startDate: number; endDate?: number; source?: string; referredBy?: string }
  episode: {
    _id?: Id<'careEpisodes'>
    status: 'active' | 'completed' | 'cancelled'
    source: EpisodeSource
    referredBy?: string
    condition?: string
    startedAt: number
    completedAt?: number
    plannedSessions?: number
    outcome?: Outcome
    dischargeSummary?: string
    homeAdvice?: string
    synthetic: boolean
  }
  pastEpisodes: { _id: Id<'careEpisodes'>; startedAt: number; completedAt?: number; outcome?: Outcome; condition?: string }[]
  plan: {
    _id: Id<'treatmentPlans'>
    title: string
    description?: string
    status: string
    goals: Goal[]
    sessionFrequency?: string
    plannedSessions?: number
    reviewDate?: number
    precautions?: string
    changeReason?: string
    version: number
    updatedAt: number
    totalExercises: number
    goalsAchieved: number
  } | null
  sessions: { completed: number; planned: number | null; last: { startTime: number; serviceType: string } | null }
  nextAppointment: {
    _id: Id<'appointments'>
    startTime: number
    endTime: number
    serviceType: string
    status: string
    isOnline?: boolean
  } | null
  adherence: {
    completed: number
    expected: number
    rate: number
    /** Where the target comes from: home programmes, the older care-plan exercises, or both */
    source: 'programme' | 'care_plan' | 'both'
    lastLoggedAt: number | null
  } | null
  checkIns: CheckIn[]
  /** Latest home-programme logs, newest first */
  exerciseLogs: ExerciseLog[]
  notesCount: number
  lastNoteAt: number | null
  payments: { unpaidCount: number; unpaidKobo: number; paidKobo: number }
  followUp: {
    status: string
    dueAt?: number
    rating?: number
    recovery?: string
    comment?: string
    respondedAt?: number
  } | null
}

export const SOURCE_LABELS: Record<EpisodeSource, string> = {
  referred: 'Referred',
  existing_patient: 'Existing patient',
  marketplace: 'Marketplace',
  booking_link: 'Booking link',
  clinic: 'Clinic',
  invite: 'Invited',
  joy_whatsapp: 'Joy · WhatsApp',
  other: 'Other',
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  goals_met: 'Goals met',
  partially_met: 'Goals partly met',
  not_met: 'Goals not met',
  referred_on: 'Referred on',
  stopped_attending: 'Stopped attending',
}

export const RECOVERY_LABELS: Record<string, string> = {
  fully_recovered: 'Fully recovered',
  much_better: 'Much better',
  a_little_better: 'A little better',
  no_change: 'No change',
  worse: 'Worse',
}

export const MOOD_LABELS = { great: 'Great', good: 'Good', okay: 'Okay', low: 'Low' } as const
export const EXERCISES_LABELS = { all: 'Did all exercises', some: 'Did some exercises', none: 'Skipped exercises' } as const

export function fullName(person?: { firstName?: string; lastName?: string } | null) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Patient'
}

/** Pain scores: green when low, plain in the middle, rose when high. No gold. */
export function painTone(score: number) {
  if (score >= 7) return 'bg-pt-rose-bg text-pt-rose-fg'
  if (score >= 4) return 'bg-pt-neutral-bg text-pt-ink'
  return 'bg-pt-green-bg text-pt-green-fg'
}

export function PainPill({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', painTone(score), className)}>
      Pain {score}/10
    </span>
  )
}

export function Meter({ value, max, className, tone = 'teal' }: { value: number; max: number; className?: string; tone?: 'teal' | 'low' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-pt-sunken', className)} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          tone === 'low' ? 'bg-pt-rose-fg' : 'bg-pt-accent'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Label + value pair used across workspace cards. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-pt-ink">{children}</dd>
    </div>
  )
}
