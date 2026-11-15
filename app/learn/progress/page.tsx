import type { Metadata } from 'next'
import { MyProgress } from '@/components/learn/points/MyProgress'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const metadata: Metadata = {
  ...pageMetadata({
    title: 'My progress — Rehabify Learn',
    description: 'Your points, badges, streak and progress on Rehabify Learn.',
    path: learnUrl('/progress'),
  }),
  robots: { index: false, follow: false },
}

export default function LearnProgressPage() {
  return <MyProgress />
}
