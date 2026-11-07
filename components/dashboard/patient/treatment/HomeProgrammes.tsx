'use client'

import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { ProgramPlayer } from '@/components/exercise-programs/ProgramPlayer'
import { useFlexCheckout } from '@/components/exercise-programs/flex'
import type { LogInput, MyProgram } from '@/components/exercise-programs/types'
import { InfoTip, SectionLabel } from '@/components/patient/ui'
import { useViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { saveMineRef } from '@/lib/motion/convexRefs'
import { useOfflineWrite } from '@/lib/offline/offlineWrite'
import { useOutbox } from '@/lib/offline/outbox'
import { cn } from '@/lib/utils'

type Item = MyProgram['items'][number]

/** What an item is, for programmes whose items have no permanent key yet (matches the server's itemRefOf). */
const itemRefOf = (item: Item) => `${item.exerciseId ?? item.name ?? ''}|${item.side ?? ''}`

/** Midnight today in Lagos (UTC+1), so "done today" matches the server's. */
function startOfLagosDay(now: number) {
  const day = 86_400_000
  return now - ((now + 3_600_000) % day)
}

/** Which item a log kept on the phone is for (by permanent key, by what it was, or by position). */
function itemIndexOf(program: MyProgram, args: Record<string, unknown>): number {
  if (typeof args.itemKey === 'string') return program.items.findIndex((item) => item.key === args.itemKey)
  if (typeof args.itemRef === 'string') {
    const at = program.items[args.itemIndex as number]
    if (at && itemRefOf(at) === args.itemRef) return at.index
    return program.items.find((item) => itemRefOf(item) === args.itemRef)?.index ?? -1
  }
  return typeof args.itemIndex === 'number' ? args.itemIndex : -1
}

function Program({ program }: { program: MyProgram }) {
  const requestGrant = useViewerGrant({ kind: 'program', programId: program._id })
  const log = useOfflineWrite('exerciseLog')
  const tick = useOfflineWrite('programTick')
  const finish = useOfflineWrite('programFinish')
  const saveGuided = useMutation(saveMineRef)
  const outbox = useOutbox()
  // What was done today on this phone and not sent yet counts too: logs, ticks and "Done for today"
  const { doneToday, finishedToday, finishWaiting } = useMemo(() => {
    const today = startOfLagosDay(Date.now())
    const waiting = outbox.filter(
      (change) => change.meta.programId === program._id && change.createdAt >= today && change.status === 'pending'
    )
    const items = waiting
      .filter((change) => change.kind === 'exerciseLog' || change.kind === 'programTick')
      .map((change) => itemIndexOf(program, change.args))
      .filter((index) => index >= 0)
    const finishedHere = waiting.find((change) => change.kind === 'programFinish')?.createdAt ?? null
    return {
      doneToday: items.length ? [...new Set([...program.doneToday, ...items])] : program.doneToday,
      finishedToday: program.finishedToday ?? finishedHere,
      finishWaiting: !program.finishedToday && finishedHere !== null,
    }
  }, [outbox, program])
  // An independent physio's own patients buy Flex for demonstrations and tracking. Paystack
  // returns to /dashboard/patient/exercises, which redirects here with the reference.
  const { checkout, busy } = useFlexCheckout({ from: 'exercises' })

  // Offline changes name the item by its permanent key, so a reordered programme still gets them right
  const whichItem = (item: Item | undefined) => (item?.key ? { itemKey: item.key } : item ? { itemRef: itemRefOf(item) } : {})

  const onLog = async (input: LogInput) => {
    const item = program.items[input.itemIndex]
    const result = await log(
      { programId: program._id, ...input, ...whichItem(item) },
      { label: `Exercise · ${item?.name ?? 'Exercise'}`, meta: { programId: program._id } }
    )
    return result.queued ? ('queued' as const) : undefined
  }

  const onMarkDone = async (itemIndex: number) => {
    const item = program.items[itemIndex]
    const result = await tick(
      { programId: program._id, itemIndex, ...whichItem(item) },
      { label: `Done · ${item?.name ?? 'Item'}`, meta: { programId: program._id } }
    )
    return result.queued ? ('queued' as const) : undefined
  }

  const onFinish = async () => {
    const result = await finish({ programId: program._id }, { label: `Done for today · ${program.title}`, meta: { programId: program._id } })
    return result.queued ? ('queued' as const) : undefined
  }

  return (
    <ProgramPlayer
      program={program}
      doneToday={doneToday}
      requestGrant={requestGrant}
      mediaContext={{ kind: 'program', programId: program._id }}
      onLog={onLog}
      onMarkDone={onMarkDone}
      onFinish={onFinish}
      finishedToday={finishedToday}
      finishWaiting={finishWaiting}
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
