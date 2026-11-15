/**
 * Rehabify Learn points, badges and the monthly leaderboard (owner 2026-11-12/14).
 * One place for what earns points, how many, the daily caps, and the badges. Used by
 * convex/learnPoints.ts (awards) and the Learn pages (progress, leaderboard). Change values here.
 *
 * Prizes for the monthly top learners are agreed directly with winners, only if and when approved:
 * nothing here (or on any page) mentions them.
 */

export type LearnEarnReason =
  | 'lesson'
  | 'course'
  | 'sim_finish'
  | 'sim_pass'
  | 'post'
  | 'reply'
  | 'helpful'
  | 'space_host'
  | 'space_speak'
  | 'space_listen'
  | 'assessment'
  | 'certificate'
  | 'streak'

export const LEARN_EARN: Record<LearnEarnReason, { points: number; dailyCap: number; label: string }> = {
  lesson: { points: 10, dailyCap: 200, label: 'Finished a lesson' },
  course: { points: 100, dailyCap: 500, label: 'Finished a course' },
  sim_finish: { points: 15, dailyCap: 150, label: 'Finished a simulation case' },
  sim_pass: { points: 50, dailyCap: 500, label: 'Passed a simulation case' },
  post: { points: 5, dailyCap: 15, label: 'Started a community post' },
  reply: { points: 5, dailyCap: 50, label: 'Replied in the community' },
  helpful: { points: 10, dailyCap: 100, label: 'Someone found your post helpful' },
  space_host: { points: 30, dailyCap: 60, label: 'Hosted a Space' },
  space_speak: { points: 15, dailyCap: 45, label: 'Spoke in a Space' },
  space_listen: { points: 5, dailyCap: 15, label: 'Joined a Space' },
  assessment: { points: 150, dailyCap: 150, label: 'Passed a final assessment' },
  certificate: { points: 200, dailyCap: 400, label: 'Earned a certificate' },
  streak: { points: 25, dailyCap: 25, label: '7 days of learning in a row' },
}

export type LearnBadgeId =
  | 'first-step'
  | 'course-finisher'
  | 'case-cracker'
  | 'red-flag-hunter'
  | 'ice-breaker'
  | 'helping-hand'
  | 'on-stage'
  | 'streak-7'
  | 'certified'
  | 'club-1000'
  | 'top-10'

/** `count`: the running count on the learner's account that unlocks it (see convex/learnPoints.ts). */
export const LEARN_BADGES: { id: LearnBadgeId; name: string; how: string; count?: { key: LearnCountKey; atLeast: number } }[] = [
  { id: 'first-step', name: 'First step', how: 'Finish your first lesson', count: { key: 'lesson', atLeast: 1 } },
  { id: 'course-finisher', name: 'Course finisher', how: 'Finish a whole course', count: { key: 'course', atLeast: 1 } },
  { id: 'case-cracker', name: 'Case cracker', how: 'Pass a simulation case', count: { key: 'sim_pass', atLeast: 1 } },
  { id: 'red-flag-hunter', name: 'Red-flag hunter', how: 'Pass 3 different simulation cases', count: { key: 'sim_pass', atLeast: 3 } },
  { id: 'ice-breaker', name: 'Ice breaker', how: 'Start your first community post', count: { key: 'post', atLeast: 1 } },
  { id: 'helping-hand', name: 'Helping hand', how: 'Get 5 helpful marks from other learners', count: { key: 'helpful', atLeast: 5 } },
  { id: 'on-stage', name: 'On stage', how: 'Speak or host in a Space', count: { key: 'stage', atLeast: 1 } },
  { id: 'streak-7', name: '7-day streak', how: 'Learn 7 days in a row', count: { key: 'bestStreak', atLeast: 7 } },
  { id: 'certified', name: 'Certified', how: 'Earn a certificate', count: { key: 'certificate', atLeast: 1 } },
  { id: 'club-1000', name: '1,000 club', how: 'Earn 1,000 points', count: { key: 'total', atLeast: 1000 } },
  { id: 'top-10', name: 'Top 10', how: 'Finish a month in the top 10' },
]

export type LearnCountKey = 'lesson' | 'course' | 'sim_pass' | 'post' | 'helpful' | 'stage' | 'certificate' | 'bestStreak' | 'total'

/** Which running count each earn reason adds to (the badge rules read these). */
export const COUNT_FOR: Partial<Record<LearnEarnReason, LearnCountKey>> = {
  lesson: 'lesson',
  course: 'course',
  sim_pass: 'sim_pass',
  post: 'post',
  helpful: 'helpful',
  space_host: 'stage',
  space_speak: 'stage',
  certificate: 'certificate',
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000

/** "2026-11" in Lagos time: the leaderboard month. */
export const lagosMonth = (ms: number) => new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 7)
/** "2026-11-14" in Lagos time: a learning day (streaks). */
export const lagosDay = (ms: number) => new Date(ms + LAGOS_OFFSET_MS).toISOString().slice(0, 10)
/** The Lagos day before `day` ("YYYY-MM-DD"). */
export const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
/** The month before `month` ("YYYY-MM"). */
export const monthBefore = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
/** "November 2026" */
export const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
