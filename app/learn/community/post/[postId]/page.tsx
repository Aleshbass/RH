import type { Metadata } from 'next'
import { PostView } from '@/components/learn/social/PostView'

// Members-only conversations: kept out of search engines
export const metadata: Metadata = {
  title: 'Community — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default async function LearnPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  return <PostView postId={postId} />
}
