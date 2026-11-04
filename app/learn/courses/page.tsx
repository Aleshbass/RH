import type { Metadata } from 'next'
import { CourseCatalog } from '@/components/learn/video/CourseEnrolment'

export const metadata: Metadata = {
  title: 'Video courses — Rehabify Learn',
  description: 'Short, practical video courses for physiotherapists from Rehabify Learn. Free and paid courses, at your own pace.',
}

export default function LearnCoursesPage() {
  return <CourseCatalog />
}
