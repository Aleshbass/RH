/**
 * The site's link-preview picture (og:image), 1200x630.
 *
 * LinkedIn reads the same og:image as WhatsApp, Instagram and Facebook, so this one address
 * answers by who is asking: LinkedIn's crawler (LinkedInBot) gets the Africa card, everyone else
 * the Joy card. X reads twitter:image, which points straight at the Joy card file.
 * The pictures are the files in public/og/; this only picks one and passes it on.
 * Never cached by the CDN, or one crawler's picture would be shown to the others.
 */
const SHARE_IMAGES = {
  default: '/og/rehabify-joy.jpg',
  linkedin: '/og/rehabify-africa.jpg',
} as const

export async function GET(request: Request) {
  const userAgent = request.headers.get('user-agent') ?? ''
  const file = /LinkedInBot/i.test(userAgent) ? SHARE_IMAGES.linkedin : SHARE_IMAGES.default
  const image = await fetch(new URL(file, request.url), { cache: 'no-store' })
  if (!image.ok || !image.body) return new Response('Not found', { status: 404 })
  return new Response(image.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'User-Agent',
    },
  })
}
