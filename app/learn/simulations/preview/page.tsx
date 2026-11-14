import type { Metadata } from 'next'
import { SimPreview } from '@/components/learn/sims/v2/SimPreview'

// For the Rehabify Learn team: the new mobile player, before it replaces the current one
export const metadata: Metadata = {
  title: 'New player preview — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default function LearnSimulationPreviewPage() {
  return <SimPreview />
}
