import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd, breadcrumbNode } from '@/components/seo/StructuredData'
import { AuthorAvatar, Breadcrumbs, EmptyBlog, PageShell, PostGrid } from '@/components/blog/parts'
import { truncateDescription } from '@/lib/seo/utils'
import { absoluteUrl, blogMetadata, blogPaths, loadPosts } from '@/lib/blog/server'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return []
}

function hostOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const list = await loadPosts(1, undefined, slug)
  if (!list.found || !list.author) return { robots: { index: false, follow: true } }
  const a = list.author
  return blogMetadata({
    title: `${a.name}${a.credentials ? `, ${a.credentials}` : ''}`,
    description: truncateDescription(a.bio?.trim() || `Articles written and reviewed by ${a.name} for the Rehabify Health blog.`, 160),
    path: blogPaths.author(slug),
    ogType: 'profile',
    noIndex: list.total === 0,
  })
}

export default async function BlogAuthorPage({ params }: Props) {
  const { slug } = await params
  const list = await loadPosts(1, undefined, slug)
  if (!list.found || !list.author) notFound()
  const a = list.author
  const url = absoluteUrl(blogPaths.author(a.slug))

  return (
    <PageShell>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'ProfilePage',
              '@id': url,
              url,
              mainEntity: {
                '@type': 'Person',
                name: a.name,
                url,
                ...(a.credentials ? { jobTitle: a.credentials } : {}),
                ...(a.bio ? { description: a.bio } : {}),
                ...(a.photo?.url ? { image: a.photo.url } : {}),
                ...(a.sameAs.length ? { sameAs: a.sameAs } : {}),
              },
            },
            breadcrumbNode([
              { name: 'Home', url: absoluteUrl('/') },
              { name: 'Blog', url: absoluteUrl(blogPaths.index) },
              { name: a.name, url },
            ]),
          ],
        }}
      />
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ name: 'Blog', href: blogPaths.index }, { name: a.name }]} />
        <header className="mt-6 flex flex-col gap-6 rounded-[2rem] bg-white p-7 sm:flex-row sm:items-center sm:p-10">
          <AuthorAvatar name={a.name} photo={a.photo} size={112} />
          <div className="min-w-0">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight sm:text-5xl">{a.name}</h1>
            {a.credentials ? <p className="mt-2 text-lg font-semibold text-rh-ink/70">{a.credentials}</p> : null}
            {a.bio ? <p className="mt-4 max-w-2xl whitespace-pre-line text-[16px] leading-relaxed text-rh-ink/75">{a.bio}</p> : null}
            {a.sameAs.length > 0 ? (
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                {a.sameAs.map((link) => (
                  <li key={link}>
                    <a href={link} target="_blank" rel="noopener noreferrer me" className="underline decoration-rh-lime decoration-2 underline-offset-4">
                      {hostOf(link)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>
        <h2 className="mt-12 text-[26px] font-bold tracking-tight">Articles</h2>
        <div className="mt-5">
          {list.posts.length > 0 ? <PostGrid posts={list.posts} priorityCount={3} /> : <EmptyBlog text="No published articles yet." />}
        </div>
      </div>
    </PageShell>
  )
}
