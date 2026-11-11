/**
 * Server-side loading for the public blog pages, plus their metadata.
 *
 * Every loader throws when Convex can't be reached. That is on purpose: the pages are cached
 * and rebuilt in the background, and an error keeps the last good copy, where "no posts" or
 * "not found" would be cached and shown (and a 404 could drop a post out of Google).
 * The one exception is `next build`: there is no earlier copy to keep, so the list pages are
 * built empty rather than failing the deploy, and refresh within 5 minutes.
 */
import type { Metadata } from 'next'
import { cache } from 'react'
import { getConvexClient } from '@/lib/convex-client'
import { SITE_CONFIG } from '@/lib/seo/config'
import { pageMetadata, type OgImage } from '@/lib/seo/utils'
import { blogApi, type BlogSitemap, type PostList, type PostResult, type PublicCategory } from './api'
import { blogPaths, imagekitTransform } from './content'

const TIMEOUT_MS = 8000

export const POSTS_PER_PAGE = 12

async function withTimeout<T>(query: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The blog took too long to load')), TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export const loadPost = cache(async (slug: string): Promise<PostResult> => {
  return await withTimeout(getConvexClient().query(blogApi.getPost, { slug }))
})

const duringBuild = () => process.env.NEXT_PHASE === 'phase-production-build'

export const loadPosts = cache(async (page: number, categorySlug?: string, authorSlug?: string): Promise<PostList> => {
  try {
    return await withTimeout(
      getConvexClient().query(blogApi.listPosts, {
        page,
        pageSize: categorySlug || authorSlug ? 48 : POSTS_PER_PAGE,
        ...(categorySlug ? { categorySlug } : {}),
        ...(authorSlug ? { authorSlug } : {}),
      })
    )
  } catch (error) {
    if (!duringBuild() || categorySlug || authorSlug) throw error
    return { posts: [], total: 0, page, pageCount: 0, category: null, author: null, found: true }
  }
})

export const loadCategories = cache(async (): Promise<PublicCategory[]> => {
  try {
    return await withTimeout(getConvexClient().query(blogApi.listCategories, {}))
  } catch (error) {
    if (!duringBuild()) throw error
    return []
  }
})

/** For sitemap.xml: never throws, an unreachable Convex just leaves the blog entries out. */
export async function loadBlogSitemap(): Promise<BlogSitemap | null> {
  try {
    return await withTimeout(getConvexClient().query(blogApi.sitemapData, {}))
  } catch {
    return null
  }
}

export const BLOG_NAME = 'Rehabify Health Blog'
export const BLOG_DESCRIPTION =
  'Recovery guides, exercise advice and plain answers about pain, injury and physiotherapy, written and reviewed by licensed physiotherapists in Nigeria.'
export const RSS_PATH = '/blog/rss.xml'

/** A 1200x630 social card cut from a post's cover image. */
export function coverOgImage(cover: { url: string; alt: string } | null | undefined): OgImage | undefined {
  if (!cover?.url) return undefined
  return { url: imagekitTransform(cover.url, { w: 1200, h: 630 }), width: 1200, height: 630, alt: cover.alt }
}

/**
 * pageMetadata() plus the feed link. Next replaces `alternates` as a whole, so every blog page
 * has to carry the RSS link alongside its own canonical.
 */
export function blogMetadata(args: Parameters<typeof pageMetadata>[0]): Metadata {
  const base = pageMetadata(args)
  return {
    ...base,
    alternates: { ...base.alternates, types: { 'application/rss+xml': [{ url: RSS_PATH, title: BLOG_NAME }] } },
  }
}

export const absoluteUrl = (path: string) => `${SITE_CONFIG.url}${path}`

export { blogPaths }
