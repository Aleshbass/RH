import type { Metadata } from 'next'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { SpaceRoom } from '@/components/learn/spaces/SpaceRoom'
import { publicAppUrl } from '@/lib/public-app-url'

type Preview = { title: string; description: string | null; host: string; status: string; at: number | null } | null
const spacePreview = makeFunctionReference<'query', { id: string }, Preview>('learnSpaces:spacePreview')

// A shared Space shows a preview card ("Live now", the host, the time) when the link is posted
// (owner 2026-11-15). Group-only Spaces don't.
export async function generateMetadata({ params }: { params: Promise<{ spaceId: string }> }): Promise<Metadata> {
  const { spaceId } = await params
  const base: Metadata = { title: 'Space — Rehabify Learn', robots: { index: false, follow: false } }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url || !/^[A-Za-z0-9_-]{8,64}$/.test(spaceId)) return base
  try {
    const s = await new ConvexHttpClient(url).query(spacePreview, { id: spaceId })
    if (!s) return base
    const title = s.status === 'live' ? `Live now: ${s.title}` : s.title
    const description = s.description ?? `A live audio Space with ${s.host} on Rehabify Learn. Listen in and ask your question.`
    const image = `${publicAppUrl()}/api/og/learn/space/${spaceId}`
    return {
      ...base,
      title: `${title} — Rehabify Learn`,
      description,
      openGraph: { title, description, siteName: 'Rehabify Learn', type: 'website', images: [{ url: image, width: 1200, height: 630, alt: title }] },
      twitter: { card: 'summary_large_image', title, description, images: [image] },
    }
  } catch {
    return base
  }
}

export default async function LearnSpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params
  return <SpaceRoom spaceId={spaceId} />
}
