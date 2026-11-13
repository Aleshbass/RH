import type { Metadata } from 'next'
import { CommunityHome } from '@/components/learn/social/Community'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const metadata: Metadata = pageMetadata({
  title: 'Community — Rehabify Learn',
  description: 'Ask questions and learn together with physiotherapists and physio students on Rehabify Learn.',
  path: learnUrl('/community'),
})

export default function LearnCommunityPage() {
  return <CommunityHome />
}
