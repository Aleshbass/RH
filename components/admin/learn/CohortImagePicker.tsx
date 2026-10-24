'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useMutation } from 'convex/react'
import { ImagePlus, Loader2, RefreshCw, Trash2 } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { inputClass, softButtonClass } from '@/components/admin/ui'
import { errorMessage, hintClass, labelClass } from '@/components/admin/partners/shared'
import { cn } from '@/lib/utils'

/**
 * Optional cohort photo. Photos already at web size are uploaded untouched. Larger ones are
 * scaled to 2400px on the longest side (the site shows them at ~500px, ~1000px on sharp
 * screens) and saved as high-quality WebP, so there's no visible loss. On the site,
 * next/image then serves AVIF/WebP at the width each screen needs.
 */

const MAX_EDGE = 2400
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024
const WEBP_QUALITY = 0.9
const JPEG_QUALITY = 0.9
const WEB_READY = ['image/webp', 'image/jpeg', 'image/png', 'image/avif']

const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

async function optimise(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    // Honours the photo's EXIF orientation in current browsers
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("We couldn't read this image. Please use a JPG, PNG or WebP photo.")
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const webReady = WEB_READY.includes(file.type)
  if (scale === 1 && webReady && file.size <= KEEP_ORIGINAL_BYTES) {
    bitmap.close()
    return file
  }
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Your browser could not process this image.')
  }
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  let blob = await encode('image/webp', WEBP_QUALITY)
  // Older Safari silently returns PNG for WebP requests
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', JPEG_QUALITY)
  if (!blob) throw new Error('Your browser could not process this image.')

  // Never upload something bigger than the original at the same size
  return scale === 1 && webReady && file.size <= blob.size ? file : blob
}

export function CohortImagePicker({
  storageId,
  previewUrl,
  alt,
  onChange,
  onAltChange,
}: {
  storageId: Id<'_storage'> | null
  previewUrl: string | null
  alt: string
  onChange: (storageId: Id<'_storage'> | null, previewUrl: string | null) => void
  onAltChange: (alt: string) => void
}) {
  const generateUploadUrl = useMutation(api.learn.adminGenerateImageUploadUrl)
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrl = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    []
  )

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setSaved(null)
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image. Please choose a JPG, PNG or WebP photo.')
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError('That image is over 25 MB. Please choose a smaller photo.')
      return
    }
    setBusy(true)
    try {
      const blob = await optimise(file)
      const uploadUrl = (await generateUploadUrl({})) as string
      const response = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })
      if (!response.ok) throw new Error('The upload failed. Please try again.')
      const { storageId: uploaded } = (await response.json()) as { storageId: Id<'_storage'> }

      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = URL.createObjectURL(blob)
      onChange(uploaded, objectUrl.current)
      setSaved(blob === file ? `Uploaded (${kb(file.size)}, already web-ready)` : `Optimised ${kb(file.size)} → ${kb(blob.size)}`)
    } catch (err) {
      setError(errorMessage(err, 'The upload failed. Please try again.'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const hasImage = Boolean(storageId && previewUrl)

  return (
    <div className="space-y-3 sm:col-span-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {hasImage ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-rh-canvas sm:w-56 dark:bg-white/[0.04]">
            <Image
              src={previewUrl!}
              alt={alt || 'Cohort image'}
              fill
              sizes="(min-width: 640px) 224px, 100vw"
              className="object-cover"
              // A just-picked file is a local blob: URL, which the optimiser can't fetch
              unoptimized={previewUrl!.startsWith('blob:')}
            />
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" className={softButtonClass} disabled={busy} onClick={() => inputRef.current?.click()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={softButtonClass}
                disabled={busy}
                onClick={() => {
                  setSaved(null)
                  onChange(null, null)
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cohort-imageAlt" className={labelClass}>
                Describe the image
              </label>
              <Input
                id="cohort-imageAlt"
                value={alt}
                maxLength={160}
                onChange={(e) => onAltChange(e.target.value)}
                placeholder="A physiotherapist assessing a patient's knee during a live session"
                className={inputClass}
              />
              <p className={hintClass}>For screen readers and search engines.</p>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFile(e.dataTransfer.files?.[0])
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime/40',
            dragging
              ? 'border-rh-lime bg-rh-honeydew dark:border-rh-lime dark:bg-white/[0.06]'
              : 'border-black/10 hover:border-rh-lime/50 hover:bg-rh-canvas dark:border-white/15 dark:hover:border-white/10 dark:hover:bg-white/[0.03]'
          )}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-rh-ink dark:text-rh-lime" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rh-honeydew text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime">
              <ImagePlus className="h-5 w-5" />
            </span>
          )}
          <span className="text-sm font-medium text-rh-ink dark:text-white">{busy ? 'Optimising and uploading…' : 'Add a photo (optional)'}</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Click or drop a JPG, PNG or WebP. Landscape works best. We resize and compress it for fast loading.
          </span>
        </button>
      )}

      {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      {saved && !error && <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}. Save the cohort to publish it.</p>}
    </div>
  )
}
