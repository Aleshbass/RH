import type { Metadata } from 'next'
import { CourseApp } from '@/components/learn/course/CourseApp'

export const metadata: Metadata = {
  title: 'My course — Rehabify Learn',
  robots: { index: false, follow: false },
}

// The paid physio's course: live sessions, links, weekly materials and the exercise library
export default function LearnCoursePage() {
  return <CourseApp />
}
