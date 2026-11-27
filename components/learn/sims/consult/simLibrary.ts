/**
 * The exercise library for Learn simulations: the same 78 exercises physios prescribe on the
 * platform (convex/exerciseLibraryContent.ts), shaped like the physio library's entries so the
 * real LibraryPicker can show them. Built from the static catalogue, so learners need no library
 * access (posters are public files; ids are the stable slugs, which the case rules use).
 */

import type { Id } from '@/convex/_generated/dataModel'
import { clipIdFor, LIBRARY } from '@/convex/exerciseLibraryContent'
import { findClip, posterUrl } from '@/convex/exerciseLibraryCatalog'
import type { LibraryEntry } from '@/components/exercise-programs/types'

let cache: LibraryEntry[] | null = null

export function simLibrary(): LibraryEntry[] {
  cache ??= LIBRARY.map((e): LibraryEntry => {
    const sides: ('L' | 'R' | null)[] = e.sided ? ['L', 'R'] : [null]
    const clips = sides.flatMap((side) => {
      const id = clipIdFor(e.slug, e.sided, side)
      const clip = findClip(id)
      return clip ? [{ id, side, seconds: clip.seconds, poster: posterUrl(id) }] : []
    })
    return {
      _id: e.slug as Id<'exercises'>,
      name: e.name,
      description: e.description,
      instructions: e.instructions,
      precautions: e.precautions,
      bodyParts: e.bodyParts,
      targetMuscles: e.targetMuscles,
      conditions: e.conditions,
      equipment: e.equipment,
      difficulty: e.difficulty,
      position: e.position,
      sided: e.sided,
      defaults: { sets: e.defaults.sets, reps: e.defaults.reps, holdSeconds: e.defaults.holdSeconds ?? null, frequency: e.defaults.frequency },
      // Shown as signed off: in a simulation nothing reaches a patient
      animation: clips.length ? { slug: e.slug, status: 'approved', clips } : null,
      imageUrl: null,
      videoUrl: null,
      ownMedia: null,
      author: null,
    }
  })
  return cache
}

export function simExercise(slug: string): LibraryEntry | null {
  return simLibrary().find((e) => e._id === slug) ?? null
}

export const FREQUENCIES = ['Once a day', 'Twice a day', '3 times a day', '3 times a week', 'Every other day'] as const

/** "3 × 10 · hold 30s · twice a day · left" */
export function doseText(i: { sets?: number; reps?: number; holdSeconds?: number | null; frequency?: string; side?: 'L' | 'R' | null }) {
  const parts = [`${i.sets ?? 1} × ${i.reps ?? 1}`]
  if (i.holdSeconds) parts.push(`hold ${i.holdSeconds}s`)
  if (i.frequency) parts.push(i.frequency.toLowerCase())
  if (i.side) parts.push(i.side === 'L' ? 'left' : 'right')
  return parts.join(' · ')
}
