import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ArrowRight, BadgeCheck } from '@/components/icons'
import { JsonLd, ORGANIZATION_ID, WEBSITE_ID, breadcrumbNode, faqPageNode, organizationNode } from '@/components/seo/StructuredData'
import { BlogImage } from '@/components/blog/BlogImage'
import { PostBody } from '@/components/blog/PostBody'
import { ShareButtons } from '@/components/blog/ShareButtons'
import { TableOfContents } from '@/components/blog/TableOfContents'
import { AuthorAvatar, Breadcrumbs, PageShell, PostGrid, formatPostDate, isoDate } from '@/components/blog/parts'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import type { PublicAuthor, PublicPost } from '@/lib/blog/api'
import { faqItems, outline, parseBody } from '@/lib/blog/content'
import { documentTitle, effectiveMetaDescription, effectiveMetaTitle } from '@/lib/blog/seo'
import { BLOG_NAME, absoluteUrl, blogMetadata, blogPaths, coverOgImage, loadPost } from '@/lib/blog/server'

// The root layout reads request headers, so this renders on each request (always current).
// No generateStaticParams: it would mark the route static and fail at runtime.
export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await loadPost(slug)
  if (!result || result.kind !== 'post') return { robots: { index: false, follow: true } }
  const post = result.post
  const metaTitle = effectiveMetaTitle({ title: post.title, metaTitle: post.seo.metaTitle })
  const description = effectiveMetaDescription({ excerpt: post.excerpt, metaDescription: post.seo.metaDescription })
  const path = blogPaths.post(post.slug)
  const image = coverOgImage(post.cover)
  const base = blogMetadata({ title: metaTitle, description, path, ogImage: image, ogType: 'article', noIndex: post.seo.noindex === true })
  return {
    ...base,
    title: { absolute: documentTitle(metaTitle) },
    authors: post.authorFull ? [{ name: post.authorFull.name, url: blogPaths.author(post.authorFull.slug) }] : undefined,
    keywords: post.tags.length ? post.tags : undefined,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      title: metaTitle,
      publishedTime: isoDate(post.publishedAt),
      modifiedTime: isoDate(post.updatedAt),
      authors: post.authorFull ? [absoluteUrl(blogPaths.author(post.authorFull.slug))] : undefined,
      section: post.category?.name,
      tags: post.tags,
    },
    twitter: { ...base.twitter, title: metaTitle },
  }
}

function personNode(person: PublicAuthor) {
  return {
    '@type': 'Person',
    name: person.name,
    url: absoluteUrl(blogPaths.author(person.slug)),
    ...(person.credentials ? { jobTitle: person.credentials } : {}),
    ...(person.photo?.url ? { image: person.photo.url } : {}),
    ...(person.sameAs.length ? { sameAs: person.sameAs } : {}),
  }
}

function PostSchema({ post, faqs }: { post: PublicPost; faqs: { question: string; answer: string }[] }) {
  const url = absoluteUrl(blogPaths.post(post.slug))
  const description = effectiveMetaDescription({ excerpt: post.excerpt, metaDescription: post.seo.metaDescription })
  const crumbs = [
    { name: 'Home', url: absoluteUrl('/') },
    { name: 'Blog', url: absoluteUrl(blogPaths.index) },
    ...(post.category ? [{ name: post.category.name, url: absoluteUrl(blogPaths.category(post.category.slug)) }] : []),
    { name: post.title, url },
  ]
  const graph: Record<string, unknown>[] = [
    organizationNode(),
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: post.title,
      description,
      inLanguage: 'en-NG',
      isPartOf: { '@id': WEBSITE_ID },
      breadcrumb: { '@id': `${url}#breadcrumb` },
      ...(post.cover ? { primaryImageOfPage: { '@type': 'ImageObject', url: post.cover.url } } : {}),
      ...(post.reviewer ? { reviewedBy: personNode(post.reviewer), lastReviewed: isoDate(post.updatedAt).slice(0, 10) } : {}),
    },
    {
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      headline: post.title.slice(0, 110),
      description,
      url,
      mainEntityOfPage: { '@id': url },
      datePublished: isoDate(post.publishedAt),
      dateModified: isoDate(post.updatedAt),
      inLanguage: 'en-NG',
      wordCount: post.wordCount,
      ...(post.cover ? { image: [post.cover.url] } : {}),
      ...(post.authorFull ? { author: personNode(post.authorFull) } : { author: { '@id': ORGANIZATION_ID } }),
      publisher: { '@id': ORGANIZATION_ID },
      isPartOf: { '@type': 'Blog', '@id': `${absoluteUrl(blogPaths.index)}#blog`, name: BLOG_NAME },
      ...(post.category ? { articleSection: post.category.name } : {}),
      ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
    },
    { ...breadcrumbNode(crumbs), '@id': `${url}#breadcrumb` },
  ]
  if (faqs.length > 0) graph.push({ ...faqPageNode(faqs), '@id': `${url}#faq` })
  return <JsonLd data={{ '@context': 'https://schema.org', '@graph': graph }} />
}

function AuthorBox({ author, reviewer }: { author: PublicAuthor | null; reviewer: PublicAuthor | null }) {
  if (!author && !reviewer) return null
  return (
    <section aria-label="About the author" className="mt-12 space-y-4">
      {[author ? { person: author, label: 'Written by' } : null, reviewer ? { person: reviewer, label: 'Medically reviewed by' } : null]
        .filter((x): x is { person: PublicAuthor; label: string } => Boolean(x))
        .map(({ person, label }) => (
          <div key={label} className="flex gap-4 rounded-[1.75rem] bg-white p-6 sm:p-7">
            <AuthorAvatar name={person.name} photo={person.photo} size={56} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold uppercase tracking-wide text-rh-ink/50">{label}</p>
              <p className="mt-0.5 text-lg font-bold">
                <Link href={blogPaths.author(person.slug)} className="hover:underline hover:decoration-rh-lime hover:decoration-2 hover:underline-offset-4">
                  {person.name}
                </Link>
              </p>
              {person.credentials ? <p className="text-sm font-medium text-rh-ink/70">{person.credentials}</p> : null}
              {person.bio ? <p className="mt-2 line-clamp-4 text-[15px] leading-relaxed text-rh-ink/75">{person.bio}</p> : null}
            </div>
          </div>
        ))}
    </section>
  )
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const result = await loadPost(slug)
  if (!result) notFound()
  if (result.kind === 'redirect') permanentRedirect(blogPaths.post(result.slug))

  const { post, related } = result
  const doc = parseBody(post.body)
  const toc = outline(doc)
  const faqs = faqItems(doc)
  const url = absoluteUrl(blogPaths.post(post.slug))
  const updated = post.updatedAt - post.publishedAt > 24 * 60 * 60 * 1000

  return (
    <PageShell>
      <PostSchema post={post} faqs={faqs} />
      <article className="mx-auto max-w-6xl">
        <Breadcrumbs
          items={[
            { name: 'Blog', href: blogPaths.index },
            ...(post.category ? [{ name: post.category.name, href: blogPaths.category(post.category.slug) }] : []),
            { name: post.title },
          ]}
        />

        <header className="mt-6 max-w-3xl">
          {post.category ? (
            <Link href={blogPaths.category(post.category.slug)} className="text-[13px] font-bold uppercase tracking-wide text-rh-lime-deep hover:text-rh-ink">
              {post.category.name}
            </Link>
          ) : null}
          <h1 className="mt-3 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-5xl">{post.title}</h1>
          <p className="mt-5 text-lg font-medium leading-relaxed text-rh-ink/70 sm:text-xl">{post.excerpt}</p>

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            {post.authorFull ? (
              <Link href={blogPaths.author(post.authorFull.slug)} className="flex items-center gap-3">
                <AuthorAvatar name={post.authorFull.name} photo={post.authorFull.photo} size={40} />
                <span>
                  <span className="block font-semibold">{post.authorFull.name}</span>
                  {post.authorFull.credentials ? <span className="block text-rh-ink/60">{post.authorFull.credentials}</span> : null}
                </span>
              </Link>
            ) : null}
            {post.reviewer ? (
              <Link href={blogPaths.author(post.reviewer.slug)} className="flex items-center gap-2 font-medium text-rh-ink/80">
                <BadgeCheck className="h-4 w-4 text-rh-lime-deep" />
                Medically reviewed by <span className="font-semibold text-rh-ink">{post.reviewer.name}</span>
              </Link>
            ) : null}
            <span className="font-medium text-rh-ink/60">
              {updated ? (
                <>
                  Updated <time dateTime={isoDate(post.updatedAt)}>{formatPostDate(post.updatedAt)}</time>
                </>
              ) : (
                <time dateTime={isoDate(post.publishedAt)}>{formatPostDate(post.publishedAt)}</time>
              )}{' '}
              · {post.readingMinutes} min read
            </span>
          </div>
        </header>

        {post.cover ? (
          <figure className="mt-10">
            <BlogImage
              src={post.cover.url}
              alt={post.cover.alt}
              width={post.cover.width ?? 1600}
              height={post.cover.height ?? 900}
              priority
              sizes="(min-width: 1152px) 1152px, 100vw"
              className="max-h-[560px] w-full rounded-[2rem] bg-rh-ink/5 object-cover"
            />
          </figure>
        ) : null}

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,720px)_1fr] lg:gap-16">
          <div className="min-w-0">
            <PostBody doc={doc} />

            <p className="mt-12 rounded-2xl bg-white/60 p-5 text-sm leading-relaxed text-rh-ink/65">
              This article is general information to help you understand your body. It is not a diagnosis. If your pain is severe,
              getting worse, or comes with numbness, weakness, fever or loss of bladder or bowel control, see a doctor straight away.
            </p>

            {post.tags.length > 0 ? (
              <ul aria-label="Topics" className="mt-8 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <li key={tag} className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-rh-ink/70">
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rh-ink/10 pt-6">
              <p className="text-sm font-semibold">Found this useful? Share it.</p>
              <ShareButtons url={url} title={post.title} />
            </div>

            <AuthorBox author={post.authorFull} reviewer={post.reviewer} />
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-8">
              <TableOfContents items={toc} />
              <div>
                <p className="text-[13px] font-bold uppercase tracking-wide text-rh-ink/50">Share</p>
                <div className="mt-3">
                  <ShareButtons url={url} title={post.title} />
                </div>
              </div>
              <div className="rounded-[1.75rem] bg-rh-ink p-6 text-white">
                <p className="text-lg font-bold leading-snug">Talk to a physiotherapist</p>
                <p className="mt-2 text-sm leading-relaxed text-white/70">Licensed physios by video or at home. Joy on WhatsApp sets it up.</p>
                <a
                  href={joyWhatsAppUrl("Hi Joy, I read your blog and I'd like to book a physiotherapy session.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink hover:bg-rh-lime-deep"
                >
                  Chat with Joy <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </aside>
        </div>

        {related.length > 0 ? (
          <section aria-labelledby="more-posts" className="mt-20">
            <div className="flex items-end justify-between gap-4">
              <h2 id="more-posts" className="text-[28px] font-bold leading-tight tracking-tight sm:text-4xl">
                Keep reading
              </h2>
              <Link href={blogPaths.index} className="hidden items-center gap-2 text-sm font-semibold hover:underline sm:inline-flex">
                All posts <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-6">
              <PostGrid posts={related} />
            </div>
          </section>
        ) : null}
      </article>
    </PageShell>
  )
}
