import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { BLOG_DESCRIPTION, blogMetadata, blogPaths } from '@/lib/blog/server'
import { BlogListing } from '../../ListingPage'

export const revalidate = 300

type Props = { params: Promise<{ page: string }> }

function pageNumber(raw: string) {
  return /^\d{1,4}$/.test(raw) ? Number(raw) : NaN
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = pageNumber((await params).page)
  return blogMetadata({
    title: `Blog, page ${n}: recovery guides and physiotherapy advice`,
    description: BLOG_DESCRIPTION,
    path: blogPaths.page(n),
  })
}

export default async function BlogPageN({ params }: Props) {
  const n = pageNumber((await params).page)
  if (!Number.isInteger(n) || n < 1) notFound()
  if (n === 1) permanentRedirect(blogPaths.index)
  return <BlogListing page={n} />
}
