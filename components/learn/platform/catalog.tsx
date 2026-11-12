'use client'

/**
 * One catalogue for everything on Learn: live programs (the MSK Specialist Program's cohorts)
 * and video courses share the same card, filters and search.
 */

import Image from 'next/image'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { Check, Clock3, PlayCircle, Radio, Users } from '@/components/icons'
import { categoryLabel, levelLabel } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { displayFont, naira, usePublicCohort, type PublicCohort } from '../shared'
import { formatLength, videoApi, type CourseOffer } from '../video/videoApi'
import { MSK_PROGRAM_PATH, learnPath } from './learnApi'
import { imagekitPhotoLoader, LEARN_PHOTOS } from './media'

export type CatalogItem = {
  key: string
  kind: 'program' | 'video'
  href: string
  title: string
  summary: string
  cover: { src: string; alt: string } | null
  category: string | null
  level: string | null
  instructor: { name: string; title?: string; photoUrl?: string } | null
  badge: { label: string; tone: 'live' | 'free' | 'enrolled' | 'closed' } | null
  /** Bottom-right chip on the cover: course length or program length. */
  lengthLabel: string | null
  facts: string[]
  price: string
  priceNote: string | null
  learners: number
  createdAt: number
  isLive: boolean
  isFree: boolean
  isEnrolled: boolean
}

const MSK_SUMMARY =
  'Five weeks of structured online learning and weekly live clinical sessions in MSK assessment, clinical reasoning, patient management and rehabilitation. Final assessment and certificate.'

/** The MSK Specialist Program as a catalogue entry. It stays listed between cohorts. */
export function programItem(cohort: PublicCohort | null): CatalogItem {
  const open = Boolean(cohort?.isOpen)
  const from = cohort ? Math.min(cohort.prices.rehabify, cohort.prices.external) : null
  return {
    key: 'program:msk',
    kind: 'program',
    href: MSK_PROGRAM_PATH,
    title: 'MSK Specialist Program',
    summary: MSK_SUMMARY,
    cover: cohort?.imageUrl
      ? { src: cohort.imageUrl, alt: cohort.imageAlt || 'MSK Specialist Program' }
      : { src: LEARN_PHOTOS.consult.src, alt: LEARN_PHOTOS.consult.alt },
    category: 'msk',
    level: 'intermediate',
    instructor: { name: 'Rehabify clinical team' },
    badge: open ? { label: 'Live program', tone: 'live' } : { label: cohort ? 'Next cohort soon' : 'Coming soon', tone: 'closed' },
    lengthLabel: cohort?.duration ?? '5 weeks',
    facts: [cohort?.liveSessions ? `Live ${cohort.liveSessions}` : 'Weekly live sessions', 'Certificate'],
    price: from !== null && open ? `From ${naira(from)}` : 'Get notified',
    priceNote: open && cohort?.startsOn ? `Starts ${cohort.startsOn}` : null,
    learners: 0,
    createdAt: Number.MAX_SAFE_INTEGER, // always first under "Newest"
    isLive: true,
    isFree: false,
    isEnrolled: false,
  }
}

export function videoItem(offer: CourseOffer): CatalogItem {
  const enrolled = offer.viewer.canWatch
  const price =
    offer.access === 'free'
      ? 'Free'
      : offer.access === 'msk'
        ? 'With the MSK program'
        : naira(offer.viewer.priceToPay ?? offer.prices?.external ?? 0)
  return {
    key: `video:${offer.id}`,
    kind: 'video',
    href: learnPath(`/courses/${offer.id}`),
    title: offer.title,
    summary: offer.summary,
    cover: offer.coverUrl ? { src: offer.coverUrl, alt: '' } : null,
    category: offer.category,
    level: offer.level,
    instructor: offer.instructor,
    badge: enrolled ? { label: 'Enrolled', tone: 'enrolled' } : offer.access === 'free' ? { label: 'Free', tone: 'free' } : null,
    lengthLabel: offer.durationSec > 0 ? formatLength(offer.durationSec) : null,
    facts: [`${offer.lessonCount} ${offer.lessonCount === 1 ? 'lesson' : 'lessons'}`],
    price,
    priceNote: offer.viewer.rehabifyRate && offer.access === 'paid' ? 'Your Rehabify rate' : null,
    learners: offer.learners,
    createdAt: offer.createdAt,
    isLive: false,
    isFree: offer.access === 'free',
    isEnrolled: enrolled,
  }
}

/** Every catalogue entry (undefined while loading). The program comes first. */
export function useCatalog(initialCohort?: PublicCohort | null): CatalogItem[] | undefined {
  const cohort = usePublicCohort(initialCohort)
  const offers = useQuery(videoApi.catalog, {})
  if (cohort === undefined || offers === undefined) return undefined
  return [programItem(cohort), ...offers.map(videoItem)]
}

const isImagekit = (src: string) => src.startsWith('https://ik.imagekit.io/')

export function CoverImage({ cover, sizes, priority, className }: { cover: CatalogItem['cover']; sizes: string; priority?: boolean; className?: string }) {
  if (!cover) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-rh-ink text-rh-lime', className)}>
        <PlayCircle className="h-10 w-10" />
      </div>
    )
  }
  return (
    <Image
      src={cover.src}
      alt={cover.alt}
      fill
      sizes={sizes}
      priority={priority}
      loader={isImagekit(cover.src) ? imagekitPhotoLoader : undefined}
      unoptimized={!isImagekit(cover.src) && !cover.src.includes('.convex.cloud/')}
      className={cn('object-cover', className)}
    />
  )
}

const BADGE_TONE: Record<NonNullable<CatalogItem['badge']>['tone'], string> = {
  live: 'bg-rh-lime text-rh-ink',
  free: 'bg-white text-rh-ink',
  enrolled: 'bg-rh-ink text-white',
  closed: 'bg-white/90 text-rh-ink',
}

export function InstructorAvatar({ instructor, size = 24 }: { instructor: CatalogItem['instructor']; size?: number }) {
  const photo = instructor?.photoUrl
  if (photo && isImagekit(photo)) {
    return (
      <Image
        src={photo}
        alt=""
        width={size}
        height={size}
        loader={imagekitPhotoLoader}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-rh-ink text-[10px] font-bold text-rh-lime" style={{ width: size, height: size }}>
      {(instructor?.name ?? 'R').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Skillshare-style card: picture first, then title, teacher and price. No box around it. */
export function CourseCard({ item, priority = false, sizes }: { item: CatalogItem; priority?: boolean; sizes?: string }) {
  const category = categoryLabel(item.category)
  const level = levelLabel(item.level)
  return (
    <Link href={item.href} className="group block focus-visible:outline-none">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[1.25rem] bg-rh-ink/[0.06] ring-1 ring-inset ring-rh-ink/[0.04] group-focus-visible:ring-2 group-focus-visible:ring-rh-ink">
        <CoverImage
          cover={item.cover}
          sizes={sizes ?? '(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw'}
          priority={priority}
          className="transition duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {item.badge && (
          <span className={cn('absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', BADGE_TONE[item.badge.tone])}>
            {item.badge.tone === 'live' && <Radio className="h-3 w-3" />}
            {item.badge.tone === 'enrolled' && <Check className="h-3 w-3 text-rh-lime" />}
            {item.badge.label}
          </span>
        )}
        {item.lengthLabel && (
          <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-rh-ink/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <Clock3 className="h-3 w-3" /> {item.lengthLabel}
          </span>
        )}
      </div>
      <div className="pt-3.5">
        {(category || level) && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rh-ink/45">{[category, level].filter(Boolean).join(' · ')}</p>
        )}
        <h3 className={cn('mt-1.5 line-clamp-2 text-[17px] leading-snug tracking-tight text-rh-ink group-hover:underline group-hover:decoration-rh-ink/30 group-hover:underline-offset-4', displayFont)}>
          {item.title}
        </h3>
        {item.instructor && (
          <p className="mt-2 flex min-w-0 items-center gap-2 text-[13px] text-rh-ink/65">
            <InstructorAvatar instructor={item.instructor} size={22} />
            <span className="truncate">{item.instructor.name}</span>
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
          <span className="min-w-0 truncate">
            <span className="font-semibold text-rh-ink">{item.price}</span>
            {item.priceNote && <span className="text-rh-ink/50"> · {item.priceNote}</span>}
          </span>
          {item.learners >= 10 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-rh-ink/50">
              <Users className="h-3.5 w-3.5" /> {item.learners.toLocaleString('en-NG')}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export function CourseCardSkeleton() {
  return (
    <div>
      <div className="aspect-[16/10] animate-pulse rounded-[1.25rem] bg-rh-ink/[0.06]" />
      <div className="mt-4 h-3 w-24 animate-pulse rounded-full bg-rh-ink/[0.06]" />
      <div className="mt-3 h-5 w-4/5 animate-pulse rounded-full bg-rh-ink/[0.07]" />
      <div className="mt-3 h-4 w-1/2 animate-pulse rounded-full bg-rh-ink/[0.05]" />
    </div>
  )
}

/** Free-text search over the catalogue (title, summary, category, instructor). */
export function matchesQuery(item: CatalogItem, q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [item.title, item.summary, categoryLabel(item.category) ?? '', item.instructor?.name ?? '', item.isLive ? 'live program cohort' : 'video course']
    .join(' ')
    .toLowerCase()
  return terms.every((t) => haystack.includes(t))
}
