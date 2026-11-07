'use client'

import dynamic from 'next/dynamic'
import { useQuery } from 'convex/react'
import type { Id } from '@/convex/_generated/dataModel'
import type { ViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import { myHistoryRef, type GuidedResult } from '@/lib/motion/convexRefs'
import type { MotionExercise } from '@/lib/motion/exercises'

// The camera coach (MediaPipe, the 3D stage) only downloads when a patient opens it
const GuidedSession = dynamic(() => import('./GuidedSession'), { ssr: false })

/** How a player offers the camera coach: where sessions are saved and, for signed-in patients, the programme for "last time". */
export type CoachActions = {
  save: (result: GuidedResult) => Promise<void>
  programId?: Id<'exercisePrograms'>
}

export function CameraCoach({
  coach,
  clipId,
  exercise,
  name,
  itemIndex,
  plan,
  requestGrant,
  onSaved,
  onClose,
}: {
  coach: CoachActions
  clipId: string
  exercise: MotionExercise
  name: string
  itemIndex: number
  plan: { sets: number; reps: number }
  requestGrant: (clipIds: string[]) => Promise<ViewerGrant>
  onSaved: () => void
  onClose: () => void
}) {
  const history = useQuery(myHistoryRef, coach.programId ? { programId: coach.programId, itemIndex } : 'skip')
  return (
    <GuidedSession
      clipId={clipId}
      exercise={exercise}
      name={name}
      itemIndex={itemIndex}
      plan={plan}
      requestGrant={requestGrant}
      history={history ?? null}
      onSave={async (result) => {
        await coach.save(result)
        onSaved()
      }}
      onClose={onClose}
    />
  )
}
