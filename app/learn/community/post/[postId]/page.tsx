import type { Metadata } from 'next'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { PostView } from '@/components/learn/social/PostView'
import { publicAppUrl } from '@/lib/public-app-url'

type Preview = { title: string; kind: string; room: string; firstName: string; replies: number } | null
const postPreview = makeFunctionReference<'query', { id: string }, Preview>('learnCommunity:postPreview')

// Members-only conversations: kept out of search engines. A shared post from an open room shows a
// preview card (title, room, first name) when the link is posted (owner 2026-11-15).
export async function generateMetadata({ params }: { params: Promise<{ postId: string }> }): Promise<Metadata> {
  const { postId } = await params
  const base: Metadata = { title: 'Community — Rehabify Learn', robots: { index: false, follow: false } }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url || !/^[A-Za-z0-9_-]{8,64}$/.test(postId)) return base
  try {
    const p = await new ConvexHttpClient(url).query(postPreview, { id: postId })
    if (!p) return base
    const description = `${p.kind === 'question' ? 'A question' : 'A discussion'} from ${p.firstName} in ${p.room}. Join the conversation on Rehabify Learn.`
    const image = `${publicAppUrl()}/api/og/learn/post/${postId}`
    return {
      ...base,
      title: `${p.title} — Rehabify Learn`,
      description,
      openGraph: { title: p.title, description, siteName: 'Rehabify Learn', type: 'article', images: [{ url: image, width: 1200, height: 630, alt: p.title }] },
      twitter: { card: 'summary_large_image', title: p.title, description, images: [image] },
    }
  } catch {
    return base
  }
}

export default async function LearnPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  return <PostView postId={postId} />
}
