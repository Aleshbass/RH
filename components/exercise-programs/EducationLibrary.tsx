'use client'

/**
 * Education from the Rehabify Library (videos, hospital leaflets and pages, Rehabify's written
 * guides) for the care team: browse with search, body region and type, page by page, and open
 * any item in a drawer to watch or read it before sending it to a patient.
 */

import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  PlayCircle,
  Plus,
  Search,
  TriangleAlert,
  X,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VideoEmbed } from '@/components/media/VideoEmbed'
import { REGIONS, regionLabel } from '@/components/learn/course/shared'
import { fieldClass, InfoTip, PhysioDrawer, primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { cn } from '@/lib/utils'
import { PdfViewer } from './PdfViewer'
import type { LibraryResourceRow } from './types'

const libraryApi = (api as unknown as Record<string, Record<string, unknown>>).libraryResources

const PAGE_SIZE = 12

type KindFilter = 'all' | 'video' | 'leaflet' | 'page' | 'guide'

const LANG_LABEL = { en: 'English', yo: 'Yorùbá', ig: 'Igbo', ha: 'Hausa' } as const

type ResourceDetailData = LibraryResourceRow & {
  guides: { lang: keyof typeof LANG_LABEL; steps: string[]; stop?: string; status: 'reviewed' | 'draft' }[]
}

export function isLeaflet(row: Pick<LibraryResourceRow, 'kind' | 'url'>) {
  return row.kind === 'link' && /\.pdf(?:$|[?#])/i.test(row.url ?? '')
}

function kindOf(row: LibraryResourceRow): Exclude<KindFilter, 'all'> {
  if (row.kind === 'youtube') return 'video'
  if (row.kind === 'guide') return 'guide'
  return isLeaflet(row) ? 'leaflet' : 'page'
}

const KIND_LABEL: Record<Exclude<KindFilter, 'all'>, string> = {
  video: 'Video',
  leaflet: 'Leaflet',
  page: 'Web page',
  guide: 'Rehabify guide',
}

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'video', label: 'Videos' },
  { key: 'leaflet', label: 'Leaflets' },
  { key: 'page', label: 'Web pages' },
  { key: 'guide', label: 'Guides' },
]

export function resourceKindLabel(row: LibraryResourceRow) {
  return KIND_LABEL[kindOf(row)]
}

function KindTile({ row, className }: { row: LibraryResourceRow; className?: string }) {
  const kind = kindOf(row)
  if (kind === 'video' && row.youtubeId) {
    return (
      <span className={cn('relative block overflow-hidden bg-pt-sunken', className)}>
        <Image
          src={`https://i.ytimg.com/vi/${row.youtubeId}/mqdefault.jpg`}
          alt=""
          fill
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
          className="object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white">
            <PlayCircle className="h-5 w-5" />
          </span>
        </span>
      </span>
    )
  }
  const Icon = kind === 'leaflet' ? FileText : kind === 'guide' ? BookOpen : Globe
  return (
    <span className={cn('flex items-center justify-center', kind === 'guide' ? 'bg-pt-green-bg text-pt-green-fg' : 'bg-pt-violet-bg text-pt-violet-fg', className)}>
      <span className="flex flex-col items-center gap-1.5">
        <Icon className="h-7 w-7" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{kind === 'leaflet' ? 'PDF leaflet' : KIND_LABEL[kind]}</span>
      </span>
    </span>
  )
}

function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ink' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'ink' ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-ink'
      )}
    >
      {children}
    </span>
  )
}

function RedFlags({ region }: { region: string }) {
  const flags = useQueryUntyped(libraryApi.redFlagsFor, { region }) as { region: string; items: string[] } | null | undefined
  if (!flags || flags.items.length === 0) return null
  return (
    <div className="rounded-2xl bg-pt-rose-bg p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-pt-rose-fg">
        <TriangleAlert className="h-4 w-4" />
        Red flags: {flags.region === 'general' ? 'any region' : regionLabel(flags.region).toLowerCase()}
      </p>
      <p className="mt-1 text-xs text-pt-muted">Stop and refer on if your patient reports any of these.</p>
      <ul className="mt-2.5 space-y-1.5 text-sm text-pt-ink">
        {flags.items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-pt-rose-fg" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Everything about one item: the video or leaflet itself, the summary the patient gets, red flags. */
export function ResourceDetail({ item }: { item: LibraryResourceRow }) {
  const detail = useQueryUntyped(libraryApi.getResource, { key: item.key }) as ResourceDetailData | null | undefined
  const [lang, setLang] = useState<keyof typeof LANG_LABEL>('en')
  useEffect(() => setLang('en'), [item.key])
  const guides = detail?.guides ?? []
  const guide = guides.find((g) => g.lang === lang) ?? guides[0]
  const kind = kindOf(item)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="ink">{KIND_LABEL[kind]}</Chip>
        <Chip>{regionLabel(item.region)}</Chip>
        <Chip>{item.type}</Chip>
      </div>

      {item.youtubeId && (
        <div className="overflow-hidden rounded-3xl bg-black">
          <VideoEmbed youtubeId={item.youtubeId} />
        </div>
      )}

      {kind === 'leaflet' && <PdfViewer docKey={item.key} sourceUrl={item.url} sourceName={item.source} />}

      {kind === 'page' && item.url && (
        <div className="rounded-2xl border border-pt-line p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
            <Globe className="h-4 w-4 text-pt-muted" />
            A web page on {item.source}
            <InfoTip>
              {item.source} doesn’t allow its pages to be shown inside other apps, so this one opens on their site. Your patient sees the summary below in
              their app, with the same link.
            </InfoTip>
          </p>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-pt-line-strong bg-pt-surface px-3 py-2 text-sm font-medium text-pt-ink transition-colors hover:bg-pt-hover"
          >
            <ExternalLink className="h-4 w-4" />
            Open on {item.source}
          </a>
        </div>
      )}

      {detail === undefined ? (
        <div className="h-24 animate-pulse rounded-2xl bg-pt-sunken" />
      ) : (
        guide && (
          <section>
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">
              What your patient reads
              <InfoTip>Shown with this item in your patient’s app. Translations stay marked as drafts until a clinician has checked them.</InfoTip>
            </p>
            {guides.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {guides.map((g) => (
                  <button
                    key={g.lang}
                    type="button"
                    onClick={() => setLang(g.lang)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition',
                      g.lang === guide.lang ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted hover:text-pt-ink'
                    )}
                  >
                    {LANG_LABEL[g.lang]}
                    {g.status === 'draft' && ' · draft'}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 rounded-2xl bg-pt-sunken p-4">
              {guide.steps.length > 1 ? (
                <ol className="space-y-2 text-sm leading-6 text-pt-ink">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-5 shrink-0 text-right font-semibold text-pt-faint">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm leading-6 text-pt-ink">{guide.steps[0]}</p>
              )}
              {guide.stop && (
                <p className="mt-3 rounded-xl bg-pt-rose-bg px-3 py-2 text-sm text-pt-ink">
                  <span className="font-semibold text-pt-rose-fg">Stop if: </span>
                  {guide.stop}
                </p>
              )}
            </div>
          </section>
        )
      )}

      <RedFlags region={item.region} />

      <p className="text-xs text-pt-faint">
        {item.condition} · Source: {item.source}
      </p>
    </div>
  )
}

/** One item in a drawer, with an action in the footer (add to a programme, send to a patient). */
export function ResourceDrawer({
  item,
  onClose,
  footer,
}: {
  item: LibraryResourceRow | null
  onClose: () => void
  footer?: (item: LibraryResourceRow) => ReactNode
}) {
  // Keep the last item on screen while the drawer slides away
  const [shown, setShown] = useState<LibraryResourceRow | null>(item)
  useEffect(() => {
    if (item) setShown(item)
  }, [item])
  if (!shown) return null
  return (
    <PhysioDrawer
      open={item !== null}
      onOpenChange={(open) => !open && onClose()}
      title={shown.title}
      description={`${shown.condition} · ${shown.source}`}
      className="sm:max-w-2xl"
      footer={footer?.(shown)}
    >
      <ResourceDetail item={shown} />
    </PhysioDrawer>
  )
}

/**
 * The education browser. `mode="pick"` (inside "Send exercises") shows Add on each item;
 * `mode="browse"` (the Library page) opens items with "Send to a patient".
 */
export function EducationBrowser({
  mode,
  added,
  onAdd,
  onSend,
}: {
  mode: 'browse' | 'pick'
  added?: Set<string>
  onAdd?: (row: LibraryResourceRow) => void
  onSend?: (row: LibraryResourceRow) => void
}) {
  const rows = useQueryUntyped(libraryApi.listResources, {}) as LibraryResourceRow[] | null | undefined
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<string | null>(null)
  const [kind, setKind] = useState<KindFilter>('all')
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<LibraryResourceRow | null>(null)
  const search = useDeferredValue(query.trim().toLowerCase())

  const inScope = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !region || r.region === region)
        .filter((r) => {
          if (!search) return true
          const text = `${r.title} ${r.condition} ${r.source} ${r.tags.join(' ')} ${regionLabel(r.region)}`.toLowerCase()
          return search.split(/\s+/).every((word) => text.includes(word))
        }),
    [rows, region, search]
  )
  const counts = useMemo(() => {
    const c: Record<KindFilter, number> = { all: inScope.length, video: 0, leaflet: 0, page: 0, guide: 0 }
    for (const r of inScope) c[kindOf(r)]++
    return c
  }, [inScope])
  const list = kind === 'all' ? inScope : inScope.filter((r) => kindOf(r) === kind)
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = list.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  // Any change of filter starts from the first page
  useEffect(() => setPage(0), [search, region, kind])

  if (rows === null) {
    return <p className="py-10 text-center text-sm text-pt-muted">The Rehabify Library opens once your account is approved.</p>
  }

  const isAdded = (row: LibraryResourceRow) => added?.has(row.key) ?? false
  const addButton = (row: LibraryResourceRow, size: 'sm' | 'lg') =>
    isAdded(row) ? (
      <Button size="sm" disabled className={cn(secondaryButtonClass, size === 'lg' ? 'h-11 w-full' : 'h-8 px-3')}>
        <Check className="mr-1 h-3.5 w-3.5" />
        Added
      </Button>
    ) : (
      <Button size="sm" className={cn(primaryButtonClass, size === 'lg' ? 'h-11 w-full' : 'h-8 px-3')} onClick={() => onAdd?.(row)}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        {size === 'lg' ? 'Add to the programme' : 'Add'}
      </Button>
    )

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pt-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by condition or title, e.g. knee osteoarthritis"
          aria-label="Search the education library"
          className={cn(fieldClass, 'h-11 pl-9 pr-9')}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-pt-muted hover:bg-pt-hover"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{ key: null as string | null, label: 'All regions' }, ...REGIONS].map((r) => (
          <button
            key={r.key ?? 'all'}
            type="button"
            onClick={() => setRegion(r.key)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition',
              region === r.key ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted hover:text-pt-ink'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-pt-sunken p-1 sm:w-fit">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setKind(tab.key)}
            aria-pressed={kind === tab.key}
            className={cn(
              'rounded-xl px-3 py-1.5 text-sm font-medium transition',
              kind === tab.key ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs tabular-nums text-pt-faint">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {rows === undefined ? (
        <div className="flex items-center gap-2 py-10 text-sm text-pt-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading the library…
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-sm text-pt-muted">Nothing matches. Try another word, region or type.</p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((row) => (
              <li key={row.key} className="flex flex-col overflow-hidden rounded-2xl border border-pt-line bg-pt-surface transition hover:shadow-pt">
                <button type="button" onClick={() => setOpen(row)} className="text-left focus-visible:outline-none" aria-label={`Preview ${row.title}`}>
                  <KindTile row={row} className="aspect-video w-full" />
                </button>
                <div className="flex flex-1 flex-col p-3">
                  <button type="button" onClick={() => setOpen(row)} className="text-left">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-pt-ink">{row.title}</span>
                  </button>
                  <span className="mt-1 truncate text-xs text-pt-muted">
                    {resourceKindLabel(row)} · {regionLabel(row.region)} · {row.source}
                  </span>
                  <div className="mt-auto flex items-center gap-2 pt-3">
                    <Button size="sm" className={cn(secondaryButtonClass, 'h-8 px-3')} onClick={() => setOpen(row)}>
                      {kindOf(row) === 'video' ? <PlayCircle className="mr-1 h-3.5 w-3.5" /> : <FileText className="mr-1 h-3.5 w-3.5" />}
                      {kindOf(row) === 'video' ? 'Watch' : 'Read'}
                    </Button>
                    {mode === 'pick' && addButton(row, 'sm')}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs tabular-nums text-pt-muted">
              {current * PAGE_SIZE + 1}–{Math.min(list.length, (current + 1) * PAGE_SIZE)} of {list.length}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button size="sm" className={cn(secondaryButtonClass, 'h-9 w-9 p-0')} disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-sm tabular-nums text-pt-ink">
                  Page {current + 1} of {pages}
                </span>
                <Button size="sm" className={cn(secondaryButtonClass, 'h-9 w-9 p-0')} disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ResourceDrawer
        item={open}
        onClose={() => setOpen(null)}
        footer={(row) =>
          mode === 'pick' ? (
            addButton(row, 'lg')
          ) : onSend ? (
            <Button className={cn(primaryButtonClass, 'h-11 w-full')} onClick={() => onSend(row)}>
              Send to a patient
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}
