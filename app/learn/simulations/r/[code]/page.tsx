import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { ReplayPage } from '@/components/learn/sims/replay/ReplayPlayer'
import type { SimShare } from '@/components/learn/sims/simApi'
import { publicAppUrl } from '@/lib/public-app-url'

const getShare = makeFunctionReference<'query', { code: string }, SimShare | null>('learnSims:getShare')

async function loadShare(code: string): Promise<SimShare | null> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url || !/^[a-z0-9]{6,16}$/.test(code)) return null
  try {
    return await new ConvexHttpClient(url).query(getShare, { code })
  } catch {
    return null
  }
}

/** The preview card WhatsApp, X, LinkedIn and Facebook show for a shared run. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params
  const share = await loadShare(code)
  if (!share) return { title: 'Simulation replay — Rehabify Learn', robots: { index: false } }
  const title = `${share.firstName} scored ${share.result.pct}% on “${share.case.title}”`
  const description = 'Watch the run with the patient’s voice, then try this clinical simulation free on Rehabify Learn.'
  const image = `${publicAppUrl()}/api/og/sim/${code}`
  return {
    title: `${title} — Rehabify Learn`,
    description,
    // A learner's own run: shareable, but not for search results
    robots: { index: false, follow: true },
    openGraph: { title, description, siteName: 'Rehabify Learn', type: 'website', images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default async function SimulationReplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return (
    <Suspense fallback={null}>
      <ReplayPage code={code} />
    </Suspense>
  )
}
