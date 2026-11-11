'use client'

import { useCallback, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { uploadToImagekit } from './imagekitUpload'
import { blogApi, type BlogImage } from '@/lib/blog/api'

/** Pictures are shown at most ~1200px wide (2x on sharp screens); bigger only costs load time. */
const MAX_EDGE = 2000
const WEBP_QUALITY = 0.84
const JPEG_QUALITY = 0.86
/** Already small enough and web-ready: upload as it is */
const KEEP_BYTES = 400 * 1024
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const ACCEPTED_IMAGES = 'image/jpeg,image/png,image/webp,image/avif'
const ACCEPTED = new Set(ACCEPTED_IMAGES.split(','))

type Prepared = { blob: Blob; width: number; height: number; name: string }

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file doesn't open as a picture."))
    }
    img.src = url
  })
}

/**
 * Shrinks a photo in the browser before upload: longest side 2000px, WebP (JPEG where the
 * browser can't make WebP). Phone photos go from ~5 MB to ~300 KB, so pages load fast.
 */
export async function prepareImage(file: File): Promise<Prepared> {
  if (!ACCEPTED.has(file.type)) throw new Error('Use a JPG, PNG, WebP or AVIF picture.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That picture is over 25 MB. Pick a smaller one.')
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const base = file.name.replace(/\.[^.]+$/, '') || 'blog-image'
  if (scale === 1 && file.size <= KEEP_BYTES && file.type !== 'image/png') return { blob: file, width, height, name: file.name }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: file, width: img.naturalWidth, height: img.naturalHeight, name: file.name }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  let blob = await encode('image/webp', WEBP_QUALITY)
  let ext = 'webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await encode('image/jpeg', JPEG_QUALITY)
    ext = 'jpg'
  }
  if (!blob) return { blob: file, width, height, name: file.name }
  // Keep the original when shrinking didn't help (already well compressed)
  if (blob.size >= file.size && scale === 1 && file.type !== 'image/png') return { blob: file, width, height, name: file.name }
  return { blob, width, height, name: `${base}.${ext}` }
}

export type UploadedImage = Required<Pick<BlogImage, 'url' | 'fileId'>> & { alt: string; width: number; height: number }

/** Upload one picture to the blog folder on ImageKit and add it to the media library. */
export function useBlogUpload() {
  const getAuth = useAction(blogApi.uploadAuth)
  const addMedia = useMutation(blogApi.addMedia)
  const [busy, setBusy] = useState(0)
  const [progress, setProgress] = useState(0)

  const upload = useCallback(
    async (file: File, alt = ''): Promise<UploadedImage> => {
      setBusy((n) => n + 1)
      setProgress(0)
      try {
        const prepared = await prepareImage(file)
        const auth = await getAuth({})
        const saved = await uploadToImagekit(prepared.blob, prepared.name, auth, setProgress)
        await addMedia({ url: saved.url, fileId: saved.fileId, alt, width: prepared.width, height: prepared.height, bytes: saved.size })
        return { url: saved.url, fileId: saved.fileId, alt, width: prepared.width, height: prepared.height }
      } finally {
        setBusy((n) => Math.max(0, n - 1))
      }
    },
    [getAuth, addMedia]
  )

  return { upload, uploading: busy > 0, progress }
}
