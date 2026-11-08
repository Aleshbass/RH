'use client'

/**
 * Rehabify Learn course enrolment: the public list of video courses (/learn/courses) and each
 * course's page (/learn/courses/<id>) with its Enrol button. One Rehabify login covers every
 * course: free courses enrol in one tap; paid ones go to Paystack at the Rehabify physiotherapist
 * or external rate and come back here, where the payment is checked (learn.ts › Course enrolment).
 * Enrolled learners watch in My courses (/learn/courses/my).
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAction, useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Clock, GraduationCap, Loader2, Lock, PlayCircle } from '@/components/icons'
import { cn } from '@/lib/utils'
import { displayFont, naira, pillInk, pillLime, pillOutline } from '../shared'
import { formatLength, imagekitLoader, videoApi, type CourseOffer, type CourseOfferPage } from './videoApi'

const MY_COURSES = '/learn/courses/my'

function signInHref(pathname: string) {
  return `/sign-in?redirect_url=${encodeURIComponent(pathname)}`
}

function errorText(error: unknown) {
  const data = (error as { data?: unknown })?.data
  if (typeof data === 'string') return data
  return 'Something went wrong. Please try again.'
}

function PriceTag({ offer }: { offer: CourseOffer }) {
  if (offer.access === 'free') return <span className="text-sm font-semibold text-rh-ink">Free</span>
  if (offer.access === 'msk') return <span className="text-sm font-semibold text-rh-ink/70">Included in the MSK Specialist Program</span>
  if (!offer.prices) return null
  return (
    <span className="text-sm font-semibold text-rh-ink">
      {naira(offer.viewer.priceToPay ?? offer.prices.external)}
      {offer.viewer.rehabifyRate && <span className="ml-1 font-normal text-rh-ink/55">Rehabify physio rate</span>}
    </span>
  )
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
// All courses
// ─────────────────────────────────────────────────────────────────────────────

/** Course cards (catalogue page and the Learn home). */
function OfferGrid({ offers, className }: { offers: CourseOffer[]; className?: string }) {
  return (
    <div className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {offers.map((offer) => (
        <Link
          key={offer.id}
          href={`/learn/courses/${offer.id}`}
          className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink motion-reduce:hover:translate-y-0"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-rh-ink/[0.06]">
            <CoverImage url={offer.coverUrl} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
            {offer.viewer.canWatch && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-rh-lime px-2.5 py-1 text-xs font-semibold text-rh-ink">
                <Check className="h-3 w-3" /> Enrolled
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col p-6">
            <h2 className={cn('text-xl leading-snug tracking-tight text-rh-ink', displayFont)}>{offer.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm text-rh-ink/60">{offer.summary}</p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-xs text-rh-ink/55">
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> {offer.lessonCount} lessons · {formatLength(offer.durationSec)}
              </span>
              <PriceTag offer={offer} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

/** "Video courses" on the Learn home: up to three courses and a link to them all. */
export function VideoCoursesSection() {
  const offers = useQuery(videoApi.catalog, {})
  return (
    <section id="video-courses" className="scroll-mt-24 bg-rh-cream px-4 py-20 sm:px-6 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className={cn('text-[32px] leading-[1.1] tracking-tight text-rh-ink sm:text-[44px]', displayFont)}>Video courses</h2>
            <p className="mt-3 max-w-xl text-[15px] text-rh-ink/60">
              Short, practical courses for physiotherapists. Pay once, then watch at your own pace on your phone or computer.
            </p>
          </div>
          <Link href="/learn/courses" className={cn(pillOutline, 'self-start sm:self-auto')}>
            All courses
          </Link>
        </div>
        {offers === undefined ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-[1.75rem] bg-rh-ink/[0.06]" />
            ))}
          </div>
        ) : offers.length === 0 ? (
          <div className="mt-10 rounded-[2rem] bg-white px-6 py-12 text-center shadow-soft">
            <h3 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>Courses are on the way</h3>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-rh-ink/60">New video courses will appear here as soon as they’re published.</p>
          </div>
        ) : (
          <OfferGrid offers={offers.slice(0, 3)} className="mt-10" />
        )}
      </div>
    </section>
  )
}

export function CourseCatalog() {
  const offers = useQuery(videoApi.catalog, {})
  const signedIn = offers?.some((o) => o.viewer.signedIn) ?? false
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-24 sm:px-6 sm:pb-14 sm:pt-28">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/50">Rehabify Learn</p>
          <h1 className={cn('mt-2 text-[34px] leading-tight tracking-tight text-rh-ink sm:text-[44px]', displayFont)}>Video courses</h1>
          <p className="mt-2 max-w-xl text-[15px] text-rh-ink/60">
            Short, practical courses for physiotherapists. Watch at your own pace, on your phone or computer.
          </p>
        </div>
        {signedIn && (
          <Link href={MY_COURSES} className={cn(pillOutline, 'self-start sm:self-auto')}>
            <GraduationCap className="h-4 w-4" /> My courses
          </Link>
        )}
      </div>

      {offers === undefined ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-[1.75rem] bg-rh-ink/[0.06]" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="mt-10 rounded-[2rem] bg-white px-6 py-16 text-center shadow-soft">
          <h2 className={cn('text-2xl tracking-tight text-rh-ink', displayFont)}>Courses are on the way</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-rh-ink/60">New courses will appear here as soon as they’re published.</p>
        </div>
      ) : (
        <OfferGrid offers={offers} className="mt-10" />
      )}
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// One course
// ─────────────────────────────────────────────────────────────────────────────

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
      <Link href="/learn" className={cn(pillLime, 'w-full justify-center')}>
        See the MSK Specialist Program <ArrowRight className="h-4 w-4" />
      </Link>
    )
  } else if (!offer.viewer.signedIn) {
    action = (
      <Link href={signInHref(pathname)} className={cn(pillLime, 'w-full justify-center')}>
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
    return <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-24 sm:px-6 sm:pt-28"><div className="h-96 animate-pulse rounded-[2rem] bg-rh-ink/[0.06]" /></main>
  }
  if (offer === null) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-28 text-center sm:px-6 sm:pt-32">
        <h1 className={cn('text-3xl tracking-tight text-rh-ink', displayFont)}>This course isn’t available</h1>
        <p className="mt-2 text-rh-ink/60">It may have been unpublished. See the courses that are open now.</p>
        <Link href="/learn/courses" className={cn(pillInk, 'mt-6')}>All courses</Link>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-24 sm:px-6 sm:pb-14 sm:pt-28">
      <Link href="/learn/courses" className="inline-flex items-center gap-1.5 text-sm font-medium text-rh-ink/60 hover:text-rh-ink">
        <ArrowLeft className="h-4 w-4" /> All courses
      </Link>

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

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="relative aspect-[16/9] overflow-hidden rounded-[2rem] bg-rh-ink/[0.06] shadow-soft">
            <CoverImage url={offer.coverUrl} sizes="(min-width: 1024px) 66vw, 100vw" priority />
          </div>
          <h1 className={cn('mt-8 text-[32px] leading-tight tracking-tight text-rh-ink sm:text-[40px]', displayFont)}>{offer.title}</h1>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-rh-ink/70">{offer.summary}</p>
          {/* On phones the price and the pay / enrol button come straight after the summary */}
          <div className="mt-6 lg:hidden">
            <EnrolBox offer={offer} />
          </div>

          {offer.benefits.length > 0 && (
            <section className="mt-8">
              <h2 className={cn('text-xl tracking-tight text-rh-ink', displayFont)}>What you’ll learn</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {offer.benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5 text-sm text-rh-ink/75">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-rh-ink" /> {benefit}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className={cn('text-xl tracking-tight text-rh-ink', displayFont)}>Lessons</h2>
            <ol className="mt-4 divide-y divide-rh-ink/[0.06] overflow-hidden rounded-[1.5rem] bg-white shadow-soft">
              {offer.lessons.map((lesson, index) => (
                <li key={lesson.id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rh-ink/[0.06] text-xs font-semibold text-rh-ink">{index + 1}</span>
                    <span className="truncate text-rh-ink">{lesson.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-rh-ink/50">{lesson.durationSec > 0 ? formatLength(lesson.durationSec) : ''}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="hidden lg:block">
          <EnrolBox offer={offer} />
        </div>
      </div>
    </main>
  )
}
