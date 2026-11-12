'use client'

/**
 * My learning (/courses/my on learn.*): the learner's live program (the MSK Specialist Program
 * course app) and every video course they can watch, with the player.
 */

import Link from 'next/link'
import { useConvexAuth, useQuery } from 'convex/react'
import { ArrowRight, Radio } from '@/components/icons'
import { cn } from '@/lib/utils'
import { TagBadge, useLearnerIdentity } from '../platform/identity'
import { learnPath, learnSignInHref, MY_LEARNING_PATH } from '../platform/learnApi'
import { displayFont, pillInk, pillLime, PROGRAM } from '../shared'
import { VideoCourses } from './VideoCourses'
import { videoApi } from './videoApi'

function MskProgramCard() {
  return (
    <Link
      href={learnPath('/course')}
      className="group mb-8 flex flex-col gap-4 rounded-[1.75rem] bg-rh-ink p-6 text-white transition hover:bg-black sm:flex-row sm:items-center sm:justify-between sm:p-7"
    >
      <span className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
          <Radio className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-xs font-semibold text-rh-lime">Live program</span>
          <span className={cn('mt-0.5 block text-xl tracking-tight', displayFont)}>{PROGRAM.shortTitle}</span>
          <span className="mt-1 block text-sm text-white/65">Live sessions, weekly materials, your assessment and certificate.</span>
        </span>
      </span>
      <span className={cn(pillLime, 'shrink-0 self-start sm:self-auto')}>
        Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function Greeting() {
  const identity = useLearnerIdentity()
  if (!identity?.signedIn) return null
  return (
    <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-rh-ink/60">
      {identity.firstName ? `Hi, ${identity.firstName}` : 'Signed in'} <TagBadge tag={identity.tag} size="xs" />
    </div>
  )
}

export function MyCourses() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const library = useQuery(videoApi.library, isAuthenticated ? {} : 'skip')
  const identity = useLearnerIdentity()
  const program = identity?.signedIn && identity.mskLearner ? <MskProgramCard /> : null

  if (isLoading || (isAuthenticated && library === undefined)) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
        <div className="h-80 animate-pulse rounded-[2rem] bg-rh-ink/[0.06]" />
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-14 text-center sm:px-6 sm:pt-20">
        <h1 className={cn('text-3xl tracking-tight text-rh-ink', displayFont)}>Sign in to see your learning</h1>
        <p className="mt-2 text-rh-ink/60">Your courses, programs and progress are saved to your Rehabify account.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={learnSignInHref(MY_LEARNING_PATH)} className={pillInk}>
            Sign in
          </Link>
          <Link href={learnPath('/courses')} className="inline-flex items-center rounded-full px-6 py-3 text-sm font-semibold text-rh-ink hover:bg-rh-ink/[0.05]">
            Browse courses
          </Link>
        </div>
      </main>
    )
  }

  if (library?.state !== 'ok') {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12">
        <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[38px]', displayFont)}>My learning</h1>
        <div className="mt-2">
          <Greeting />
        </div>
        {program}
        {!program && (
          <div className="rounded-[2rem] bg-rh-cream px-6 py-14 text-center">
            <h2 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>Nothing here yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-rh-ink/60">Enrol in a course or join a live program and it will appear here.</p>
            <Link href={learnPath('/courses')} className={cn(pillInk, 'mt-6')}>
              Browse courses
            </Link>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12">
      <VideoCourses
        heading={{
          title: 'My learning',
          extra: (
            <>
              <Greeting />
              {program}
            </>
          ),
        }}
      />
      <div className="mt-12 text-center">
        <Link href={learnPath('/courses')} className="text-sm font-semibold text-rh-ink underline-offset-4 hover:underline">
          Browse all courses
        </Link>
      </div>
    </main>
  )
}
