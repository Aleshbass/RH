import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { MyProgram } from '@/components/exercise-programs/types'

/**
 * What a patient has to do today across both exercise systems: the treatment plan's exercises
 * (ticked off into exerciseCompletions) and home programmes (logged into exerciseProgramLogs).
 * Kept apart from the care plan page so Home can count without loading the 3D player.
 */

/** One exercise in a plan phase (treatmentPlans.phases[].exercises[]), plus library details. */
export type PlanExercise = {
  exerciseId: string
  name?: string
  libraryName?: string
  instructions?: string
  libraryInstructions?: string | string[]
  sets: number
  reps: number
  duration?: string
  frequency: string
  notes?: string
  videoUrl?: string
  youtubeId?: string
}

export type PlanPhase = { name: string; description: string; duration: string; order: number; exercises: PlanExercise[] }
export type PlanGoal = { description: string; targetValue: string; timeline: string; measurable: boolean; achieved?: boolean }

/** treatmentPlans row as the patient queries return it (the fields used here) */
export type Plan = {
  _id: string
  title: string
  description?: string
  status: string
  startDate: number
  endDate?: number
  goals: PlanGoal[]
  phases: PlanPhase[]
  sessionFrequency?: string
  plannedSessions?: number
  reviewDate?: number
  precautions?: string
  physiotherapist?: { firstName?: string; lastName?: string } | null
}

/** An exercise with the stage it belongs to (completions are keyed by both). */
export type Exercise = PlanExercise & { phaseOrder: number; phaseName: string }

export function flatten(plan: Plan): Exercise[] {
  return (plan.phases ?? []).flatMap((phase) =>
    (phase.exercises ?? []).map((exercise) => ({ ...exercise, phaseOrder: phase.order ?? 0, phaseName: phase.name }))
  )
}

/** Exercises with a daily-type frequency (or none) are today's; if none are, all of them. */
export function todaysExercises(all: Exercise[]) {
  const daily = all.filter((exercise) => {
    const freq = (exercise.frequency ?? '').toLowerCase()
    return !freq || freq.includes('daily') || freq.includes('day') || freq.includes('today')
  })
  return daily.length > 0 ? daily : all
}

export const keyOf = (exercise: Exercise) => `${exercise.phaseOrder}-${exercise.exerciseId}`

/**
 * Exercises (not education) in programmes the patient can log, and how many are logged today.
 * A programme waiting for Flex can't be logged, so it isn't counted.
 */
export function programmeTotals(programs: MyProgram[]) {
  let done = 0
  let total = 0
  for (const program of programs) {
    if (program.plan?.locked) continue
    const loggedToday = new Set(program.doneToday)
    for (const item of program.items) {
      if (item.kind === 'education') continue
      total += 1
      if (loggedToday.has(item.index)) done += 1
    }
  }
  return { done, total }
}

/** Programmes sent with the given treatment plan first, then the rest, each newest first as listMine returns them. */
export function orderProgrammes(programs: MyProgram[], planId?: string | null) {
  if (!planId) return programs
  const linked = (program: MyProgram) => Boolean(program.treatmentPlanId) && program.treatmentPlanId === planId
  return [...programs.filter(linked), ...programs.filter((program) => !linked(program))]
}

export type TodayCarePlan = {
  hasPlan: boolean
  programmeCount: number
  done: number
  total: number
}

/** Today's exercise counts for the signed-in patient; `undefined` while loading. */
export function useTodayCarePlan(enabled = true): TodayCarePlan | undefined {
  const plan = useQuery(api.treatmentPlans.getPatientActivePlan, enabled ? {} : 'skip') as Plan | null | undefined
  const completionMap = useQuery(
    api.treatmentPlans.getExerciseCompletionMap,
    enabled && plan?._id ? { treatmentPlanId: plan._id as Id<'treatmentPlans'> } : 'skip'
  ) as Record<string, boolean> | undefined
  const programs = useQuery(api.exercisePrograms.listMine, enabled ? {} : 'skip') as MyProgram[] | null | undefined

  if (!enabled || plan === undefined || programs === undefined) return undefined
  const today = plan ? todaysExercises(flatten(plan)) : []
  const planDone = today.filter((exercise) => Boolean(completionMap?.[keyOf(exercise)])).length
  const programmes = programmeTotals(programs ?? [])
  return {
    hasPlan: Boolean(plan),
    programmeCount: (programs ?? []).length,
    done: planDone + programmes.done,
    total: today.length + programmes.total,
  }
}
