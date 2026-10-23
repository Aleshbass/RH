import type { Metadata } from 'next'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import type { PublicCohort } from '@/convex/learn'
import { MskProgramPage } from '@/components/learn/MskProgramPage'
import { learnUrl } from '@/lib/site-hosts'

export const revalidate = 60

const description =
  'Become a Rehabify Certified MSK Specialist in 5 weeks. Structured online learning, weekly live clinical sessions, case-based discussions and a final assessment for physiotherapists.'

export const metadata: Metadata = {
  title: 'MSK Specialist Program — Rehabify Learn',
  description,
  alternates: { canonical: learnUrl() },
  openGraph: {
    title: 'Rehabify MSK Specialist Program',
    description,
    url: learnUrl(),
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rehabify MSK Specialist Program',
    description,
  },
}

/** Server-rendered so the cohort dates are in the HTML; the client query keeps them live. */
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
  return <MskProgramPage initialCohort={cohort} />
}
