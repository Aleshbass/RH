'use client'

import { useEffect, useState } from 'react'
import type { AnimationClip } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EXERCISE_CATALOG } from '@/convex/exerciseLibraryCatalog'
import type { ViewerGrant } from '@/lib/exercise3d/useViewerGrant'
import type { Reference } from '@/lib/motion/engine'
import type { MotionExercise } from '@/lib/motion/exercises'
import type { Side } from '@/lib/motion/pose'

export type CoachAssets =
  | { status: 'loading' }
  /** No 3D (not approved yet, low-memory phone or a failed download): the poster stands in */
  | { status: 'unavailable' }
  | { status: 'ready'; gltf: GLTF; clip: AnimationClip; watermark: string; reference: Reference | null }

function lowMemory() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2
}

/**
 * The 3D coach for a camera session: the same encrypted character and clip as the programme's
 * demonstration (same grant, same cached files), plus the clip measured as the reference rep.
 */
export function useCoachAssets(
  clipId: string,
  requestGrant: (clipIds: string[]) => Promise<ViewerGrant>,
  exercise: MotionExercise,
  side: Side
): CoachAssets {
  const [assets, setAssets] = useState<CoachAssets>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      // The camera tracker needs the memory more than the 3D does on small phones
      if (lowMemory()) return setAssets({ status: 'unavailable' })
      try {
        const grant = await requestGrant([clipId])
        const key = grant.clips[clipId]
        if (grant.denied.includes(clipId) || !key || !grant.character) return setAssets({ status: 'unavailable' })
        const characterKey = grant.character
        const base = EXERCISE_CATALOG.basePath
        const [{ loadEncrypted, parseMotion }, { parseCharacter }, { referenceFromClip }] = await Promise.all([
          import('@/lib/exercise3d/assets'),
          import('@/components/exercise3d/ExerciseStage'),
          import('@/lib/motion/reference'),
        ])
        const gltf = await parseCharacter(grant.version, () => loadEncrypted(`${base}/${EXERCISE_CATALOG.character.file}`, characterKey))
        const clip = parseMotion(await loadEncrypted(`${base}/m/${clipId}.rhx`, key), clipId)
        let reference: Reference | null = null
        try {
          reference = referenceFromClip(gltf, clip, exercise, side)
        } catch {
          // Scoring falls back to the exercise's own timing
        }
        if (!cancelled) setAssets({ status: 'ready', gltf, clip, watermark: grant.watermark, reference })
      } catch {
        if (!cancelled) setAssets({ status: 'unavailable' })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [clipId, requestGrant, exercise, side])

  return assets
}
