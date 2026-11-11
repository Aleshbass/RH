import { revalidatePath } from 'next/cache'
import { timingSafeEqual } from 'crypto'

/**
 * Convex calls this right after a blog post is published, changed or taken down (blog:pingSite),
 * so the cached pages update at once instead of within 5 minutes. Needs BLOG_REVALIDATE_SECRET
 * set to the same value on Vercel and on Convex.
 */
export async function POST(request: Request) {
  const secret = process.env.BLOG_REVALIDATE_SECRET?.trim()
  const given = request.headers.get('x-blog-secret')?.trim() ?? ''
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ ok: false }, { status: 401 })
  }
  let paths: unknown = []
  try {
    paths = ((await request.json()) as { paths?: unknown }).paths
  } catch {
    return Response.json({ ok: false, error: 'Bad body' }, { status: 400 })
  }
  // Only blog pages, and never more than a handful at once
  const clean = (Array.isArray(paths) ? paths : [])
    .filter((p): p is string => typeof p === 'string' && /^\/blog(\/[a-z0-9-]+){0,2}$/.test(p))
    .slice(0, 20)
  for (const path of new Set(['/blog', ...clean])) revalidatePath(path)
  // Older pages of the list move when a post is added or removed
  revalidatePath('/blog/page/[page]', 'page')
  revalidatePath('/blog/rss.xml')
  revalidatePath('/sitemap.xml')
  return Response.json({ ok: true })
}
