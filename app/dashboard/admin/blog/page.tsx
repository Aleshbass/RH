'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { ArrowUpRight, Clock, FileText, Loader2, Newspaper, Plus, Search, Send } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPage, EmptyState, FilterChips, PageHeader, Panel, StatTile, StatusBadge, inputClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { STATUS_LABEL, STATUS_TONE, blogApi, errorText, type PostRow } from '@/lib/blog/api'
import { imagekitTransform } from '@/lib/blog/content'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'drafts' | 'review' | 'scheduled' | 'live'

const FILTERS: Record<Filter, (p: PostRow) => boolean> = {
  all: () => true,
  drafts: (p) => p.status === 'draft' || p.status === 'changes_requested',
  review: (p) => p.status === 'in_review',
  scheduled: (p) => p.status === 'scheduled',
  live: (p) => p.isLive,
}

function PostListRow({ post }: { post: PostRow }) {
  const when =
    post.status === 'scheduled' && post.scheduledFor
      ? `Goes live ${formatDistanceToNow(post.scheduledFor, { addSuffix: true })}`
      : post.status === 'in_review' && post.submittedAt
        ? `Submitted ${formatDistanceToNow(post.submittedAt, { addSuffix: true })}`
        : `Edited ${formatDistanceToNow(post.updatedAt, { addSuffix: true })}`
  return (
    <li>
      <Link href={`/dashboard/admin/blog/${post._id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]">
        <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-rh-canvas sm:block dark:bg-white/5">
          {post.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ImageKit thumbnail
            <img src={imagekitTransform(post.coverUrl, { w: 200, q: 70 })} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-400">
              <FileText className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</StatusBadge>
            {post.isLive && post.status !== 'published' ? <StatusBadge tone="green">Live</StatusBadge> : null}
            {post.categoryName ? <span className="text-[11px] font-medium text-neutral-500">{post.categoryName}</span> : null}
          </div>
          <p className="mt-1 truncate text-[15px] font-semibold text-rh-ink dark:text-white">{post.title || 'Untitled post'}</p>
          <p className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">
            {post.mine ? 'You' : post.ownerName} · {when} · {post.wordCount.toLocaleString('en-NG')} words
          </p>
          {post.status === 'changes_requested' && post.reviewNote ? (
            <p className="mt-1 line-clamp-1 text-[12px] font-medium text-rose-600">Changes requested: {post.reviewNote}</p>
          ) : null}
        </div>
        {post.isLive && post.liveSlug ? (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault()
              window.open(`/blog/${post.liveSlug}`, '_blank', 'noopener')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') window.open(`/blog/${post.liveSlug}`, '_blank', 'noopener')
            }}
            className="hidden shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-neutral-500 hover:bg-white hover:text-rh-ink md:flex dark:hover:bg-white/10 dark:hover:text-white"
          >
            View <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </Link>
    </li>
  )
}

function BlogPosts() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const data = useQuery(blogApi.adminListPosts, {})
  const create = useMutation(blogApi.createPost)
  const [term, setTerm] = useState('')
  const [creating, setCreating] = useState(false)
  const raw = searchParams?.get('show') as Filter | null
  const filter: Filter = raw && raw in FILTERS ? raw : 'all'
  const setFilter = (next: Filter) => {
    const params = new URLSearchParams(searchParams?.toString())
    if (next === 'all') params.delete('show')
    else params.set('show', next)
    router.replace(`${pathname}${params.toString() ? `?${params}` : ''}`, { scroll: false })
  }

  const posts = useMemo(() => data?.posts ?? [], [data])
  const counts = useMemo(
    () => Object.fromEntries((Object.keys(FILTERS) as Filter[]).map((f) => [f, posts.filter(FILTERS[f]).length])) as Record<Filter, number>,
    [posts]
  )
  const shown = useMemo(() => {
    const q = term.trim().toLowerCase()
    return posts.filter(FILTERS[filter]).filter((p) => !q || `${p.title} ${p.slug} ${p.ownerName} ${p.categoryName ?? ''}`.toLowerCase().includes(q))
  }, [posts, filter, term])

  const isAdmin = data?.role === 'admin'

  const newPost = async () => {
    setCreating(true)
    try {
      const id = await create({})
      router.push(`/dashboard/admin/blog/${id}`)
    } catch (error) {
      toast.error(errorText(error))
      setCreating(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Blog"
        title={isAdmin ? 'Blog posts' : 'My posts'}
        description={
          isAdmin
            ? 'Write, review and publish articles for physioaroundme.com/blog.'
            : 'Write articles for physioaroundme.com/blog. When one is ready, submit it and an administrator will publish it.'
        }
        actions={
          <>
            <Button asChild variant="ghost" className={softButtonClass}>
              <Link href="/blog" target="_blank">
                View the blog <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button type="button" className={primaryButtonClass} onClick={newPost} disabled={creating}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
              New post
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Live on the site" value={data ? counts.live : '–'} icon={Newspaper} />
        <StatTile label="Waiting for review" value={data ? counts.review : '–'} icon={Send} tone={counts.review > 0 && isAdmin ? 'attention' : 'default'} />
        <StatTile label="Drafts" value={data ? counts.drafts : '–'} icon={FileText} />
        <StatTile label="Scheduled" value={data ? counts.scheduled : '–'} icon={Clock} />
      </div>

      <Panel
        title="Posts"
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search posts" className={cn(inputClass, 'h-9 pl-9')} />
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="px-5 pb-3">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'drafts', label: 'Drafts', count: counts.drafts },
              { value: 'review', label: 'In review', count: counts.review },
              { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
              { value: 'live', label: 'Live', count: counts.live },
            ]}
          />
        </div>
        {data === undefined ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Newspaper />}
            title={posts.length === 0 ? 'No posts yet' : 'Nothing here'}
            description={posts.length === 0 ? 'Start the first article. Type / in the editor to add pictures, lists, FAQs and more.' : 'Try another filter or search.'}
            action={
              posts.length === 0 ? (
                <Button type="button" className={primaryButtonClass} onClick={newPost} disabled={creating}>
                  <Plus className="mr-1.5 h-4 w-4" /> Write the first post
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {shown.map((post) => (
              <PostListRow key={post._id} post={post} />
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  )
}

export default function BlogPostsPage() {
  return (
    <Suspense fallback={null}>
      <BlogPosts />
    </Suspense>
  )
}
