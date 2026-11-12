import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CatalogPage } from '@/components/learn/platform/CatalogPage'
import { learnUrl } from '@/lib/site-hosts'
import { pageMetadata } from '@/lib/seo/utils'

export const metadata: Metadata = pageMetadata({
  title: 'All courses — Rehabify Learn',
  description: 'Video courses and live programs for physiotherapists and physio students. Free and paid, at your own pace or with a cohort.',
  path: learnUrl('/courses'),
})

export default function LearnCoursesPage() {
  // Suspense: search, topic and type live in the URL
  return (
    <Suspense fallback={null}>
      <CatalogPage />
    </Suspense>
  )
}
