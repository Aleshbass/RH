'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Dumbbell } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { ProgramPlayer } from '@/components/exercise-programs/ProgramPlayer'
import type { LogInput, MyProgram } from '@/components/exercise-programs/types'
import { TodayPlanExercises } from '@/components/dashboard/patient/treatment/PatientTreatmentPlanView'
import { EmptyState, LoadingBlocks, PageContainer, PageHeader, Panel, SectionLabel, InfoTip } from '@/components/patient/ui'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { cn } from '@/lib/utils'

function Program({ program }: { program: MyProgram }) {
  const requestGrant = useViewerGrant({ kind: 'program', programId: program._id })
  const log = useMutation(api.exercisePrograms.logExercise)
  return (
    <ProgramPlayer
      program={program}
      doneToday={program.doneToday}
      requestGrant={requestGrant}
      onLog={(input: LogInput) => log({ programId: program._id, ...input })}
    />
  )
}

/** The patient's home exercise programmes (3D player) and today's exercises from their treatment plan. */
export default function PatientExercisesPage() {
  const programs = useQuery(api.exercisePrograms.listMine) as MyProgram[] | null | undefined
  const activePlan = useQuery(api.treatmentPlans.getPatientActivePlan) as { _id: string } | null | undefined
  const [active, setActive] = useState(0)

  const hasPrograms = !!programs && programs.length > 0
  const nothingYet = programs !== undefined && !hasPrograms && activePlan === null

  return (
    <PageContainer>
      <PageHeader
        title="Exercises"
        description="Your home exercises for today. Tap one to see how it’s done, then tell your physio how it went."
        info="Doing your exercises little and often between visits is what makes physio work. Your physio sees what you’ve done and how it felt."
      />

      {programs === undefined || activePlan === undefined ? (
        <LoadingBlocks rows={3} />
      ) : nothingYet ? (
        <Panel>
          <EmptyState
            icon={Dumbbell}
            title="No exercises yet"
            description="When your physiotherapist sends you a home exercise programme, it appears here."
          />
        </Panel>
      ) : (
        <>
          <TodayPlanExercises
            fallback={
              hasPrograms ? null : (
                <Panel>
                  <EmptyState
                    icon={Dumbbell}
                    title="No exercises yet"
                    description="Your treatment plan doesn’t have exercises in it yet. Your physio will add them."
                  />
                </Panel>
              )
            }
          />

          {hasPrograms && programs && (
            <section className="space-y-3">
              <div className="flex items-center gap-1 px-1">
                <SectionLabel>{programs.length > 1 ? 'Your programmes' : 'Your programme'}</SectionLabel>
                <InfoTip>
                  A home programme is a set of exercises your physio sent you, with 3D demonstrations you can turn and replay. Pick an
                  exercise, follow along, then log how it went.
                </InfoTip>
              </div>
              {programs.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Programmes">
                  {programs.map((p, i) => (
                    <button
                      key={p._id}
                      type="button"
                      role="tab"
                      aria-selected={i === active}
                      onClick={() => setActive(i)}
                      className={cn(
                        'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95',
                        i === active
                          ? 'border-transparent bg-pt-primary text-pt-on-primary'
                          : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
                      )}
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
              {programs[active] && <Program key={programs[active]._id} program={programs[active]} />}
            </section>
          )}
        </>
      )}
    </PageContainer>
  )
}
