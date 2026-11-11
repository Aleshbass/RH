'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Check, ImagePlus, Loader2, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { inputClass, primaryButtonClass } from '@/components/admin/ui'
import { blogApi, type BlogImage, type MediaRow } from '@/lib/blog/api'
import { imagekitTransform } from '@/lib/blog/content'
import { cn } from '@/lib/utils'
import { ACCEPTED_IMAGES, useBlogUpload } from './useBlogUpload'

/** Small thumbnail straight from ImageKit (the library can hold hundreds of pictures). */
export const thumb = (url: string, w = 320) => imagekitTransform(url, { w, q: 70 })

/**
 * Pick pictures for a post: upload new ones (shrunk in the browser first) or reuse any picture
 * already in the blog's media library. Uploaded pictures are selected straight away.
 */
export function MediaPicker({
  open,
  onOpenChange,
  multiple = false,
  title = 'Add a picture',
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  multiple?: boolean
  title?: string
  onPick: (images: BlogImage[]) => void
}) {
  const media = useQuery(blogApi.listMedia, open ? {} : 'skip') as MediaRow[] | undefined
  const { upload, uploading, progress } = useBlogUpload()
  const [selected, setSelected] = useState<string[]>([])
  const [term, setTerm] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fresh, setFresh] = useState<BlogImage[]>([])

  useEffect(() => {
    if (!open) {
      setSelected([])
      setTerm('')
      setFresh([])
    }
  }, [open])

  const items = useMemo(() => {
    const all = media ?? []
    const q = term.trim().toLowerCase()
    return q ? all.filter((m) => m.alt.toLowerCase().includes(q)) : all
  }, [media, term])

  const toggle = (url: string) => {
    setSelected((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url)
      return multiple ? [...prev, url] : [url]
    })
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    for (const file of multiple ? list : list.slice(0, 1)) {
      try {
        const image = await upload(file)
        setFresh((prev) => [...prev, image])
        setSelected((prev) => (multiple ? [...prev, image.url] : [image.url]))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The upload failed.')
      }
    }
  }

  const confirm = () => {
    const byUrl = new Map<string, BlogImage>()
    for (const m of media ?? []) byUrl.set(m.url, { url: m.url, alt: m.alt, width: m.width ?? undefined, height: m.height ?? undefined })
    for (const f of fresh) byUrl.set(f.url, f)
    const picked = selected.map((url) => byUrl.get(url)).filter((x): x is BlogImage => Boolean(x))
    if (picked.length === 0) return
    onPick(picked)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 rounded-2xl sm:max-w-3xl dark:border-white/10 dark:bg-rh-ink-2">
        <DialogHeader>
          <DialogTitle className="dark:text-white">{title}</DialogTitle>
          <DialogDescription>Upload a new picture or reuse one from the media library. Big photos are shrunk before upload.</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            void handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-6 text-center transition-colors',
            dragging ? 'border-rh-lime bg-rh-honeydew' : 'border-black/10 dark:border-white/15'
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-rh-lime-deep" />
              <p className="text-sm font-medium">Uploading… {Math.round(progress * 100)}%</p>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-neutral-500" />
              <p className="text-sm font-medium text-rh-ink dark:text-white">Drop {multiple ? 'pictures' : 'a picture'} here</p>
              <Button type="button" size="sm" className={primaryButtonClass} onClick={() => fileRef.current?.click()}>
                Choose from your device
              </Button>
              <p className="text-xs text-neutral-500">JPG, PNG, WebP or AVIF. Landscape works best for covers.</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGES}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search the library by alt text" className={cn(inputClass, 'pl-9')} />
          </div>
        </div>

        <div className="-mx-1 min-h-[160px] flex-1 overflow-y-auto px-1">
          {media === undefined ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">{term ? 'No pictures match.' : 'The library is empty. Upload the first picture above.'}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {items.map((m) => {
                const on = selected.includes(m.url)
                return (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => toggle(m.url)}
                    className={cn(
                      'group relative aspect-square overflow-hidden rounded-xl bg-rh-canvas ring-2 ring-offset-2 transition dark:bg-white/5 dark:ring-offset-rh-ink-2',
                      on ? 'ring-rh-lime' : 'ring-transparent hover:ring-black/10'
                    )}
                    title={m.alt || 'No alt text yet'}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit thumbnail in the admin picker */}
                    <img src={thumb(m.url)} alt={m.alt} loading="lazy" className="h-full w-full object-cover" />
                    {on ? (
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                    {!m.alt ? (
                      <span className="absolute inset-x-1.5 bottom-1.5 rounded-md bg-rh-peach px-1.5 py-0.5 text-[10px] font-semibold text-[#b4690e]">No alt text</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-4 dark:border-white/10">
          <p className="text-xs text-neutral-500">{selected.length ? `${selected.length} selected` : multiple ? 'Pick one or more' : 'Pick one'}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button type="button" className={primaryButtonClass} onClick={confirm} disabled={uploading || selected.length === 0}>
              {multiple ? 'Add pictures' : 'Use picture'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
