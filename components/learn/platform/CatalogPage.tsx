'use client'

/** All courses (/courses on learn.*): search, topic, type and sort, all kept in the URL. */

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, SearchX, X } from '@/components/icons'
import { categoryLabel, COURSE_CATEGORIES, isCourseCategory } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { displayFont, pillInk } from '../shared'
import { CourseCard, CourseCardSkeleton, matchesQuery, useCatalog, type CatalogItem } from './catalog'
import { useLearnerIdentity } from './identity'
import { learnPath, MY_LEARNING_PATH } from './learnApi'

const TYPES = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live programs' },
  { id: 'video', label: 'Video courses' },
  { id: 'free', label: 'Free' },
] as const
type TypeId = (typeof TYPES)[number]['id']

const SORTS = [
  { id: 'popular', label: 'Most popular' },
  { id: 'newest', label: 'Newest' },
] as const
type SortId = (typeof SORTS)[number]['id']

function byType(item: CatalogItem, type: TypeId) {
  if (type === 'live') return item.isLive
  if (type === 'video') return item.kind === 'video'
  if (type === 'free') return item.isFree
  return true
}

export function CatalogPage() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const identity = useLearnerIdentity()
  const items = useCatalog()

  const q = params.get('q') ?? ''
  const rawCategory = params.get('category')
  const category = isCourseCategory(rawCategory) ? rawCategory : null
  const type = (TYPES.find((t) => t.id === params.get('type'))?.id ?? 'all') as TypeId
  const sort = (SORTS.find((s) => s.id === params.get('sort'))?.id ?? 'popular') as SortId
  const [draft, setDraft] = useState(q)

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setParam('q', draft.trim() || null)
  }

  const results = useMemo(() => {
    if (!items) return undefined
    const filtered = items.filter((i) => (!category || i.category === category) && byType(i, type) && matchesQuery(i, q))
    return [...filtered].sort((a, b) =>
      sort === 'newest' ? b.createdAt - a.createdAt : Number(b.isLive) - Number(a.isLive) || b.learners - a.learners || b.createdAt - a.createdAt
    )
  }, [items, category, type, q, sort])

  const heading = category ? categoryLabel(category) : type === 'live' ? 'Live programs' : type === 'free' ? 'Free courses' : 'All courses'
  const filtered = Boolean(q || category || type !== 'all')

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>{heading}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-rh-ink/60">Practical courses for physiotherapists and physio students. Learn at your own pace or with a live cohort.</p>
        </div>
        <form role="search" onSubmit={submit} className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/45" />
          <label htmlFor="catalog-search" className="sr-only">
            Search courses
          </label>
          <input
            id="catalog-search"
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search courses"
            className="h-12 w-full rounded-full border border-rh-ink/10 bg-white pl-11 pr-24 text-[15px] text-rh-ink placeholder:text-rh-ink/40 focus:border-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
          />
          <button type="submit" className={cn(pillInk, 'absolute right-1 top-1 h-10 px-4')}>
            Search
          </button>
        </form>
      </div>

      {/* Topics */}
      <div className="-mx-4 mt-8 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => setParam('category', null)}
            className={cn(
              'h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition',
              !category ? 'bg-rh-ink text-white' : 'border border-rh-ink/10 text-rh-ink hover:border-rh-ink/30'
            )}
          >
            All topics
          </button>
          {COURSE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setParam('category', category === c.id ? null : c.id)}
              className={cn(
                'h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition',
                category === c.id ? 'bg-rh-ink text-white' : 'border border-rh-ink/10 text-rh-ink hover:border-rh-ink/30'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type + sort */}
      <div className="mt-6 flex flex-col gap-3 border-b border-rh-ink/[0.08] sm:flex-row sm:items-center sm:justify-between">
        <div className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setParam('type', t.id === 'all' ? null : t.id)}
              className={cn(
                'shrink-0 border-b-2 pb-3 text-sm font-semibold transition',
                type === t.id ? 'border-rh-ink text-rh-ink' : 'border-transparent text-rh-ink/50 hover:text-rh-ink'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 pb-3 text-sm text-rh-ink/55">
          Sort
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value === 'popular' ? null : e.target.value)}
            className="rounded-full border border-rh-ink/10 bg-white px-3 py-1.5 text-sm font-semibold text-rh-ink focus:outline-none focus:ring-2 focus:ring-rh-ink/20"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q && (
        <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-rh-ink/65">
          Results for <span className="font-semibold text-rh-ink">“{q}”</span>
          <button
            type="button"
            onClick={() => {
              setDraft('')
              setParam('q', null)
            }}
            className="inline-flex items-center gap-1 rounded-full bg-rh-ink/[0.06] px-2.5 py-1 text-xs font-semibold text-rh-ink hover:bg-rh-ink/10"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </p>
      )}

      <div className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results === undefined
          ? [0, 1, 2, 3].map((i) => <CourseCardSkeleton key={i} />)
          : results.map((item, i) => <CourseCard key={item.key} item={item} priority={i < 2} />)}
      </div>

      {results !== undefined && results.length === 0 && (
        <div className="mx-auto mt-4 max-w-md rounded-[2rem] bg-rh-cream px-6 py-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-rh-ink/40" />
          <h2 className={cn('mt-4 text-2xl tracking-tight text-rh-ink', displayFont)}>{filtered ? 'Nothing here yet' : 'Courses are on the way'}</h2>
          <p className="mt-2 text-[15px] text-rh-ink/60">
            {category ? `${categoryLabel(category)} courses are coming soon.` : 'Try another word or topic.'}
          </p>
          {filtered && (
            <Link href={learnPath('/courses')} onClick={() => setDraft('')} className={cn(pillInk, 'mt-6')}>
              See all courses
            </Link>
          )}
        </div>
      )}

      {identity?.signedIn && (
        <p className="mt-14 text-center text-sm text-rh-ink/60">
          Already enrolled?{' '}
          <Link href={MY_LEARNING_PATH} className="font-semibold text-rh-ink underline-offset-4 hover:underline">
            Go to My learning
          </Link>
        </p>
      )}
    </main>
  )
}
