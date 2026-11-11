'use client'

import { createContext, useContext } from 'react'
import type { BlogImage } from '@/lib/blog/api'

/** What the editor's blocks need from the page around them (pictures and AI). */
export type BlogEditorTools = {
  /** Opens the media picker; resolves with the chosen pictures (empty when cancelled). */
  pickImages: (opts: { multiple: boolean; title?: string }) => Promise<BlogImage[]>
  /** AI alt text for a picture, or null when AI is off or fails (the reason is shown as a toast). */
  suggestAlt: ((image: { url: string; caption?: string }) => Promise<string | null>) | null
  readOnly: boolean
}

export const BlogEditorContext = createContext<BlogEditorTools>({
  pickImages: async () => [],
  suggestAlt: null,
  readOnly: false,
})

export const useBlogEditorTools = () => useContext(BlogEditorContext)
