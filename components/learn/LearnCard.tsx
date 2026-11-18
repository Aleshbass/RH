'use client'

/**
 * Rehabify Learn from the physio and clinic dashboards (learn.physioaroundme.com, same account).
 * Knows where the physio is: the course to carry on with, their group and points this month, or
 * an invitation to start. Opens Learn in a new tab so the dashboard stays where it was.
 */

import { useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { ArrowUpRight, GraduationCap } from '@/components/icons'
import { learnUrl } from '@/lib/site-hosts'
import { cn } from '@/lib/utils'

type LearnCardData = {
  resume: { courseId: string; title: string; completed: number; total: number } | null
  group: { name: string; color: string | null } | null
  monthPoints: number
  totalPoints: number
  started: boolean
} | null

// By name: the generated api type is at TypeScript's depth limit (TS2589)
const learnCardRef = makeFunctionReference<'query', Record<string, never>, LearnCardData>('learn:getDashboardLearnCard')

/** Rehabify Learn as a row in the physio menu's Learn group (opens Learn in a new tab). */
export function LearnNavRow({ onNavigate }: { onNavigate?: () => void }) {
  const data = useQuery(learnCardRef, {})
  if (data === undefined) return null
  const resume = data?.resume ?? null
  return (
    <a
      href={resume ? learnUrl(`/courses/${resume.courseId}`) : learnUrl()}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      title={resume ? `Carry on: ${resume.title}` : 'Courses, cases and the physio community'}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50"
    >
      <GraduationCap className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{resume ? 'Carry on learning' : 'Rehabify Learn'}</span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-pt-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  )
}

export function LearnCard({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const data = useQuery(learnCardRef, {})
  if (data === undefined) return null

  const resume = data?.resume ?? null
  const href = resume ? learnUrl(`/courses/${resume.courseId}`) : learnUrl()
  const title = resume ? 'Carry on learning' : 'Rehabify Learn'
  const line = resume
    ? `${resume.title} · ${resume.completed} of ${resume.total} lessons`
    : data?.group
      ? `${data.group.name}${data.monthPoints ? ` · ${data.monthPoints} points this month` : ''}`
      : data?.started
        ? `${data.totalPoints} points so far`
        : 'Courses, cases and the physio community'

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      className={cn('group flex items-center gap-3 rounded-2xl bg-pt-sunken p-3.5 transition-colors hover:bg-pt-hover', className)}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-surface text-pt-ink shadow-sm">
        <GraduationCap className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-pt-ink">{title}</span>
        <span className="block truncate text-xs text-pt-muted">{line}</span>
        {resume && resume.total > 0 && (
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-pt-line" aria-hidden>
            <span className="block h-full rounded-full bg-pt-accent" style={{ width: `${Math.round((resume.completed / resume.total) * 100)}%` }} />
          </span>
        )}
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-pt-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  )
}
