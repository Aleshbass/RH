'use client'

/** My courses (/learn/courses/my): every video course this learner can watch, with the player. */

import Link from 'next/link'
import { useConvexAuth, useQuery } from 'convex/react'
import { cn } from '@/lib/utils'
import { displayFont, pillInk, pillLime } from '../shared'
import { VideoCourses } from './VideoCourses'
import { videoApi } from './videoApi'

export function MyCourses() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const library = useQuery(videoApi.library, isAuthenticated ? {} : 'skip')

  if (isLoading || (isAuthenticated && library === undefined)) {
    return <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6"><div className="h-80 animate-pulse rounded-[2rem] bg-rh-ink/[0.06]" /></main>
  }

  if (!isAuthenticated || library?.state !== 'ok') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className={cn('text-3xl tracking-tight text-rh-ink', displayFont)}>
          {isAuthenticated ? 'No courses yet' : 'Sign in to see your courses'}
        </h1>
        <p className="mt-2 text-rh-ink/60">
          {isAuthenticated ? 'Enrol in a course and it will appear here.' : 'Your courses are saved to your Rehabify account.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!isAuthenticated && (
            <Link href={`/sign-in?redirect_url=${encodeURIComponent('/learn/courses/my')}`} className={pillLime}>Sign in</Link>
          )}
          <Link href="/learn/courses" className={pillInk}>Browse courses</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <VideoCourses />
      <div className="mt-12 text-center">
        <Link href="/learn/courses" className="text-sm font-semibold text-rh-ink underline-offset-4 hover:underline">
          Browse all courses
        </Link>
      </div>
    </main>
  )
}
