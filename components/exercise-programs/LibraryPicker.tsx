'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Camera, Check, Dumbbell, Eye, Rotate3d, Search } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/physio/ui'
import { posterUrl } from '@/convex/exerciseLibraryCatalog'
import { cn } from '@/lib/utils'
import { isLocalImage, type LibraryEntry } from './types'

const BODY_FILTERS = ['All', 'Knee', 'Hip', 'Ankle', 'Back', 'Core', 'Neck', 'Shoulders', 'Arms'] as const

export function entryPoster(entry: LibraryEntry) {
  const clip = entry.animation?.clips[0]
  return clip ? posterUrl(clip.id) : entry.imageUrl
}

/** Searchable grid of library exercises. 3D exercises come first. */
export function LibraryPicker({
  items,
  selected,
  onToggle,
  onPreview,
  selectLabel = 'Add',
}: {
  items: LibraryEntry[]
  selected?: Set<string>
  onToggle?: (entry: LibraryEntry) => void
  onPreview?: (entry: LibraryEntry) => void
  selectLabel?: string
}) {
  const [search, setSearch] = useState('')
  const [body, setBody] = useState<(typeof BODY_FILTERS)[number]>('All')
  const [only3d, setOnly3d] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((e) => {
      if (only3d && !e.animation) return false
      if (body !== 'All' && !e.bodyParts.some((b) => b.toLowerCase() === body.toLowerCase())) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.targetMuscles.some((m) => m.toLowerCase().includes(q)) ||
        e.conditions.some((c) => c.replace(/_/g, ' ').includes(q))
      )
    })
  }, [items, search, body, only3d])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, muscle or condition" className="rounded-xl pl-9" />
        </div>
        <button
          type="button"
          onClick={() => setOnly3d((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition active:scale-95',
            only3d ? 'border-rh-lime bg-rh-lime text-rh-ink dark:border-rh-lime dark:bg-rh-lime dark:text-rh-ink' : 'border-black/[0.08] hover:bg-rh-honeydew dark:border-white/10'
          )}
        >
          <Rotate3d className="h-4 w-4" /> 3D only
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BODY_FILTERS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBody(b)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition active:scale-95',
              body === b ? 'bg-rh-ink text-white dark:bg-white dark:text-rh-ink' : 'bg-rh-canvas text-neutral-600 hover:bg-rh-honeydew dark:bg-white/[0.05] dark:text-neutral-300'
            )}
          >
            {b}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">No exercises match. Try another search.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((entry) => {
            const isSelected = selected?.has(entry._id)
            const poster = entryPoster(entry)
            return (
              <li
                key={entry._id}
                className={cn(
                  'group relative overflow-hidden rounded-2xl border bg-white transition dark:bg-rh-ink-2',
                  isSelected ? 'border-rh-lime ring-2 ring-rh-lime/25 dark:border-rh-lime' : 'border-black/[0.05] hover:shadow-lift dark:border-white/[0.06]'
                )}
              >
                <button type="button" className="block w-full text-left" onClick={() => (onToggle ? onToggle(entry) : onPreview?.(entry))}>
                  <div className="relative aspect-square bg-pt-sunken">
                    {poster ? (
                      <Image
                        src={poster}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        unoptimized={!isLocalImage(poster)}
                        draggable={false}
                        className="object-contain p-2 transition group-hover:scale-[1.03]"
                      />
                    ) : entry.ownMedia ? (
                      <Camera className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-rh-ink/40" />
                    ) : (
                      <Dumbbell className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-rh-ink/40" />
                    )}
                    {!entry.animation && entry.ownMedia && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-rh-ink shadow-sm dark:bg-rh-ink-2/90 dark:text-rh-lime">
                        <Camera className="h-3 w-3" /> {entry.ownMedia.kind === 'video' ? 'Video' : 'Photos'}
                      </span>
                    )}
                    {entry.animation && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-rh-ink shadow-sm dark:bg-rh-ink-2/90 dark:text-rh-lime">
                        <Rotate3d className="h-3 w-3" /> 3D
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rh-lime text-rh-ink shadow-sm">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 p-3 pt-2">
                    <p className="line-clamp-1 text-sm font-semibold text-rh-ink dark:text-white">{entry.name}</p>
                    <p className="line-clamp-1 text-xs text-neutral-500">{entry.bodyParts.filter((b) => !['Legs', 'Arms'].includes(b)).join(' · ') || entry.bodyParts.join(' · ')}</p>
                    <div className="flex flex-wrap gap-1">
                      {entry.sided && <StatusBadge tone="neutral">Left / right</StatusBadge>}
                      {entry.animation?.status === 'draft' && <StatusBadge>Awaiting sign-off</StatusBadge>}
                    </div>
                  </div>
                </button>
                {onPreview && onToggle && (
                  <button
                    type="button"
                    onClick={() => onPreview(entry)}
                    className="absolute bottom-[4.4rem] right-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-medium text-rh-ink opacity-100 shadow-sm transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 dark:bg-rh-ink-2 dark:text-white"
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                )}
                {onToggle && <span className="sr-only">{isSelected ? 'Selected' : selectLabel}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
