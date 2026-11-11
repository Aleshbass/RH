import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd, WEBSITE_ID, breadcrumbNode } from '@/components/seo/StructuredData'
import { Breadcrumbs, CategoryChips, EmptyBlog, PageShell, PostGrid } from '@/components/blog/parts'
import { truncateDescription } from '@/lib/seo/utils'
import { absoluteUrl, blogMetadata, blogPaths, loadCategories, loadPosts } from '@/lib/blog/server'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

function describe(name: string, description?: string) {
  return truncateDescription(
    description?.trim() || `Articles about ${name.toLowerCase()} from Rehabify Health's physiotherapists: what helps, what to avoid, and when to get care.`,
    160
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const list = await loadPosts(1, slug)
  if (!list.found || !list.category) return { robots: { index: false, follow: true } }
  return blogMetadata({
    title: `${list.category.name}: articles and advice`,
    description: describe(list.category.name, list.category.description),
    path: blogPaths.category(slug),
    // A topic with no published posts yet is a thin page
    noIndex: list.total === 0,
  })
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params
  const [list, categories] = await Promise.all([loadPosts(1, slug), loadCategories()])
  if (!list.found || !list.category) notFound()
  const category = list.category
  const url = absoluteUrl(blogPaths.category(category.slug))

  return (
    <PageShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              '@id': url,
              url,
              name: category.name,
              description: describe(category.name, category.description),
              isPartOf: { '@id': WEBSITE_ID },
              mainEntity: {
                '@type': 'ItemList',
                itemListElement: list.posts.map((post, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  url: absoluteUrl(blogPaths.post(post.slug)),
                  name: post.title,
                })),
              },
            },
            breadcrumbNode([
              { name: 'Home', url: absoluteUrl('/') },
              { name: 'Blog', url: absoluteUrl(blogPaths.index) },
              { name: category.name, url },
            ]),
          ],
        }}
      />
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ name: 'Blog', href: blogPaths.index }, { name: category.name }]} />
        <header className="mt-6 max-w-3xl">
          <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">{category.name}</h1>
          {category.description ? <p className="mt-5 text-lg font-medium leading-relaxed text-rh-ink/70">{category.description}</p> : null}
        </header>
        <div className="mt-8">
          <CategoryChips categories={categories} active={category.slug} />
        </div>
        <div className="mt-8">
          {list.posts.length > 0 ? <PostGrid posts={list.posts} priorityCount={3} /> : <EmptyBlog text="There are no posts on this topic yet." />}
        </div>
      </div>
    </PageShell>
  )
}
