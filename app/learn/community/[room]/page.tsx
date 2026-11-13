import type { Metadata } from 'next'
import { RoomView } from '@/components/learn/social/Community'

// Members-only conversations: kept out of search engines
export const metadata: Metadata = {
  title: 'Community — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default async function LearnRoomPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params
  return <RoomView slug={decodeURIComponent(room)} />
}
