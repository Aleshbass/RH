import { Suspense } from 'react'
import type { Metadata } from 'next'
import { WelcomeFlow } from '@/components/learn/platform/WelcomeFlow'

export const metadata: Metadata = {
  title: 'Welcome to Rehabify Learn',
  robots: { index: false, follow: false },
}

export default function LearnWelcomePage() {
  // Suspense: the page reads ?edit=1
  return (
    <Suspense fallback={null}>
      <WelcomeFlow />
    </Suspense>
  )
}
