import { Suspense } from 'react'
import type { Metadata } from 'next'
import { RegisterFlow, RegisterSkeleton } from '@/components/learn/RegisterFlow'

export const metadata: Metadata = {
  title: 'Register — MSK Specialist Program',
  description: 'Save your place on the Rehabify MSK Specialist Program.',
  robots: { index: false, follow: true },
}

export default function LearnRegisterPage() {
  return (
    <Suspense fallback={<RegisterSkeleton />}>
      <RegisterFlow />
    </Suspense>
  )
}
