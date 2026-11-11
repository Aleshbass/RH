import { SITE_CONFIG } from '@/lib/seo/config'
import { BLOG_DESCRIPTION, BLOG_NAME, RSS_PATH, absoluteUrl, blogPaths, loadPosts } from '@/lib/blog/server'

export const revalidate = 300

function escapeXml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RSS 2.0 feed of the newest posts (feed readers, newsletter tools, aggregators). */
export async function GET() {
  const list = await loadPosts(1)
  const items = list.posts
    .map((post) => {
      const url = absoluteUrl(blogPaths.post(post.slug))
      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<description>${escapeXml(post.excerpt)}</description>`,
        `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`,
        post.author ? `<dc:creator>${escapeXml(post.author.name)}</dc:creator>` : '',
        post.category ? `<category>${escapeXml(post.category.name)}</category>` : '',
        post.cover ? `<media:content url="${escapeXml(post.cover.url)}" medium="image" />` : '',
        '</item>',
      ]
        .filter(Boolean)
        .join('')
    })
    .join('\n')
  const latest = list.posts[0]?.updatedAt ?? Date.now()
  const blogUrl = absoluteUrl(blogPaths.index)
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    `<title>${escapeXml(BLOG_NAME)}</title>`,
    `<link>${blogUrl}</link>`,
    `<description>${escapeXml(BLOG_DESCRIPTION)}</description>`,
    '<language>en-NG</language>',
    `<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>`,
    `<atom:link href="${absoluteUrl(RSS_PATH)}" rel="self" type="application/rss+xml" />`,
    `<image><url>${SITE_CONFIG.url}${SITE_CONFIG.organization.logo}</url><title>${escapeXml(BLOG_NAME)}</title><link>${blogUrl}</link></image>`,
    items,
    '</channel>',
    '</rss>',
  ].join('\n')
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}
