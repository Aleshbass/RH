'use client'

/**
 * The study library on the course page: our 3D exercises first, then the founder's videos,
 * web pages and written guides. Search and body-region chips; tapping opens the drawer.
 */

import { useDeferredValue, useMemo, useState } from 'react'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { Library, Loader2, Rotate3d, Search, X } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { posterUrl } from '@/convex/exerciseLibraryCatalog'
import { cn } from '@/lib/utils'
import { fieldClass } from '../shared'
import { EmptyNote, exerciseRegions, eyebrowClass, REGIONS, regionLabel, type StudyLibraryData, type StudyResource } from './shared'
import { ResourceIcon, resourceKindLabel, StudyRow, type StudyPanel } from './StudyDrawer'

type Kind = 'all' | '3d' | 'video' | 'reading'

const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: '3d', label: '3D exercises' },
  { key: 'video', label: 'Videos' },
  { key: 'reading', label: 'Pages & guides' },
]

const PAGE = 40

export function StudyLibrary({ open, accessUntil }: { open: (panel: StudyPanel) => void; accessUntil: string | null }) {
  const library = useQuery(api.exerciseLibrary.listLibrary, {}) as StudyLibraryData | null | undefined
  const resources = useQuery(api.libraryResources.listResources, {}) as StudyResource[] | null | undefined
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('all')
  const [limit, setLimit] = useState(PAGE)
  const search = useDeferredValue(query.trim().toLowerCase())

  const exercises = useMemo(() => {
    if (kind === 'video' || kind === 'reading') return []
    return (library?.items ?? [])
      .filter((e) => e.animation)
      .filter((e) => !region || exerciseRegions(e).includes(region))
      .filter((e) => !search || `${e.name} ${e.conditions.join(' ')} ${e.bodyParts.join(' ')} ${e.targetMuscles.join(' ')}`.toLowerCase().includes(search))
  }, [library, region, search, kind])

  const reading = useMemo(() => {
    if (kind === '3d') return []
    return (resources ?? [])
      .filter((r) => (kind === 'video' ? r.kind === 'youtube' : kind === 'reading' ? r.kind !== 'youtube' : true))
      .filter((r) => !region || r.region === region)
      .filter((r) => !search || `${r.title} ${r.condition} ${r.source} ${r.tags.join(' ')}`.toLowerCase().includes(search))
  }, [resources, region, search, kind])

  const loading = library === undefined || resources === undefined
  // Signed in but the account is still being set up, or the course access just ended
  const unavailable = library === null && resources === null

  if (unavailable) {
    return (
      <EmptyNote icon={Library} title="The library isn't open on this account">
        It opens for physios on a paid Rehabify Learn course. If you&apos;ve just signed in, give it a moment.
      </EmptyNote>
    )
  }

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-4 bg-rh-cream/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="Search exercises, conditions, videos…"
            aria-label="Search the library"
            className={cn(fieldClass, 'pl-11 pr-11')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-rh-ink/50 hover:bg-rh-sand"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
          {[{ key: null, label: 'All regions' }, ...REGIONS].map((r) => (
            <button
              key={r.key ?? 'all'}
              type="button"
              onClick={() => {
                setRegion(r.key)
                setLimit(PAGE)
              }}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                region === r.key ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink/70 ring-1 ring-inset ring-rh-ink/[0.08] hover:text-rh-ink'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => {
                setKind(k.key)
                setLimit(PAGE)
              }}
              className={cn(
                'relative shrink-0 py-1.5 text-sm font-medium transition',
                kind === k.key ? 'text-rh-ink' : 'text-rh-ink/50 hover:text-rh-ink/80'
              )}
            >
              {k.label}
              {kind === k.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-rh-lime" />}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-rh-ink/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the library…
        </div>
      ) : (
        <>
          {exercises.length > 0 && (
            <section className="mt-5">
              <h2 className={eyebrowClass}>
                3D exercises · {exercises.length}
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {exercises.map((e) => {
                  const clip = e.animation?.clips[0]
                  return (
                    <button
                      key={e._id}
                      type="button"
                      onClick={() => open({ kind: 'exercise', item: e })}
                      className="group overflow-hidden rounded-[1.5rem] bg-white text-left transition hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.99]"
                    >
                      <span className="relative block aspect-square bg-rh-sand">
                        {clip && (
                          <Image
                            src={posterUrl(clip.id)}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 220px, (min-width: 640px) 30vw, 45vw"
                            className="object-contain p-3 transition duration-300 group-hover:scale-[1.03]"
                          />
                        )}
                        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-rh-ink px-2 py-0.5 text-[10px] font-semibold text-rh-lime">
                          <Rotate3d className="h-3 w-3" /> 3D
                        </span>
                      </span>
                      <span className="block p-3">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug text-rh-ink">{e.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-rh-ink/50">{exerciseRegions(e).map(regionLabel).join(', ')}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {reading.length > 0 && (
            <section className="mt-7">
              <h2 className={eyebrowClass}>
                Videos, pages and guides · {reading.length}
              </h2>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {reading.slice(0, limit).map((r) => (
                  <StudyRow
                    key={r.key}
                    icon={<ResourceIcon kind={r.kind} className="h-4 w-4" />}
                    title={r.title}
                    meta={`${resourceKindLabel(r.kind)} · ${regionLabel(r.region)} · ${r.condition}`}
                    onClick={() => open({ kind: 'resource', item: r })}
                  />
                ))}
              </div>
              {reading.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE)}
                  className="mx-auto mt-4 flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:ring-rh-ink/25"
                >
                  Show more ({reading.length - limit} left)
                </button>
              )}
            </section>
          )}

          {exercises.length === 0 && reading.length === 0 && (
            <div className="mt-6">
              <EmptyNote icon={Search} title="Nothing matches">
                Try another word or region.
              </EmptyNote>
            </div>
          )}

          {accessUntil && <p className="mt-8 text-center text-xs text-rh-ink/45">Your library access runs until {accessUntil}.</p>}
        </>
      )}
    </div>
  )
}
