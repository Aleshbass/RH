import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CourseOfferView } from '@/components/learn/video/CourseEnrolment'

export const metadata: Metadata = {
  title: 'Course — Rehabify Learn',
  description: 'A Rehabify Learn video course for physiotherapists.',
}

export default async function LearnCourseOfferPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  // Suspense: the page reads ?reference= when Paystack sends the learner back
  return (
    <Suspense fallback={null}>
      <CourseOfferView courseId={courseId} />
    </Suspense>
  )
}
