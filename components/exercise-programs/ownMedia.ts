'use client'

import { useCallback } from 'react'
import { useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import type { Id } from '@/convex/_generated/dataModel'
import type { GrantContext } from '@/lib/exercise3d/useViewerGrant'

/** Short-lived links to one exercise's own photos or video. */
export type OwnMediaLinks = { video: string | null; poster: string | null; photos: string[] }

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const linksRef = makeFunctionReference<
  'mutation',
  { exerciseIds: Id<'exercises'>[]; programId?: Id<'exercisePrograms'>; share?: { code: string; session: string } },
  { links: Record<string, OwnMediaLinks>; expiresAt: number }
>('exerciseLibrary:requestExerciseMediaLinks')

// Links live only in memory for this page session, and are refreshed well before they expire
const cache = new Map<string, { links: OwnMediaLinks; expiresAt: number }>()
const REFRESH_BEFORE_MS = 10 * 60_000

/**
 * Returns a function that gets the links for one exercise, for the same viewers as the 3D clips:
 * staff, a patient in their programme, or a WhatsApp link session.
 */
export function useExerciseMediaLinks(context: GrantContext) {
  const request = useMutation(linksRef)
  const programId = context.kind === 'program' ? context.programId : undefined
  const code = context.kind === 'link' ? context.code : undefined
  const session = context.kind === 'link' ? context.session : undefined

  return useCallback(
    async (exerciseId: Id<'exercises'>): Promise<OwnMediaLinks | null> => {
      const key = `${programId ?? code ?? 'staff'}:${exerciseId}`
      const known = cache.get(key)
      if (known && known.expiresAt - Date.now() > REFRESH_BEFORE_MS) return known.links
      const result = await request({
        exerciseIds: [exerciseId],
        ...(programId ? { programId } : {}),
        ...(code && session ? { share: { code, session } } : {}),
      })
      const links = result.links[exerciseId] ?? null
      if (links) cache.set(key, { links, expiresAt: result.expiresAt })
      return links
    },
    [programId, code, session, request]
  )
}

export type RequestMediaLinks = ReturnType<typeof useExerciseMediaLinks>

/**
 * Resizes a photo to at most 1600px on the long side as a JPEG. Re-drawing it also drops the
 * camera's hidden details (location, device), which never leave the phone.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This photo can’t be read. Try another one.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('This photo can’t be read. Try another one.'))), 'image/jpeg', 0.85)
  )
}

export function formatDuration(totalSec: number) {
  const sec = Math.round(totalSec)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
