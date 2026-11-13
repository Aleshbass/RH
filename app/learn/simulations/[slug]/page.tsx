import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SimCasePage } from '@/components/learn/sims/SimPlayer'

export const metadata: Metadata = {
  title: 'Simulation — Rehabify Learn',
  description: 'A timed clinical case on Rehabify Learn.',
}

export default async function LearnSimulationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Suspense: the attempt lives in the URL (?attempt=) so a refresh resumes the case
  return (
    <Suspense fallback={null}>
      <SimCasePage slug={slug} />
    </Suspense>
  )
}
