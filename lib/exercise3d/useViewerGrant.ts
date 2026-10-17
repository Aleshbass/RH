'use client'

import { useCallback, useMemo } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { EXERCISE_CATALOG } from '@/convex/exerciseLibraryCatalog'

export type ViewerGrant = {
  version: string
  character: string | null
  clips: Record<string, string>
  denied: string[]
  watermark: string
}

/** Who is asking: staff previewing the library, a patient in their programme, or a WhatsApp link. */
export type GrantContext =
  | { kind: 'staff' }
  | { kind: 'program'; programId: Id<'exercisePrograms'> }
  | { kind: 'link'; code: string; session: string }

// Keys live only in memory for this page session, per context.
const grants = new Map<string, ViewerGrant>()

function contextKey(context: GrantContext) {
  if (context.kind === 'program') return `program:${context.programId}`
  if (context.kind === 'link') return `link:${context.code}`
  return 'staff'
}

/** Returns a function that gets (and remembers) keys for the clips a viewer needs. */
export function useViewerGrant(context: GrantContext) {
  const request = useMutation(api.exerciseLibrary.requestViewerGrant)
  const key = contextKey(context)
  const args = useMemo(
    () =>
      context.kind === 'program'
        ? { programId: context.programId }
        : context.kind === 'link'
          ? { share: { code: context.code, session: context.session } }
          : {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, context.kind === 'link' ? context.session : '']
  )

  return useCallback(
    async (clipIds: string[]): Promise<ViewerGrant> => {
      const known = grants.get(key)
      const missing = clipIds.filter((id) => !known?.clips[id] && !known?.denied.includes(id))
      if (known?.character && missing.length === 0) return known
      const fresh = (await request({ version: EXERCISE_CATALOG.version, clipIds: missing.length ? missing : clipIds, ...args })) as ViewerGrant
      const merged: ViewerGrant = {
        version: fresh.version,
        character: fresh.character ?? known?.character ?? null,
        clips: { ...(known?.clips ?? {}), ...fresh.clips },
        denied: [...new Set([...(known?.denied ?? []), ...fresh.denied])],
        watermark: fresh.watermark,
      }
      grants.set(key, merged)
      return merged
    },
    [key, args, request]
  )
}
