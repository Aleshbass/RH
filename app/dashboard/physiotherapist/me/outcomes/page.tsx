'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowRight, ChevronRight, Globe, HeartPulse, Star } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { EmptyState, PageContainer, PageHeader, PageSkeleton, Panel, StatTile, listRowClass } from '@/components/physio/ui'
import { outcomeRefs } from '@/components/outcomes/refs'
import { cn } from '@/lib/utils'

/** The physio's own outcomes across their patients: their bragging rights, from patients' own answers. */
export default function MyOutcomesPage() {
  const data = useQuery(outcomeRefs.mine, {})
  const refresh = useMutation(outcomeRefs.refreshMine)
  const setShow = useMutation(outcomeRefs.setShowOnProfile)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void refresh({}).catch(() => undefined)
  }, [refresh])

  if (data === undefined) return <PageSkeleton />
  if (data === null) {
    return (
      <PageContainer>
        <EmptyState title="Outcomes open once your account is approved" />
      </PageContainer>
    )
  }

  const s = data.summary
  const finished = s?.finished ?? 0
  const scored = s?.scored ?? 0
  const canGoPublic = scored >= data.publicMin

  async function toggle(show: boolean) {
    setSaving(true)
    try {
      await setShow({ show })
      toast.success(show ? 'Your outcomes will show on your public profile.' : 'Your outcomes are private.')
    } catch {
      toast.error('Couldn’t save that. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="About me"
        title="Your outcomes"
        description="How your patients improve, in their own words and scores."
        info="Rehabify asks each patient how they are when care starts, around sessions and at discharge. Figures cover the last 2 years and update after every answer. Medians, so one unusual patient doesn’t skew them."
        back={{ href: '/dashboard/physiotherapist/me', label: 'About me' }}
      />

      {!s || (s.courses === 0 && s.ratingCount === 0) ? (
        <Panel>
          <EmptyState
            icon={<HeartPulse />}
            title="Your outcomes start with your next patient"
            description="Rehabify asks patients how they are before their first confirmed session, after each session and at discharge. Their scores build up here."
          />
        </Panel>
      ) : (
        <>
          {/* Headline: finished courses with a first and final score */}
          <section className="rounded-3xl bg-pt-primary p-6 text-pt-on-primary sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Typical pain change · finished care</p>
            {s.baselineMedian !== null && s.latestMedian !== null ? (
              <p className="mt-3 flex items-center gap-3 text-[52px] font-semibold leading-none tabular-nums tracking-tight sm:text-[64px]">
                {s.baselineMedian}
                <ArrowRight className="h-8 w-8 opacity-50" />
                <span className="text-pt-accent">{s.latestMedian}</span>
              </p>
            ) : (
              <p className="mt-3 text-2xl font-semibold">Not enough finished courses yet</p>
            )}
            <p className="mt-3 text-sm opacity-80">
              {scored > 0
                ? `Pain out of 10, from ${scored} finished ${scored === 1 ? 'course' : 'courses'} of care with a first and final score.`
                : 'Finish care with a patient and ask for final scores to see this.'}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Meaningful improvement"
              value={s.meaningfulPct !== null ? `${s.meaningfulPct}%` : '–'}
              hint="Pain down 2+ points"
              info="Share of finished courses where pain dropped by 2 points or more, the smallest change patients notice. Patients who started below 2 aren’t counted."
            />
            <StatTile
              label="Typical sessions"
              value={s.sessionsMedian ?? '–'}
              hint="Per finished course"
              info="Median number of completed sessions per finished course of care."
            />
            <StatTile
              label="Patient rating"
              value={s.ratingAverage !== null ? <span className="inline-flex items-center gap-1.5">{s.ratingAverage}<Star className="h-5 w-5" /></span> : '–'}
              hint={s.ratingCount ? `From ${s.ratingCount} ${s.ratingCount === 1 ? 'patient' : 'patients'}` : 'No ratings yet'}
            />
            <StatTile
              label="Relief per session"
              value={s.sessionReliefMedian !== null ? `${s.sessionReliefMedian} pts` : '–'}
              hint={s.sessionPairs ? `Lower after a session (${s.sessionPairs} sessions)` : 'Needs before and after scores'}
              info="Median change in pain from just before a session to after it. Short-term relief, not the course’s outcome."
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Panel
              className="lg:col-span-3"
              title="Recently finished"
              info="Pain at the start and the final score each patient gave. Open a patient to see the whole course."
            >
              {s.recent.length ? (
                <div className="pb-2">
                  {s.recent.map((c) => (
                    <Link key={c.episodeId} href={`/dashboard/physiotherapist/patients/${c.patientId}`} className={listRowClass}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-pt-ink">{c.patientName}</p>
                        <p className="truncate text-xs text-pt-muted">
                          {c.condition || 'Course of care'}
                          {c.completedAt ? ` · ${format(c.completedAt, 'd MMM yyyy')}` : ''}
                        </p>
                      </div>
                      <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-pt-ink">
                        {c.baseline ?? '–'}
                        <ArrowRight className="h-3 w-3 text-pt-faint" />
                        {c.latest ?? '–'}
                      </span>
                      {c.rating !== null && (
                        <span className="hidden items-center gap-0.5 text-xs font-semibold text-pt-muted sm:inline-flex">
                          {c.rating}
                          <Star className="h-3 w-3" />
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-pt-faint" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="px-6 pb-6 pt-2 text-sm text-pt-muted">No finished courses yet.</p>
              )}
            </Panel>

            <div className="space-y-5 lg:col-span-2">
              <Panel title="By body area" info="Finished courses with scores, grouped by what you wrote you were treating.">
                {s.byRegion.length ? (
                  <div className="space-y-3 px-5 pb-5 pt-3 sm:px-6">
                    {s.byRegion.map((r) => (
                      <div key={r.region} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-pt-ink">{r.region}</span>
                        <span className="text-pt-muted">
                          {r.courses} · {r.changeMedian !== null ? `${r.changeMedian} pts better` : '–'}
                          {r.meaningfulPct !== null ? ` · ${r.meaningfulPct}%` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-6 pb-6 pt-2 text-sm text-pt-muted">Shows once courses with scores are finished.</p>
                )}
              </Panel>

              <Panel title="In treatment now">
                <div className="px-5 pb-5 pt-2 text-sm text-pt-muted sm:px-6">
                  {s.activeCourses
                    ? `${s.activeCourses} ${s.activeCourses === 1 ? 'patient' : 'patients'} in care.${s.activeScored ? ` So far pain is down a typical ${s.activeChangeMedian ?? 0} points for the ${s.activeScored} with scores.` : ''}`
                    : 'Nobody in active care right now.'}
                  {s.completionRate !== null && (
                    <p className="mt-2">Scores collected for {s.completionRate}% of finished courses.</p>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      <Panel>
        <div className="flex items-start gap-4 px-5 py-5 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pt-sunken text-pt-ink">
            <Globe className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-pt-ink">Show on my public profile</p>
            <p className="mt-0.5 text-sm text-pt-muted">
              Patients looking for a physio see your typical pain change, improvement rate and rating, never names.{' '}
              {canGoPublic
                ? 'You have enough finished courses to show.'
                : `It appears once you have ${data.publicMin} finished courses with scores (you have ${scored}${finished > scored ? ` of ${finished} finished` : ''}).`}
            </p>
          </div>
          <Switch
            checked={data.showOnProfile}
            disabled={saving}
            onCheckedChange={(v) => void toggle(v)}
            aria-label="Show my outcomes on my public profile"
            className={cn('mt-1')}
          />
        </div>
      </Panel>
    </PageContainer>
  )
}
