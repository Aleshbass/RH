import type { Metadata } from 'next'
import { MyCourses } from '@/components/learn/video/MyCourses'

export const metadata: Metadata = {
  title: 'My learning — Rehabify Learn',
  robots: { index: false, follow: false },
}

export default function LearnMyCoursesPage() {
  return <MyCourses />
}
