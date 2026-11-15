import type { Metadata } from 'next'
import { Leaderboard } from '@/components/learn/points/Leaderboard'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const metadata: Metadata = pageMetadata({
  title: 'Leaderboard — Rehabify Learn',
  description: 'This month’s top learners on Rehabify Learn: points for courses, simulation cases and helping each other.',
  path: learnUrl('/leaderboard'),
})

export default function LearnLeaderboardPage() {
  return <Leaderboard />
}
