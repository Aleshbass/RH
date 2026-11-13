import type { Metadata } from 'next'
import { SpacesHome } from '@/components/learn/spaces/SpacesHome'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const metadata: Metadata = pageMetadata({
  title: 'Spaces — Rehabify Learn',
  description: 'Live audio conversations with Rehabify physiotherapists. Listen in, raise your hand and ask your question.',
  path: learnUrl('/spaces'),
})

export default function LearnSpacesPage() {
  return <SpacesHome />
}
