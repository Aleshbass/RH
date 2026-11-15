import type { Metadata } from 'next'
import { GroupJoin } from '@/components/learn/social/GroupJoin'

// A private group's invite: kept out of search engines
export const metadata: Metadata = {
  title: 'Join a group — Rehabify Learn',
  description: 'You’re invited to a private group on Rehabify Learn.',
  robots: { index: false, follow: false },
}

export default async function GroupJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <GroupJoin code={decodeURIComponent(code)} />
}
