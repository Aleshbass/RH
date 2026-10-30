'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { ArrowRight, HeartPulse, Quote } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Panel, PatientDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { MOMENT_LABEL, MOMENT_QUESTIONS, type OutcomeMoment } from '@/lib/outcomes/moments'
import { cn } from '@/lib/utils'
import { CheckDone, CheckFlow } from './CheckFlow'
import { ChangeTile } from './OutcomesCard'
import { PainTrend } from './PainTrend'
import { outcomeRefs, type MyProgress } from './refs'

type Course = NonNullable<MyProgress>['courses'][number]
type Waiting = Course['waiting'][number]

/**
 * The top of the patient's Progress page: pain from the start of each course of care to now,
 * anything their physio is waiting to hear, and their choice about sharing their words.
 */
export function PatientProgressSection() {
  const data = useQuery(outcomeRefs.myProgress, {})
  const [answering, setAnswering] = useState<{ waiting: Waiting; course: Course } | null>(null)

  if (!data || data.courses.length === 0) return null
  const waiting = data.courses.flatMap((course) => course.waiting.map((w) => ({ waiting: w, course })))

  return (
    <div className="space-y-5">
      {waiting.map(({ waiting: w, course }) => (
        <div key={w.checkId} className="flex flex-col gap-3 rounded-3xl bg-pt-primary p-5 text-pt-on-primary sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-semibold">{course.physioName} asked how you are</p>
            <p className="mt-0.5 text-sm opacity-75">
              {MOMENT_LABEL[w.moment]} · {formatDistanceToNow(w.sentAt, { addSuffix: true })} · under a minute
            </p>
          </div>
          <Button className="h-11 rounded-xl bg-pt-accent px-5 font-semibold text-[#06210a] hover:bg-[#00b80e]" onClick={() => setAnswering({ waiting: w, course })}>
            Answer now
          </Button>
        </div>
      ))}

      {data.courses.map((course) => (
        <CourseCard key={course.episodeId} course={course} />
      ))}

      <AnswerDrawer target={answering} onClose={() => setAnswering(null)} firstName={data.firstName} />
    </div>
  )
}

function CourseCard({ course }: { course: Course }) {
  const revoke = useMutation(outcomeRefs.revokeShare)
  const pain = course.pain
  return (
    <Panel
      title={course.condition || 'Your recovery'}
      description={`With ${course.physioName} · since ${format(course.startedAt, 'd MMM yyyy')}${course.completedAt ? ` · finished ${format(course.completedAt, 'd MMM')}` : ''}`}
      info="From your answers to the quick questions before and after sessions, your daily check-ins and your final scores."
    >
      <div className="space-y-4 px-5 pb-5 pt-3 sm:px-6">
        {pain ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ChangeTile label="Pain (0–10)" from={pain.baseline} to={pain.latest} />
            {course.weekly.length > 1 && (
              <div className="rounded-3xl border border-pt-line p-4">
                <p className="mb-1 text-sm font-semibold text-pt-ink">Pain by week</p>
                <PainTrend points={course.weekly} />
              </div>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-pt-muted">
            <HeartPulse className="h-4 w-4" />
            Your progress shows here after your first answers.
          </p>
        )}

        {course.sessions.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-pt-muted">Before → after your recent sessions</p>
            <div className="flex flex-wrap gap-2">
              {course.sessions.map((s) => (
                <span key={s.appointmentId} className="inline-flex items-center gap-1.5 rounded-full bg-pt-sunken px-3 py-1 text-xs font-semibold tabular-nums text-pt-ink">
                  {format(s.at, 'd MMM')} · {s.before}
                  <ArrowRight className="h-3 w-3 text-pt-faint" />
                  {s.after}
                </span>
              ))}
            </div>
          </div>
        )}

        {course.shared?.feedback && (
          <div className="rounded-2xl bg-pt-sunken/60 p-4">
            <p className="flex gap-2 text-sm leading-relaxed text-pt-ink">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pt-faint" />
              {course.shared.feedback}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-pt-muted">
                {course.shared.consented ? 'You agreed your words can be shared, with your first name and area only.' : 'Only your physio sees this.'}
              </p>
              {course.shared.consented && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(secondaryButtonClass, 'h-8 text-xs')}
                  onClick={() =>
                    void revoke({ checkId: course.shared!.checkId }).then(
                      () => toast.success('Done. Your words won’t be shared from now on.'),
                      () => toast.error('Couldn’t change that. Try again.')
                    )
                  }
                >
                  Stop sharing
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}

function AnswerDrawer({
  target,
  onClose,
  firstName,
}: {
  target: { waiting: Waiting; course: Course } | null
  onClose: () => void
  firstName: string | null
}) {
  const answer = useMutation(outcomeRefs.answerMine)
  const [result, setResult] = useState<{ baseline: number | null; pain: number } | null>(null)
  const moment: OutcomeMoment = target?.waiting.moment ?? 'check_in'

  return (
    <PatientDrawer
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
          setResult(null)
        }
      }}
      title={result ? 'Sent' : `For ${target?.course.physioName ?? 'your physio'}`}
      footer={
        result ? (
          <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => { onClose(); setResult(null) }}>
            Done
          </Button>
        ) : undefined
      }
    >
      {target &&
        (result ? (
          <CheckDone firstName={firstName} result={result} physioName={target.course.physioName} />
        ) : (
          <CheckFlow
            key={target.waiting.checkId}
            moment={moment}
            questions={MOMENT_QUESTIONS[moment]}
            physioName={target.course.physioName}
            goalActivity={null}
            onSubmit={(answers) => answer({ checkId: target.waiting.checkId, answers })}
            onDone={setResult}
          />
        ))}
    </PatientDrawer>
  )
}
