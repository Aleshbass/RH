import type { Metadata } from 'next'
import { CourseLinkFlow } from '@/components/learn/course/CourseLinkFlow'

// A personal sign-in link from a Rehabify Learn email: never index or follow it
export const metadata: Metadata = {
  title: 'Open your course — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default function LearnStartPage() {
  return <CourseLinkFlow />
}
