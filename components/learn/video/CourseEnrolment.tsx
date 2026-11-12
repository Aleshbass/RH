'use client'

/**
 * One video course's page on Rehabify Learn (/courses/<id>) with its Enrol button. One Rehabify
 * login covers every course: free courses enrol in one tap; paid ones go to Paystack at the
 * Rehabify physiotherapist or external rate and come back here, where the payment is checked
 * (learn.ts › Course enrolment). The catalogue is components/learn/platform/CatalogPage.tsx.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, Clock, Loader2, Lock, PlayCircle } from '@/components/icons'
import { categoryLabel, levelLabel } from '@/lib/learn/catalog'
import { InstructorAvatar } from '../platform/catalog'
import { TagBadge, useLearnerIdentity } from '../platform/identity'
import { learnPath, learnSignInHref, MY_LEARNING_PATH } from '../platform/learnApi'
import { cn } from '@/lib/utils'
import { displayFont, naira, pillInk, pillLime } from '../shared'
import { formatLength, imagekitLoader, videoApi, type CourseOfferPage } from './videoApi'

const MY_COURSES = MY_LEARNING_PATH

function errorText(error: unknown) {
  const data = (error as { data?: unknown })?.data
  if (typeof data === 'string') return data
  return 'Something went wrong. Please try again.'
}

function CoverImage({ url, sizes, priority }: { url: string | null; sizes: string; priority?: boolean }) {
  return url ? (
    <Image src={url} loader={imagekitLoader} alt="" fill sizes={sizes} priority={priority} className="object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-rh-ink text-rh-lime">
      <PlayCircle className="h-10 w-10" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// One course
// ─────────────────────────────────────────────────────────────────────────────

/** "Signed in as Rehabify physio": the tag that decides the price shown. */
function ViewerTag() {
  const identity = useLearnerIdentity()
  if (!identity?.signedIn) return null
  return (
    <p className="mt-5 flex flex-wrap items-center gap-2 text-xs text-white/60">
      Signed in as <TagBadge tag={identity.tag} size="xs" className={identity.tag.verified ? 'bg-white text-rh-ink' : undefined} />
    </p>
  )
}

function EnrolBox({ offer }: { offer: CourseOfferPage }) {
  const router = useRouter()
  const pathname = usePathname()
  const enrolFree = useMutation(videoApi.enrolFree)
  const startPayment = useAction(videoApi.startPayment)
  const [busy, setBusy] = useState(false)
  const watchHref = `${MY_COURSES}#courses/${offer.id}`

  const enrol = async () => {
    setBusy(true)
    try {
      if (offer.access === 'free') {
        await enrolFree({ courseId: offer.id })
        toast.success('You’re enrolled')
        router.push(watchHref)
        return
      }
      const { authorizationUrl } = await startPayment({ courseId: offer.id, returnOrigin: window.location.origin })
      window.location.assign(authorizationUrl)
    } catch (error) {
      toast.error(errorText(error))
      setBusy(false)
    }
  }

  let action: React.ReactNode
  if (offer.viewer.canWatch) {
    action = (
      <Link href={watchHref} className={cn(pillLime, 'w-full justify-center')}>
        <PlayCircle className="h-4 w-4" /> Start the course
      </Link>
    )
  } else if (offer.access === 'msk') {
    action = (
      <Link href="/learn/programs/msk-specialist" className={cn(pillLime, 'w-full justify-center')}>
        See the MSK Specialist Program <ArrowRight className="h-4 w-4" />
      </Link>
    )
  } else if (!offer.viewer.signedIn) {
    action = (
      <Link href={learnSignInHref(pathname)} className={cn(pillLime, 'w-full justify-center')}>
        <Lock className="h-4 w-4" /> {offer.access === 'paid' ? 'Sign in to pay and enrol' : 'Sign in to enrol'}
      </Link>
    )
  } else {
    action = (
      <button type="button" onClick={enrol} disabled={busy} className={cn(pillLime, 'w-full justify-center disabled:opacity-70')}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {offer.access === 'free' ? 'Enrol for free' : `Pay ${naira(offer.viewer.priceToPay ?? 0)} and enrol`}
      </button>
    )
  }

  return (
    <aside className="rounded-[2rem] bg-rh-ink p-6 text-white shadow-lift sm:p-8 lg:sticky lg:top-28">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-lime">
        {offer.access === 'free' ? 'Free course' : offer.access === 'paid' ? 'Course fee' : 'MSK Specialist Program'}
      </p>
      {offer.access === 'paid' && offer.prices && (
        <div className="mt-3 space-y-2 text-sm">
          <div className={cn('flex items-baseline justify-between gap-3', offer.viewer.rehabifyRate ? 'text-white' : 'text-white/55')}>
            <span>Rehabify physiotherapists</span>
            <span className="text-lg font-semibold">{naira(offer.prices.rehabify)}</span>
          </div>
          <div className={cn('flex items-baseline justify-between gap-3', offer.viewer.rehabifyRate ? 'text-white/55' : 'text-white')}>
            <span>Other physiotherapists</span>
            <span className="text-lg font-semibold">{naira(offer.prices.external)}</span>
          </div>
          {offer.viewer.signedIn && (
            <p className="text-xs text-white/55">
              {offer.viewer.rehabifyRate ? 'Your Rehabify account gets the physiotherapist rate.' : 'Approved Rehabify physiotherapists pay the lower rate.'}
            </p>
          )}
        </div>
      )}
      {offer.access === 'free' && <p className="mt-3 text-sm text-white/70">Enrol in one tap with your Rehabify account.</p>}
      {offer.access === 'msk' && <p className="mt-3 text-sm text-white/70">Included for paid MSK Specialist learners.</p>}
      <ViewerTag />
      <div className="mt-6">{action}</div>
      <ul className="mt-6 space-y-2 text-sm text-white/70">
        <li className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-rh-lime" /> {offer.lessonCount} lessons</li>
        <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-rh-lime" /> {formatLength(offer.durationSec)} of video</li>
        <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-rh-lime" /> Your place in each lesson is saved</li>
      </ul>
    </aside>
  )
}

/** Back from Paystack (?reference=…): check the payment once, then show the result. */
function usePaymentReturn(courseId: string) {
  const params = useSearchParams()
  const router = useRouter()
  const verify = useAction(videoApi.verifyPayment)
  const [state, setState] = useState<'idle' | 'checking' | 'paid' | 'pending' | 'failed'>('idle')
  const checked = useRef(false)
  const reference = params.get('reference') ?? params.get('trxref')
  const cancelled = params.get('cancelled') === '1'

  useEffect(() => {
    if (!reference || checked.current) return
    checked.current = true
    setState('checking')
    verify({ reference })
      .then((result) => {
        setState(result.status)
        if (result.status === 'paid') {
          toast.success('Payment confirmed. You’re enrolled')
          router.replace(`${MY_COURSES}#courses/${courseId}`)
        }
      })
      .catch(() => setState('pending'))
  }, [reference, verify, router, courseId])

  return { state, cancelled }
}

export function CourseOfferView({ courseId }: { courseId: string }) {
  const offer = useQuery(videoApi.offer, { courseId })
  const { state, cancelled } = usePaymentReturn(courseId)

  if (offer === undefined) {
    return <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-12"><div className="h-96 animate-pulse rounded-[2rem] bg-rh-ink/[0.06]" /></main>
  }
  if (offer === null) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-14 text-center sm:px-6 sm:pt-20">
        <h1 className={cn('text-3xl tracking-tight text-rh-ink', displayFont)}>This course isn’t available</h1>
        <p className="mt-2 text-rh-ink/60">It may have been unpublished. See the courses that are open now.</p>
        <Link href={learnPath('/courses')} className={cn(pillInk, 'mt-6')}>All courses</Link>
      </main>
    )
  }

  const category = categoryLabel(offer.category)
  const level = levelLabel(offer.level)
  const stats = [
    `${offer.lessonCount} ${offer.lessonCount === 1 ? 'lesson' : 'lessons'}`,
    offer.durationSec > 0 ? formatLength(offer.durationSec) : null,
    level,
    offer.learners >= 10 ? `${offer.learners.toLocaleString('en-NG')} learners` : null,
  ].filter(Boolean) as string[]

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-10">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-rh-ink/55">
        <Link href={learnPath('/courses')} className="hover:text-rh-ink hover:underline">
          Courses
        </Link>
        {category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`${learnPath('/courses')}?category=${offer.category}`} className="hover:text-rh-ink hover:underline">
              {category}
            </Link>
          </>
        )}
      </nav>

      {state === 'checking' && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-rh-ink shadow-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your payment…
        </p>
      )}
      {state === 'pending' && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We haven’t received confirmation of your payment yet. If you paid, it will show here within a few minutes; refresh this page.
        </p>
      )}
      {state === 'failed' && (
        <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-900">The payment didn’t go through. You haven’t been charged; please try again.</p>
      )}
      {cancelled && state === 'idle' && (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-rh-ink/70 shadow-soft">Payment cancelled. You can enrol whenever you’re ready.</p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
        <div className="min-w-0">
          <h1 className={cn('text-[34px] leading-[1.08] tracking-tight text-rh-ink sm:text-[46px]', displayFont)}>{offer.title}</h1>
          {offer.instructor && (
            <p className="mt-4 flex items-center gap-2.5 text-sm text-rh-ink/70">
              <InstructorAvatar instructor={offer.instructor} size={32} />
              <span>
                <span className="font-semibold text-rh-ink">{offer.instructor.name}</span>
                {offer.instructor.title ? <span className="text-rh-ink/55"> · {offer.instructor.title}</span> : null}
              </span>
            </p>
          )}
          <ul className="mt-5 flex flex-wrap gap-2">
            {stats.map((stat) => (
              <li key={stat} className="rounded-full bg-rh-cream px-3 py-1.5 text-xs font-semibold text-rh-ink">
                {stat}
              </li>
            ))}
          </ul>

          <div className="relative mt-7 aspect-[16/9] overflow-hidden rounded-[1.75rem] bg-rh-ink/[0.06]">
            <CoverImage url={offer.coverUrl} sizes="(min-width: 1024px) 760px, 100vw" priority />
            <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-rh-ink/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <PlayCircle className="h-3.5 w-3.5 text-rh-lime" /> {offer.lessonCount} video {offer.lessonCount === 1 ? 'lesson' : 'lessons'}
            </span>
          </div>

          <p className="mt-7 whitespace-pre-line text-[16px] leading-relaxed text-rh-ink/70">{offer.summary}</p>
          {/* On phones the price and the pay / enrol button come straight after the summary */}
          <div className="mt-6 lg:hidden">
            <EnrolBox offer={offer} />
          </div>

          {offer.benefits.length > 0 && (
            <section className="mt-10 rounded-[1.75rem] bg-rh-cream p-6 sm:p-8">
              <h2 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>What you’ll learn</h2>
              <ul className="mt-5 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                {offer.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-3 text-[15px] leading-6 text-rh-ink/80">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rh-ink text-rh-lime">
                      <Check className="h-3 w-3" />
                    </span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <div className="flex items-end justify-between gap-3">
              <h2 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>Course content</h2>
              <span className="text-sm text-rh-ink/55">{stats.slice(0, 2).join(' · ')}</span>
            </div>
            <ol className="mt-4 divide-y divide-rh-ink/[0.07] overflow-hidden rounded-[1.5rem] border border-rh-ink/[0.08] bg-white">
              {offer.lessons.map((lesson, index) => (
                <li key={lesson.id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-6 shrink-0 text-xs tabular-nums text-rh-ink/40">{String(index + 1).padStart(2, '0')}</span>
                    <span className="truncate font-medium text-rh-ink">{lesson.title}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-rh-ink/50">
                    {lesson.durationSec > 0 ? formatLength(lesson.durationSec) : ''}
                    {offer.viewer.canWatch ? <PlayCircle className="h-4 w-4 text-rh-ink/60" /> : <Lock className="h-3.5 w-3.5" />}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {offer.instructor && (
            <section className="mt-10 flex items-start gap-4 border-t border-rh-ink/[0.08] pt-8">
              <InstructorAvatar instructor={offer.instructor} size={64} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rh-ink/45">Your teacher</p>
                <p className={cn('mt-1 text-xl tracking-tight text-rh-ink', displayFont)}>{offer.instructor.name}</p>
                {offer.instructor.title && <p className="mt-0.5 text-sm text-rh-ink/60">{offer.instructor.title}</p>}
              </div>
            </section>
          )}
        </div>
        <div className="hidden lg:block">
          <EnrolBox offer={offer} />
        </div>
      </div>
    </main>
  )
}
