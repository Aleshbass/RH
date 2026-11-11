/**
 * IndexNow key file (Bing, Yandex, Seznam...). Convex (blog:pingSite) tells IndexNow about every
 * published post and points it here to prove the site is ours. INDEXNOW_KEY must be the same on
 * Vercel and Convex: 8 to 128 letters, numbers or hyphens.
 */
export function GET() {
  const key = process.env.INDEXNOW_KEY?.trim()
  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) return new Response('Not found', { status: 404 })
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
