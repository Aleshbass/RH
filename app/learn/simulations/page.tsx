import type { Metadata } from 'next'
import { SimLobby } from '@/components/learn/sims/SimLobby'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const metadata: Metadata = pageMetadata({
  title: 'Clinical simulations — Rehabify Learn',
  description: 'Timed clinical cases for physiotherapists and physio students: voice-acted patients, a live monitor, and a debrief on every decision.',
  path: learnUrl('/simulations'),
})

export default function LearnSimulationsPage() {
  return <SimLobby />
}
