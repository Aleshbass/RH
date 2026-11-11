'use client'

import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Check, Copy, ImageIcon, ImagePlus, Loader2, Search, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPage, ConfirmDialog, EmptyState, PageHeader, Panel, inputClass, primaryButtonClass } from '@/components/admin/ui'
import { ACCEPTED_IMAGES, useBlogUpload } from '@/components/admin/blog/useBlogUpload'
import { blogApi, errorText, type MediaRow } from '@/lib/blog/api'
import { imagekitTransform } from '@/lib/blog/content'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number | null) {
  if (!bytes) return null
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function MediaCard({ item, onDelete }: { item: MediaRow; onDelete: () => void }) {
  const updateAlt = useMutation(blogApi.updateMediaAlt)
  const [alt, setAlt] = useState(item.alt)
  const [copied, setCopied] = useState(false)
  const dirty = alt.trim() !== item.alt
  const size = formatBytes(item.bytes)
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-rh-ink-2">
      <div className="relative aspect-[4/3] bg-rh-canvas dark:bg-white/5">
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageKit thumbnail */}
        <img src={imagekitTransform(item.url, { w: 480, q: 70 })} alt={item.alt} loading="lazy" className="h-full w-full object-cover" />
        {!item.alt ? <span className="absolute left-2 top-2 rounded-md bg-rh-peach px-1.5 py-0.5 text-[10px] font-semibold text-[#b4690e]">No alt text</span> : null}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex gap-1.5">
          <Input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && dirty) {
                try {
                  await updateAlt({ mediaId: item._id, alt })
                  toast.success('Alt text saved.')
                } catch (error) {
                  toast.error(errorText(error))
                }
              }
            }}
            placeholder="Describe the picture"
            className={cn(inputClass, 'h-8 text-[12px]')}
            maxLength={200}
          />
          {dirty ? (
            <Button
              type="button"
              size="sm"
              className={cn(primaryButtonClass, 'h-8 px-2.5')}
              onClick={async () => {
                try {
                  await updateAlt({ mediaId: item._id, alt })
                  toast.success('Alt text saved.')
                } catch (error) {
                  toast.error(errorText(error))
                }
              }}
            >
              Save
            </Button>
          ) : null}
        </div>
        <p className="text-[11px] text-neutral-500">Pictures already in a post keep the alt text they were given there.</p>
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>
            {item.width && item.height ? `${item.width}×${item.height}` : ''}
            {size ? ` · ${size}` : ''}
          </span>
          <span className="flex gap-1">
            <button
              type="button"
              className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
              title="Copy link"
              onClick={async () => {
                await navigator.clipboard.writeText(item.url).catch(() => undefined)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-rh-lime-deep" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {item.canDelete ? (
              <button type="button" className="rounded-md p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-400/10" title="Delete" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function BlogMediaPage() {
  const media = useQuery(blogApi.listMedia, {}) as MediaRow[] | undefined
  const remove = useMutation(blogApi.deleteMedia)
  const { upload, uploading, progress } = useBlogUpload()
  const [term, setTerm] = useState('')
  const [target, setTarget] = useState<MediaRow | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase()
    return (media ?? []).filter((m) => !q || m.alt.toLowerCase().includes(q))
  }, [media, term])

  const onFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        await upload(file)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The upload failed.')
      }
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Blog"
        title="Media library"
        description="Every picture uploaded for the blog. Big photos are shrunk to web size before upload, and served in the best format for each screen."
        actions={
          <Button type="button" className={primaryButtonClass} disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
            {uploading ? `Uploading ${Math.round(progress * 100)}%` : 'Upload pictures'}
          </Button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGES}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Panel
        title={media ? `${media.length} picture${media.length === 1 ? '' : 's'}` : 'Pictures'}
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by alt text" className={cn(inputClass, 'h-9 pl-9')} />
          </div>
        }
      >
        {media === undefined ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<ImageIcon />} title={media.length === 0 ? 'No pictures yet' : 'No pictures match'} description="Pictures added to posts appear here too." />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {shown.map((item) => (
              <MediaCard key={item._id} item={item} onDelete={() => setTarget(item)} />
            ))}
          </div>
        )}
      </Panel>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Delete this picture?"
        description="It is removed from the image host too. Any post still showing it will have a broken picture, so check first."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!target) return
          try {
            await remove({ mediaId: target._id })
            toast.success('Picture deleted.')
          } catch (error) {
            toast.error(errorText(error))
            throw error
          }
        }}
      />
    </AdminPage>
  )
}
