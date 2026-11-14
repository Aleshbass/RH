import type { Metadata } from 'next'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import type { PublicCohort } from '@/convex/learn'
import { LearnHome } from '@/components/learn/platform/LearnHome'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const revalidate = 60

const description =
  'Learn with peers through clinical cases, video courses and live sessions, and earn verifiable certificates. For physiotherapy students, graduates and practising physios.'

// The root template adds the brand, so the title carries none of its own
export const metadata: Metadata = pageMetadata({
  title: 'Rehabify Learn: courses for physiotherapists',
  description,
  path: learnUrl(),
})

/** Server-rendered so the featured program is in the HTML; the client queries keep it live. */
async function loadCohort(): Promise<PublicCohort | null | undefined> {
  try {
    return (await fetchQuery(api.learn.getPublicCohort, {})) as PublicCohort | null
  } catch {
    // Convex unreachable (or not deployed yet): the page loads it client-side instead
    return undefined
  }
}

export default async function LearnPage() {
  const cohort = await loadCohort()
  return <LearnHome initialCohort={cohort} />
}
