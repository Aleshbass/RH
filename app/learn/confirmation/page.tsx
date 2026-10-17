import { Suspense } from 'react'
import type { Metadata } from 'next'
import { ConfirmationFlow, ConfirmationSkeleton } from '@/components/learn/ConfirmationFlow'

export const metadata: Metadata = {
  title: 'Registration confirmed — MSK Specialist Program',
  robots: { index: false, follow: false },
}

// Paystack returns here with ?reference=…; the payment is verified server-side in Convex
export default function LearnConfirmationPage() {
  return (
    <Suspense fallback={<ConfirmationSkeleton />}>
      <ConfirmationFlow />
    </Suspense>
  )
}
