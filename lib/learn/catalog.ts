/**
 * Rehabify Learn catalogue vocabulary, shared by Convex (convex/learn.ts) and the Learn pages.
 * Plain data only: Convex imports this file, so it must not import React or Next.
 */

export const COURSE_CATEGORIES = [
  { id: 'msk', label: 'MSK & orthopaedics', short: 'MSK' },
  { id: 'spine', label: 'Spine & back pain', short: 'Spine' },
  { id: 'sports', label: 'Sports & exercise', short: 'Sports' },
  { id: 'neuro', label: 'Neurological rehab', short: 'Neuro' },
  { id: 'cardio', label: 'Cardiorespiratory', short: 'Cardio' },
  { id: 'paeds', label: 'Paediatrics', short: 'Paeds' },
  { id: 'womens', label: "Women's health", short: "Women's health" },
  { id: 'older', label: 'Older adults', short: 'Older adults' },
  { id: 'practice', label: 'Practice & telehealth', short: 'Practice' },
  { id: 'students', label: 'Student essentials', short: 'Students' },
] as const

export type CourseCategory = (typeof COURSE_CATEGORIES)[number]['id']

export const COURSE_LEVELS = [
  { id: 'all', label: 'All levels' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const

export type CourseLevel = (typeof COURSE_LEVELS)[number]['id']

export function categoryLabel(id: string | null | undefined): string | null {
  return COURSE_CATEGORIES.find((c) => c.id === id)?.label ?? null
}

export function levelLabel(id: string | null | undefined): string | null {
  return COURSE_LEVELS.find((l) => l.id === id)?.label ?? null
}

export function isCourseCategory(id: string | null | undefined): id is CourseCategory {
  return COURSE_CATEGORIES.some((c) => c.id === id)
}

export function isCourseLevel(id: string | null | undefined): id is CourseLevel {
  return COURSE_LEVELS.some((l) => l.id === id)
}

/** Who a learner says they are on Learn (learnProfiles.kind). Platform roles come from users.role. */
export const LEARNER_KINDS = ['student', 'physio', 'other'] as const
export type LearnerKind = (typeof LEARNER_KINDS)[number]

/** Student year. Physiotherapy in Nigeria is a 5-year degree, then a one-year internship. */
export const STUDENT_LEVELS = ['100 level', '200 level', '300 level', '400 level', '500 level', 'Internship'] as const

/** Suggestions for the school field; learners can type any school. */
export const PHYSIO_SCHOOLS = [
  'University of Lagos',
  'University of Ibadan',
  'Obafemi Awolowo University',
  'University of Nigeria, Nsukka',
  'University of Benin',
  'Bayero University Kano',
  'University of Maiduguri',
  'Nnamdi Azikiwe University',
  'University of Medical Sciences, Ondo',
  'Bowen University',
  'Madonna University',
] as const

/** The identity tag a signed-in learner carries on Learn (avatar menu, course prices, community). */
export type LearnerTagKind =
  | 'team'
  | 'rehabify_physio'
  | 'physio_pending'
  | 'clinic_owner'
  | 'clinic_team'
  | 'student'
  | 'physio'
  | 'doctor'
  | 'learner'
