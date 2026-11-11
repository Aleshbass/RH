import type { Metadata } from 'next'
import { BLOG_DESCRIPTION, blogMetadata } from '@/lib/blog/server'
import { BlogListing } from './ListingPage'

// Rebuilt in the background at most every 5 minutes; publishing refreshes it straight away
export const revalidate = 300

export const metadata: Metadata = blogMetadata({
  title: 'Blog: recovery guides and physiotherapy advice',
  description: BLOG_DESCRIPTION,
  path: '/blog',
})

export default function BlogPage() {
  return <BlogListing page={1} />
}
