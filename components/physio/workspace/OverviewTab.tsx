'use client'

import { format, formatDistanceToNow, isPast } from 'date-fns'
import { AlertTriangle, CalendarClock, ClipboardList, HeartPulse, Pencil, ShieldAlert, Star, Video } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { IconChip, Panel, StatusBadge } from '@/components/physio/ui'
import {
  DIFFICULTY_LABELS,
  EXERCISES_LABELS,
  Fact,
  HIGH_PAIN,
  MOOD_LABELS,
  Meter,
  OUTCOME_LABELS,
  PainPill,
  RECOVERY_LABELS,
  SOURCE_LABELS,
  Sparkline,
  type Workspace,
} from './shared'
import { JoyHandoffPanel } from './JoyHandoffPanel'
import { ProgressPanel } from '@/components/physio/notes/ProgressPanel'
import { goalTargets } from '@/convex/helpers/goalMeasures'
import { QuestionnairesPanel } from '@/components/questionnaires/QuestionnairesPanel'

export function OverviewTab({
  workspace,
  onEditEpisode,
  onOpenPlan,
  onSchedule,
}: {
  workspace: Workspace
  onEditEpisode: () => void
  onOpenPlan: () => void
  onSchedule: () => void
}) {
  const { episode, plan, sessions, nextAppointment, checkIns, adherence, followUp, profile } = workspace
  const isActive = episode.status === 'active'
  const latest = checkIns[0]
  // The latest home-exercise log with a pain score or a note, shown beside adherence
  const latestLog = (workspace.exerciseLogs ?? []).find((l) => l.painScore !== null || l.note)
  const painPoints = checkIns.slice(0, 10).map((c) => c.painScore).reverse()
  const planned = sessions.planned ?? undefined
  const reviewOverdue = plan?.reviewDate ? isPast(plan.reviewDate) : false

  return (
    <div className="space-y-5">
      {/* Only for patients who booked through Joy on WhatsApp */}
      <JoyHandoffPanel patientId={workspace.patient._id} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Current care episode */}
        <Panel
          title="Current care"
          info="This course of treatment: what you’re treating, where the patient came from, and sessions so far. When you finish, use Complete care in the … menu."
          actions={
            isActive && (
              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-neutral-500" onClick={onEditEpisode}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )
          }
        >
          <div className="space-y-4 px-5 pb-5 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={isActive ? 'green' : 'neutral'}>{isActive ? 'In treatment' : 'Care completed'}</StatusBadge>
              <StatusBadge tone="teal">
                {SOURCE_LABELS[episode.source]}
                {episode.source === 'referred' && episode.referredBy ? ` · ${episode.referredBy}` : ''}
              </StatusBadge>
            </div>
            <p className="text-[15px] font-semibold leading-snug text-rh-ink dark:text-white">
              {episode.condition || (isActive ? 'Add what you’re treating' : 'Course of care')}
            </p>
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Sessions</span>
                <span className="font-semibold tabular-nums text-rh-ink dark:text-white">
                  {sessions.completed}
                  {planned ? <span className="font-normal text-neutral-400"> of {planned}</span> : ''}
                </span>
              </div>
              {planned ? <Meter value={sessions.completed} max={planned} className="mt-2" /> : null}
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Fact label="Started">{format(episode.startedAt, 'd MMM yyyy')}</Fact>
              {episode.completedAt ? (
                <Fact label="Completed">{format(episode.completedAt, 'd MMM yyyy')}</Fact>
              ) : (
                <Fact label="Last session">{sessions.last ? formatDistanceToNow(sessions.last.startTime, { addSuffix: true }) : 'None yet'}</Fact>
              )}
              {episode.outcome && <Fact label="Outcome">{OUTCOME_LABELS[episode.outcome]}</Fact>}
            </dl>
          </div>
        </Panel>

        {/* Care plan progress */}
        <Panel
          title="Care plan"
          info="Goals, frequency, review date and precautions. The patient sees it in their app. Start a new one from your templates."
          actions={
            <Button variant="ghost" size="sm" className="h-8 rounded-lg text-rh-ink dark:text-rh-lime" onClick={onOpenPlan}>
              {plan ? 'Open plan' : isActive ? 'Create plan' : 'View'}
            </Button>
          }
        >
          {plan ? (
            <div className="space-y-4 px-5 pb-5 pt-3">
              <div>
                <p className="text-[15px] font-semibold leading-snug text-rh-ink dark:text-white">{plan.title}</p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  Version {plan.version} · updated {formatDistanceToNow(plan.updatedAt, { addSuffix: true })}
                </p>
              </div>
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Functional goals</span>
                  <span className="font-semibold tabular-nums text-rh-ink dark:text-white">
                    {plan.goalsAchieved}
                    <span className="font-normal text-neutral-400"> of {plan.goals.length} met</span>
                  </span>
                </div>
                <Meter value={plan.goalsAchieved} max={plan.goals.length} className="mt-2" />
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <Fact label="Frequency">{plan.sessionFrequency || 'Not set'}</Fact>
                <Fact label="Review">
                  {plan.reviewDate ? (
                    <span className={reviewOverdue ? 'font-semibold text-pt-rose-fg' : undefined}>
                      {format(plan.reviewDate, 'd MMM')}
                      {reviewOverdue ? ' · due' : ''}
                    </span>
                  ) : (
                    'Not set'
                  )}
                </Fact>
              </dl>
              {plan.precautions && (
                <div className="flex gap-2.5 rounded-2xl bg-pt-rose-bg p-3 text-sm text-pt-rose-fg">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="line-clamp-3">{plan.precautions}</span>
                </div>
              )}
              {plan.changeReason && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-600 dark:text-neutral-300">Why this version: </span>
                  {plan.changeReason}
                </p>
              )}
            </div>
          ) : (
            <div className="px-5 pb-6 pt-3">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No care plan yet. Set out functional goals, how often you’ll see them, when to review, and any precautions.
              </p>
            </div>
          )}
        </Panel>

        {/* Next appointment */}
        <Panel title="Next appointment" info="The next session booked with this patient. Open Schedule to accept, move or join it.">
          <div className="px-5 pb-5 pt-3">
            {nextAppointment ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <IconChip icon={nextAppointment.isOnline ? Video : CalendarClock} tone="mint" className="h-11 w-11 rounded-2xl" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-rh-ink dark:text-white">{format(nextAppointment.startTime, 'EEEE d MMM')}</p>
                    <p className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
                      {format(nextAppointment.startTime, 'h:mm a')} – {format(nextAppointment.endTime, 'h:mm a')}
                    </p>
                  </div>
                </div>
                <p className="truncate text-sm text-neutral-600 dark:text-neutral-300">
                  {nextAppointment.serviceType}
                  {nextAppointment.isOnline ? ' · Video' : ''}
                </p>
                {nextAppointment.status === 'scheduled' && <StatusBadge tone="blue">Not confirmed yet</StatusBadge>}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">{isActive ? 'Nothing booked yet.' : 'No upcoming sessions.'}</p>
                {isActive && (
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={onSchedule}>
                    Book the next session
                  </Button>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* How they're doing */}
        <Panel
          title="How they’re doing"
          className="lg:col-span-2"
          info="Their latest check-in (pain, mood, exercises) and how much of their home programme they’ve done in the last 7 days."
        >
          <div className="grid gap-5 px-5 pb-5 pt-3 sm:grid-cols-2">
            <div className="space-y-3">
              {latest ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <PainPill score={latest.painScore} />
                    {latest.mood && <StatusBadge>Mood: {MOOD_LABELS[latest.mood]}</StatusBadge>}
                    {latest.flagged && (
                      <StatusBadge tone="red">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        {latest.flagReason ?? 'Flagged'}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    {EXERCISES_LABELS[latest.exercisesDone]}
                    {latest.functionScore !== undefined ? ` · daily activities ${latest.functionScore}/10` : ''}
                  </p>
                  {latest.note && <p className="rounded-2xl bg-rh-canvas p-3 text-sm italic text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-300">“{latest.note}”</p>}
                  <p className="text-xs text-neutral-400">Checked in {formatDistanceToNow(latest.createdAt, { addSuffix: true })}</p>
                  <Sparkline points={painPoints} min={0} max={10} label={`Pain over the last ${painPoints.length} check-ins`} />
                </>
              ) : (
                <div className="flex items-start gap-3">
                  <IconChip icon={HeartPulse} tone="rose" />
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    No check-ins yet. Patients can check in from their Rehabify home screen with their pain, mood and exercises.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-3 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <IconChip icon={ClipboardList} tone="teal" className="h-8 w-8 rounded-lg" />
                <p className="text-sm font-semibold text-rh-ink dark:text-white">Home exercises, last 7 days</p>
              </div>
              {adherence ? (
                <>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-rh-ink dark:text-white">{adherence.rate}%</p>
                  <Meter value={adherence.completed} max={adherence.expected} tone={adherence.rate < 40 ? 'low' : 'teal'} />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {adherence.completed} of {adherence.expected} exercise sessions done (each exercise once a day)
                    {adherence.source === 'care_plan' ? ' · care plan exercises' : ''}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {adherence.lastLoggedAt
                      ? `Last logged ${formatDistanceToNow(adherence.lastLoggedAt, { addSuffix: true })}`
                      : adherence.source !== 'care_plan'
                        ? 'Nothing logged in the last 7 days'
                        : null}
                  </p>
                </>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Send a home exercise programme from the Care plan tab to track this. Each exercise the patient logs counts here.
                </p>
              )}
              {latestLog && (
                <div className="space-y-1 border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {latestLog.painScore !== null && <PainPill score={latestLog.painScore} />}
                    {latestLog.difficulty && <StatusBadge>{DIFFICULTY_LABELS[latestLog.difficulty]}</StatusBadge>}
                    {latestLog.painScore !== null && latestLog.painScore >= HIGH_PAIN && !latestLog.reviewedAt && (
                      <StatusBadge tone="red">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Not reviewed
                      </StatusBadge>
                    )}
                  </div>
                  <p className="truncate text-xs text-neutral-600 dark:text-neutral-300">
                    {latestLog.exerciseName} · {formatDistanceToNow(latestLog.createdAt, { addSuffix: true })}
                  </p>
                  {latestLog.note && <p className="line-clamp-2 text-xs italic text-neutral-600 dark:text-neutral-300">“{latestLog.note}”</p>}
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Background or follow-up */}
        {followUp ? (
          <Panel title="Rehabify follow-up">
            <div className="space-y-3 px-5 pb-5 pt-3">
              {followUp.status === 'responded' || followUp.rating ? (
                <>
                  <div className="flex items-center gap-1" aria-label={`Rated ${followUp.rating} out of 5`}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={i <= (followUp.rating ?? 0) ? 'h-5 w-5 fill-rh-amber text-rh-amber' : 'h-5 w-5 text-neutral-300 dark:text-neutral-600'} />
                    ))}
                  </div>
                  {followUp.recovery && <StatusBadge tone="teal">{RECOVERY_LABELS[followUp.recovery]}</StatusBadge>}
                  {followUp.comment && <p className="text-sm italic text-neutral-600 dark:text-neutral-300">“{followUp.comment}”</p>}
                </>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {followUp.status === 'scheduled' && followUp.dueAt
                    ? `We’ll ask how they’re doing on ${format(followUp.dueAt, 'd MMM')}.`
                    : 'We’ve asked how they’re doing and are waiting for their answer.'}
                </p>
              )}
            </div>
          </Panel>
        ) : (
          <Panel title="Background">
            <dl className="space-y-3 px-5 pb-5 pt-3">
              <Fact label="Medical history">
                {profile?.medicalHistory ? <span className="whitespace-pre-line">{profile.medicalHistory}</span> : 'None recorded'}
              </Fact>
              <Fact label="Emergency contact">
                {profile?.emergencyContact ? (
                  <span>
                    {profile.emergencyContact.name}
                    {profile.emergencyContact.relationship ? ` (${profile.emergencyContact.relationship})` : ''}
                    {profile.emergencyContact.phone && (
                      <>
                        {' · '}
                        <a href={`tel:${profile.emergencyContact.phone.replace(/[^\d+]/g, '')}`} className="text-rh-ink underline-offset-2 hover:underline dark:text-rh-lime">
                          {profile.emergencyContact.phone}
                        </a>
                      </>
                    )}
                  </span>
                ) : (
                  'None recorded'
                )}
              </Fact>
              {profile?.city && <Fact label="City">{profile.city}</Fact>}
            </dl>
          </Panel>
        )}
      </div>

      {/* Outcome questionnaires the patient fills in, and their scores over time */}
      <QuestionnairesPanel patientId={workspace.patient._id} patientFirstName={workspace.patient.firstName} />

      {/* Measures from clinical notes, over time */}
      <ProgressPanel patientId={workspace.patient._id} targets={goalTargets(workspace.plan?.goals)} condition={workspace.episode.condition} />
    </div>
  )
}
