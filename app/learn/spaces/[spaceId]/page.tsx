import type { Metadata } from 'next'
import { SpaceRoom } from '@/components/learn/spaces/SpaceRoom'

export const metadata: Metadata = {
  title: 'Space — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default async function LearnSpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params
  return <SpaceRoom spaceId={spaceId} />
}
