'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ProgramPlayer } from '@/components/exercise-programs/ProgramPlayer'
import { useFlexCheckout } from '@/components/exercise-programs/flex'
import { finishProgramTodayRef, markItemDoneRef, type LogInput, type MyProgram } from '@/components/exercise-programs/types'
import { InfoTip, SectionLabel } from '@/components/patient/ui'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { saveMineRef } from '@/lib/motion/convexRefs'
import { cn } from '@/lib/utils'

function Program({ program }: { program: MyProgram }) {
  const requestGrant = useViewerGrant({ kind: 'program', programId: program._id })
  const log = useMutation(api.exercisePrograms.logExercise)
  const saveGuided = useMutation(saveMineRef)
  const markDone = useMutation(markItemDoneRef)
  const finish = useMutation(finishProgramTodayRef)
  // An independent physio's own patients buy Flex for demonstrations and tracking. Paystack
  // returns to /dashboard/patient/exercises, which redirects here with the reference.
  const { checkout, busy } = useFlexCheckout({ from: 'exercises' })
  return (
    <ProgramPlayer
      program={program}
      doneToday={program.doneToday}
      requestGrant={requestGrant}
      mediaContext={{ kind: 'program', programId: program._id }}
      onLog={(input: LogInput) => log({ programId: program._id, ...input })}
      onMarkDone={async (itemIndex) => {
        await markDone({ programId: program._id, itemIndex })
      }}
      onFinish={async () => {
        await finish({ programId: program._id })
      }}
      finishedToday={program.finishedToday}
      flex={{ onChoose: (plan) => void checkout(plan), busy }}
      coach={{
        programId: program._id,
        save: async (result) => {
          await saveGuided({ programId: program._id, ...result })
        },
      }}
    />
  )
}

/** The patient's home exercise programmes (3D player, logging, Flex), one at a time with tabs when there are several. */
export function HomeProgrammes({ programs }: { programs: MyProgram[] }) {
  const [active, setActive] = useState(0)
  if (programs.length === 0) return null
  const current = programs[active] ?? programs[0]

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1 px-1">
        <SectionLabel>{programs.length > 1 ? 'Your home programmes' : 'Your home programme'}</SectionLabel>
        <InfoTip>
          A home programme is a set of exercises your physio sent you, with 3D demonstrations you can turn and replay. Pick an exercise,
          follow along, then log how it went.
        </InfoTip>
      </div>
      {programs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Programmes">
          {programs.map((p, i) => (
            <button
              key={p._id}
              type="button"
              role="tab"
              aria-selected={p._id === current._id}
              onClick={() => setActive(i)}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95',
                p._id === current._id
                  ? 'border-transparent bg-pt-primary text-pt-on-primary'
                  : 'border-pt-line-strong bg-pt-surface text-pt-ink hover:bg-pt-hover'
              )}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
      <Program key={current._id} program={current} />
    </section>
  )
}
