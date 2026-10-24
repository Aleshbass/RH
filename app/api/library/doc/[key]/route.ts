import { NextResponse } from 'next/server'
import { LIBRARY_RESOURCES } from '@/convex/libraryResourcesSeed'

/**
 * Serves a Rehabify Library PDF leaflet from our own site, so the app can show it inside a
 * drawer instead of sending people to the hospital's website (most block being framed).
 * Only the leaflets in the library seed can be fetched, so this can't be used as an open proxy.
 */

export const runtime = 'nodejs'

const MAX_BYTES = 25 * 1024 * 1024

const LEAFLETS = new Map(
  LIBRARY_RESOURCES.filter((r) => r.kind === 'link' && r.url && /\.pdf(?:$|[?#])/i.test(r.url)).map((r) => [r.key, r.url as string])
)

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const url = LEAFLETS.get(key)
  if (!url) return fail(404, 'Not a library leaflet')

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RehabifyLibrary/1.0)', Accept: 'application/pdf' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      next: { revalidate: 86_400 },
    })
    if (!upstream.ok) return fail(502, 'The source site didn’t send the leaflet')
    if (!(upstream.headers.get('content-type') ?? '').includes('pdf')) return fail(502, 'The source site didn’t send a PDF')
    if (Number(upstream.headers.get('content-length') ?? 0) > MAX_BYTES) return fail(413, 'Leaflet too large')
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return fail(413, 'Leaflet too large')

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        // Framed by our own pages only (next.config.mjs sets the same for this path)
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    })
  } catch {
    return fail(502, 'Couldn’t reach the source site')
  }
}
