import Link from 'next/link'
import { ArrowLeft, ArrowRight } from '@/components/icons'
import type { BlogImage as BlogImageType, PostCard as PostCardData } from '@/lib/blog/api'
import { blogPaths } from '@/lib/blog/content'
import { BlogImage } from './BlogImage'

/** "12 November 2026", in Lagos time so a post published late at night shows the right day. */
export function formatPostDate(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(ms)
}

export const isoDate = (ms: number) => new Date(ms).toISOString()

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-rh-canvas px-4 pb-24 pt-28 text-rh-ink sm:px-6 sm:pt-36">{children}</div>
}

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm font-medium text-rh-ink/60">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>/</span> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-rh-ink">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="line-clamp-1 text-rh-ink/80">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function AuthorAvatar({ name, photo, size = 40 }: { name: string; photo?: BlogImageType | null; size?: number }) {
  if (photo?.url) {
    return (
      <BlogImage
        src={photo.url}
        alt=""
        width={size}
        height={size}
        sizes={`${size * 2}px`}
        className="shrink-0 rounded-full bg-rh-ink/5 object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-rh-lime font-bold text-rh-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

export function PostCard({ post, priority = false, large = false }: { post: PostCardData; priority?: boolean; large?: boolean }) {
  return (
    <article className={`group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white ${large ? 'lg:flex-row' : ''}`}>
      <Link href={blogPaths.post(post.slug)} className={`relative block shrink-0 overflow-hidden bg-rh-ink/5 ${large ? 'aspect-[16/9] lg:aspect-auto lg:w-[58%]' : 'aspect-[16/10]'}`} tabIndex={-1} aria-hidden>
        {post.cover ? (
          <BlogImage
            src={post.cover.url}
            alt=""
            fill
            priority={priority}
            sizes={large ? '(min-width: 1024px) 640px, 100vw' : '(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw'}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : null}
      </Link>
      <div className={`flex flex-1 flex-col p-6 ${large ? 'sm:p-8 lg:justify-center lg:p-10' : ''}`}>
        {post.category ? (
          <Link href={blogPaths.category(post.category.slug)} className="self-start text-[13px] font-bold uppercase tracking-wide text-rh-lime-deep hover:text-rh-ink">
            {post.category.name}
          </Link>
        ) : null}
        <h2 className={`mt-2 font-bold leading-tight tracking-tight ${large ? 'text-[28px] sm:text-[36px]' : 'text-[21px]'}`}>
          <Link href={blogPaths.post(post.slug)} className="hover:underline hover:decoration-rh-lime hover:decoration-2 hover:underline-offset-4">
            {post.title}
          </Link>
        </h2>
        <p className={`mt-3 text-rh-ink/70 ${large ? 'line-clamp-4 text-[17px] leading-relaxed' : 'line-clamp-3 text-[15px] leading-relaxed'}`}>{post.excerpt}</p>
        <div className="mt-auto flex items-center gap-3 pt-5 text-[13px] font-medium text-rh-ink/60">
          {post.author ? <AuthorAvatar name={post.author.name} photo={post.author.photo} size={28} /> : null}
          <span className="min-w-0">
            {post.author ? <span className="font-semibold text-rh-ink/80">{post.author.name} · </span> : null}
            <time dateTime={isoDate(post.publishedAt)}>{formatPostDate(post.publishedAt)}</time> · {post.readingMinutes} min read
          </span>
        </div>
      </div>
    </article>
  )
}

export function PostGrid({ posts, priorityCount = 0 }: { posts: PostCardData[]; priorityCount?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post, i) => (
        <PostCard key={post.slug} post={post} priority={i < priorityCount} />
      ))}
    </div>
  )
}

export function Pagination({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null
  const pill = 'inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors'
  return (
    <nav aria-label="Blog pages" className="mt-12 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={blogPaths.page(page - 1)} rel="prev" className={`${pill} bg-white hover:bg-white/70`}>
          <ArrowLeft className="h-4 w-4" /> Newer posts
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm font-medium text-rh-ink/60">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={blogPaths.page(page + 1)} rel="next" className={`${pill} bg-rh-ink text-white hover:bg-rh-ink-2`}>
          Older posts <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}

export function CategoryChips({ categories, active }: { categories: { slug: string; name: string }[]; active?: string }) {
  if (categories.length === 0) return null
  const chip = 'inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors'
  return (
    <nav aria-label="Blog topics" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      <Link href={blogPaths.index} className={`${chip} ${!active ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink hover:bg-white/70'}`}>
        All posts
      </Link>
      {categories.map((c) => (
        <Link
          key={c.slug}
          href={blogPaths.category(c.slug)}
          aria-current={active === c.slug ? 'page' : undefined}
          className={`${chip} ${active === c.slug ? 'bg-rh-ink text-white' : 'bg-white text-rh-ink hover:bg-white/70'}`}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  )
}

export function EmptyBlog({ text }: { text: string }) {
  return (
    <div className="rounded-[2rem] bg-white p-8 text-center sm:p-12">
      <p className="text-xl font-bold">Nothing here yet</p>
      <p className="mx-auto mt-2 max-w-md text-rh-ink/70">{text}</p>
      <Link href="/#faqs" className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink hover:bg-rh-lime-deep">
        Read the FAQs <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
