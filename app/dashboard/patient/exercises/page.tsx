'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Dumbbell, Loader2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { ProgramPlayer } from '@/components/exercise-programs/ProgramPlayer'
import type { LogInput, MyProgram } from '@/components/exercise-programs/types'
import { EmptyState, PageContainer, PageHeader, Panel } from '@/components/physio/ui'
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

export default function PatientExercisesPage() {
  const programs = useQuery(api.exercisePrograms.listMine) as MyProgram[] | null | undefined
  const [active, setActive] = useState(0)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="My exercises"
        title="Your home exercises"
        description="Watch each exercise in 3D from any angle, follow along, and tell your physio how it went."
      />
      {programs === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-rh-teal" />
        </div>
      ) : !programs || programs.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Dumbbell />}
            title="No exercises yet"
            description="When your physiotherapist sends you a home exercise programme, it appears here."
          />
        </Panel>
      ) : (
        <>
          {programs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {programs.map((p, i) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95',
                    i === active
                      ? 'border-rh-teal bg-rh-teal text-white dark:border-rh-aqua dark:bg-rh-aqua dark:text-rh-night'
                      : 'border-black/[0.08] bg-white hover:bg-rh-mist dark:border-white/10 dark:bg-white/[0.03]'
                  )}
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}
          {programs[active] && <Program key={programs[active]._id} program={programs[active]} />}
        </>
      )}
    </PageContainer>
  )
}
