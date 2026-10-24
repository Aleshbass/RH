import type { Metadata } from 'next'
import { VerifyCertificate } from '@/components/learn/course/VerifyCertificate'

// Shows a physio's name: checkable by anyone with the number, but kept out of search engines
export const metadata: Metadata = {
  title: 'Certificate check — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default function LearnVerifyPage() {
  return <VerifyCertificate />
}
