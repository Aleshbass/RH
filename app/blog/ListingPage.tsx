import { notFound } from 'next/navigation'
import { JsonLd, ORGANIZATION_ID, WEBSITE_ID, breadcrumbNode } from '@/components/seo/StructuredData'
import { CategoryChips, EmptyBlog, PageShell, Pagination, PostCard, PostGrid } from '@/components/blog/parts'
import { BLOG_DESCRIPTION, BLOG_NAME, absoluteUrl, blogPaths, loadCategories, loadPosts } from '@/lib/blog/server'

/** /blog and /blog/page/<n>: newest posts, the first one large on page one. */
export async function BlogListing({ page }: { page: number }) {
  const [list, categories] = await Promise.all([loadPosts(page), loadCategories()])
  if (page > 1 && page > list.pageCount) notFound()
  const [first, ...rest] = list.posts
  const featured = page === 1 && first ? first : null
  const grid = featured ? rest : list.posts

  return (
    <PageShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Blog',
              '@id': `${absoluteUrl(blogPaths.index)}#blog`,
              name: BLOG_NAME,
              description: BLOG_DESCRIPTION,
              url: absoluteUrl(blogPaths.page(page)),
              inLanguage: 'en-NG',
              publisher: { '@id': ORGANIZATION_ID },
              isPartOf: { '@id': WEBSITE_ID },
              blogPost: list.posts.map((post) => ({
                '@type': 'BlogPosting',
                headline: post.title,
                url: absoluteUrl(blogPaths.post(post.slug)),
                datePublished: new Date(post.publishedAt).toISOString(),
                dateModified: new Date(post.updatedAt).toISOString(),
                ...(post.cover ? { image: post.cover.url } : {}),
                ...(post.author ? { author: { '@type': 'Person', name: post.author.name, url: absoluteUrl(blogPaths.author(post.author.slug)) } } : {}),
              })),
            },
            breadcrumbNode([
              { name: 'Home', url: absoluteUrl('/') },
              { name: 'Blog', url: absoluteUrl(blogPaths.index) },
            ]),
          ],
        }}
      />
      <div className="mx-auto max-w-6xl">
        <header className="max-w-3xl">
          <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">
            {page === 1 ? 'The Rehabify blog' : `The Rehabify blog, page ${page}`}
          </h1>
          <p className="mt-5 text-lg font-medium leading-relaxed text-rh-ink/70">{BLOG_DESCRIPTION}</p>
        </header>
        <div className="mt-8">
          <CategoryChips categories={categories} />
        </div>
        <div className="mt-8 space-y-5">
          {list.posts.length === 0 ? <EmptyBlog text="Our first articles are on the way. In the meantime, the answers to what people ask us most are in our FAQs." /> : null}
          {featured ? <PostCard post={featured} priority large /> : null}
          {grid.length > 0 ? <PostGrid posts={grid} priorityCount={featured ? 0 : 3} /> : null}
        </div>
        <Pagination page={page} pageCount={list.pageCount} />
      </div>
    </PageShell>
  )
}
