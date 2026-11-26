'use client'

import { useMutation } from 'convex/react'
import type { Id } from '@/convex/_generated/dataModel'
import { marketingApi } from '@/lib/marketingApi'

/** PNG, JPG and GIF only: some email apps (Outlook on Windows among them) can't show WebP or SVG. */
export const EMAIL_IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif'
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Uploads a picture for a campaign email to Convex file storage (marketing:adminImageUploadUrl,
 * then marketing:adminImageSaved checks it) and gives back its public https link.
 */
export function useEmailImageUpload() {
  const getUploadUrl = useMutation(marketingApi.imageUploadUrl)
  const saved = useMutation(marketingApi.imageSaved)

  return async (file: File): Promise<string> => {
    if (!EMAIL_IMAGE_ACCEPT.split(',').includes(file.type)) throw new Error('Use a PNG, JPG or GIF picture. Some email apps can’t show other kinds.')
    if (file.size > MAX_BYTES) throw new Error('Pictures can be up to 5 MB. Make it smaller and try again.')
    const uploadUrl = await getUploadUrl({})
    const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
    if (!response.ok) throw new Error('The upload didn’t go through. Try again.')
    const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
    const { url } = await saved({ storageId })
    return url
  }
}

/** A readable message from an upload error (Convex errors carry a prefix). */
export const uploadErrorText = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^.*ConvexError: /, '').split('\n')[0] : 'The upload didn’t go through. Try again.'
