import type { Metadata } from 'next'
import { privateLinkMetadata } from '@/lib/seo/utils'

// Personal one-time invite links: generic preview text, never indexed or followed
export const metadata: Metadata = privateLinkMetadata({
  title: 'Your Rehabify invite',
  description: 'Open your invite to write for the Rehabify blog or teach on Rehabify Learn.',
  path: '/team-invite',
})

export default function TeamInviteLayout({ children }: { children: React.ReactNode }) {
  return children
}
