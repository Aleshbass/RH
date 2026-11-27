'use client'

/**
 * A "talk to the patient" attempt, stage by stage: the conversation (history), the examination and
 * plan (the tap player, as in the classic game), explaining the plan (conversation again), the note,
 * then the debrief. The server's attempt says which stage it's in.
 */

import { useEffect } from 'react'
import type { SimAttempt } from '../simApi'
import { ScoredPlayer } from '../v2/ScoredPlayer'
import { ConsultChat } from './ConsultChat'
import { ConsultNote } from './ConsultNote'
import { ConsultProgramme } from './ConsultProgramme'

const noop = () => undefined

export function ConsultPlayer({ attempt, onDone }: { attempt: SimAttempt; onDone: () => void }) {
  const info = attempt.consult
  const finished = attempt.status === 'finished'
  const walkedOut = Boolean(info?.walkedOut)

  // Handing in the note closes the visit: straight to the debrief (a walk-out lingers in the chat)
  useEffect(() => {
    if (finished && !walkedOut) onDone()
  }, [finished, walkedOut, onDone])

  if (!info) return null
  if (finished) return walkedOut ? <ConsultChat attempt={attempt} info={info} onDone={onDone} /> : null
  if (info.stage === 'case') return <ScoredPlayer attempt={attempt} onDone={noop} />
  if (info.stage === 'programme') return <ConsultProgramme attempt={attempt} />
  if (info.stage === 'note') return <ConsultNote attempt={attempt} />
  return <ConsultChat key={info.stage} attempt={attempt} info={info} onDone={onDone} />
}
