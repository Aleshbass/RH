'use client'

/**
 * Learn home for signed-in members (Mary 2026-11-17): an e-learning COMMUNITY, so the community
 * comes first, side by side with courses (50/50). No hero pictures. Live Spaces, your group, the
 * group leaderboard and how it works sit right below, not at the bottom of a long page.
 */

import { useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Crown,
  GraduationCap,
  MessageCircle,
  MessageSquare,
  Mic,
  Plus,
  Radio,
  Search,
  Users,
} from '@/components/icons'
import { COURSE_CATEGORIES } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { groupTone, joinableGroupsRef } from '@/lib/learnAdminsApi'
import { displayFont, pillInk, pillOutline, usePublicCohort, type PublicCohort } from '../shared'
import { CoverImage, useCatalog, type CatalogItem } from './catalog'
import { TagBadge, useLearnerIdentity } from './identity'
import { learnPath, MY_LEARNING_PATH, WELCOME_PATH } from './learnApi'
import { COMMUNITY_PATH, communityApi, postPath, relativeTime, roomPath, SPACES_PATH, spacePath, spacesApi, type PostSummary } from '../social/socialApi'
import { Avatar, Skeleton, SpaceAvatar } from '../social/ui'
import { GroupChip, GroupPicker, useNeedsGroup } from '../social/GroupPicker'
import { GroupAvatar } from '../social/GroupAvatar'
import { PostComposer } from '../social/Community'
import { LoveCount } from '../social/Love'
import { GroupStandings } from '../points/Leaderboard'
import { LEADERBOARD_PATH } from '../points/pointsApi'
import { SimsHomeBand } from '../sims/SimsHomeBand'

const POPULAR = ['msk', 'spine', 'sports', 'neuro', 'students'] as const

function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('flex min-w-0 flex-col rounded-[2rem] border border-rh-ink/[0.07] bg-white p-5 sm:p-7', className)}>{children}</section>
}

function CardHead({ icon: Icon, title, sub, href, linkLabel }: { icon: ComponentType<{ className?: string }>; title: string; sub?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rh-ink text-rh-lime">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className={cn('text-[24px] leading-tight tracking-tight text-rh-ink', displayFont)}>{title}</h2>
          {sub && <p className="truncate text-sm text-rh-ink/55">{sub}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 pt-2 text-sm font-semibold text-rh-ink/70 transition hover:text-rh-ink">
          {linkLabel ?? 'See all'} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

// ── Live Space strip ──────────────────────────────────────────────────────────

function LiveSpaceStrip() {
  const spaces = useQuery(spacesApi.list, {})
  const live = spaces?.live[0]
  if (!live) return null
  return (
    <Link
      href={spacePath(live.id)}
      className="group mt-6 flex items-center gap-4 rounded-[1.5rem] bg-rh-ink px-5 py-4 text-white transition hover:bg-[rgb(3_8_7)]"
    >
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
        <span className="absolute -inset-1 animate-ping rounded-full bg-rh-lime/25" />
        <SpaceAvatar name={live.host.name} imageUrl={live.host.imageUrl} size={44} className="relative bg-white/10 text-white/80" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-rh-lime">
          <span className="h-1.5 w-1.5 rounded-full bg-rh-lime" /> Live now
        </span>
        <span className="mt-0.5 block truncate text-[15px] font-semibold">{live.title}</span>
        <span className="block truncate text-sm text-white/55">with {live.host.name}</span>
      </span>
      <span className="hidden items-center gap-1.5 text-sm font-semibold text-rh-lime sm:inline-flex">
        Listen in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

// ── Community column ──────────────────────────────────────────────────────────

function CompactPost({ post, index }: { post: PostSummary; index: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.li initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.04 }}>
      <Link href={postPath(post.id)} className="group flex gap-3 rounded-2xl px-2 py-3 transition hover:bg-rh-cream/70 sm:px-3">
        <Avatar name={post.author?.name ?? 'Member'} imageUrl={post.author?.imageUrl} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-rh-ink">{post.author?.name ?? 'Former member'}</span>
            <GroupChip group={post.author?.group} />
            <span className="text-xs text-rh-ink/45">{relativeTime(post.lastActivityAt)}</span>
          </span>
          <span className="mt-0.5 block break-words text-[15px] font-semibold leading-snug text-rh-ink [overflow-wrap:anywhere] group-hover:underline group-hover:decoration-rh-ink/25 group-hover:underline-offset-4">
            {post.title}
          </span>
          <span className="mt-1 flex items-center gap-3 text-xs text-rh-ink/50">
            <span className="truncate">in {post.room.title}</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {post.replyCount}
            </span>
            <LoveCount count={post.helpfulCount} className="shrink-0" />
          </span>
        </span>
      </Link>
    </motion.li>
  )
}

function MyGroupCard() {
  const data = useQuery(joinableGroupsRef, {})
  const group = data?.myGroup
  if (!group) return null
  const info = data.groups.find((g) => g.id === group.id)
  const tone = groupTone(info?.color)
  return (
    <Link
      href={roomPath(group.roomSlug)}
      className="group mt-4 flex items-center gap-3 rounded-2xl p-3.5 transition hover:brightness-[0.98]"
      style={{ background: tone.soft }}
    >
      {info?.imageUrl ? (
        <GroupAvatar group={info} size={40} />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white" style={{ color: tone.ink }}>
          <Users className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-rh-ink">
          {group.name}
          {group.role === 'lead' && <span className="ml-1.5 text-xs font-medium text-rh-ink/60">· you&apos;re the champion</span>}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-rh-ink/60">
          {info?.lead ? (
            <>
              <Crown className="h-3 w-3" /> {info.lead.name} · {info.memberCount} members
            </>
          ) : (
            `${info?.memberCount ?? 0} members`
          )}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-rh-ink/40 transition group-hover:translate-x-0.5 group-hover:text-rh-ink" />
    </Link>
  )
}

function CommunityColumn() {
  const data = useQuery(communityApi.home, {})
  const [composing, setComposing] = useState(false)
  const posts = data?.latest.slice(0, 5)
  return (
    <Card>
      <CardHead icon={MessageCircle} title="Community" sub="Questions, cases and help from peers" href={COMMUNITY_PATH} linkLabel="Open" />
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => setComposing(true)} disabled={!data?.member} className={cn(pillInk, 'h-11 flex-1 sm:flex-none sm:px-5')}>
          <Plus className="h-4 w-4" /> Start a post
        </button>
        <Link href={SPACES_PATH} className={cn(pillOutline, 'h-11 px-5')}>
          <Mic className="h-4 w-4" /> Spaces
        </Link>
      </div>
      <div className="mt-4 flex-1">
        {data === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !posts?.length ? (
          <div className="rounded-2xl bg-rh-cream/70 px-5 py-8 text-center">
            <p className="font-semibold text-rh-ink">Be the first to start a conversation</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-rh-ink/60">Ask a question or share something you learned this week.</p>
          </div>
        ) : (
          <ul className="-mx-2 divide-y divide-rh-ink/[0.05] sm:-mx-3">
            {posts.map((post, i) => (
              <CompactPost key={post.id} post={post} index={i} />
            ))}
          </ul>
        )}
      </div>
      <MyGroupCard />
      {data?.member && <PostComposer open={composing} onClose={() => setComposing(false)} rooms={data.rooms} />}
    </Card>
  )
}

// ── Courses column ────────────────────────────────────────────────────────────

function CompactCourse({ item }: { item: CatalogItem }) {
  return (
    <Link href={item.href} className="group flex gap-3 rounded-2xl p-2 transition hover:bg-rh-cream/70">
      <span className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-xl bg-rh-cream sm:w-28">
        <CoverImage cover={item.cover} sizes="112px" className="transition duration-500 group-hover:scale-[1.04]" />
        {item.isLive && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-rh-lime px-1.5 py-0.5 text-[10px] font-bold text-[#0a0a0a]">
            <Radio className="h-2.5 w-2.5" /> Live
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 py-0.5">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-rh-ink">{item.title}</span>
        <span className="mt-1 block truncate text-xs text-rh-ink/55">{[item.instructor?.name, item.lengthLabel].filter(Boolean).join(' · ') || item.facts[0]}</span>
        <span className="mt-1.5 inline-flex text-xs font-semibold text-rh-ink">
          {item.isEnrolled ? 'Continue' : item.badge?.label ?? item.price}
        </span>
      </span>
    </Link>
  )
}

function CoursesColumn({ cohort }: { cohort: PublicCohort | null | undefined }) {
  const items = useCatalog(cohort)
  const enrolled = items?.filter((i) => i.isEnrolled) ?? []
  const shown = [...enrolled, ...(items ?? []).filter((i) => !i.isEnrolled)].slice(0, 4)
  return (
    <Card>
      <CardHead icon={BookOpen} title="Courses" sub="Video courses and live programs" href={learnPath('/courses')} linkLabel="All courses" />
      <form action={learnPath('/courses')} role="search" className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/40" />
        <label htmlFor="dash-course-search" className="sr-only">
          Search courses
        </label>
        <input
          id="dash-course-search"
          name="q"
          type="search"
          placeholder="Search courses"
          className="h-11 w-full rounded-full border border-rh-ink/10 bg-white pl-11 pr-4 text-[15px] text-rh-ink placeholder:text-rh-ink/40 focus:border-rh-ink focus:outline-none focus:ring-4 focus:ring-rh-ink/[0.07]"
        />
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {POPULAR.map((id) => {
          const c = COURSE_CATEGORIES.find((x) => x.id === id)
          if (!c) return null
          return (
            <Link
              key={id}
              href={`${learnPath('/courses')}?category=${id}`}
              className="rounded-full border border-rh-ink/10 px-3 py-1.5 text-xs font-semibold text-rh-ink transition hover:border-rh-ink/30 hover:bg-rh-cream"
            >
              {c.short}
            </Link>
          )
        })}
      </div>
      <div className="mt-4 flex-1">
        {items === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl bg-rh-cream/70 px-5 py-8 text-center text-sm text-rh-ink/60">New courses are on the way.</div>
        ) : (
          <div className="-mx-2 grid gap-1">
            {shown.map((item) => (
              <CompactCourse key={item.key} item={item} />
            ))}
          </div>
        )}
      </div>
      {enrolled.length > 0 && (
        <Link href={MY_LEARNING_PATH} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink hover:underline">
          My learning <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </Card>
  )
}

// ── Below the fold ────────────────────────────────────────────────────────────

const STEPS: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: Users, title: 'Join your group', body: 'A small group with a champion to guide you.' },
  { icon: MessageCircle, title: 'Ask and help', body: 'Questions, cases and @mentions in the community.' },
  { icon: Mic, title: 'Listen live', body: 'Spaces with Rehabify physios. Raise your hand.' },
  { icon: BadgeCheck, title: 'Learn and certify', body: 'Courses, live cases and checkable certificates.' },
]

function HowItWorksCompact() {
  return (
    <Card>
      <CardHead icon={GraduationCap} title="How it works" />
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-2xl bg-rh-cream/60 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rh-ink">
              <s.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-rh-ink">
                <span className="mr-1.5 tabular-nums text-rh-ink/35">{i + 1}</span>
                {s.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-5 text-rh-ink/60">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12" aria-busy>
      <Skeleton className="h-12 w-72 rounded-full" />
      <Skeleton className="mt-4 h-7 w-40 rounded-full" />
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[28rem] rounded-[2rem]" />
        <Skeleton className="h-[28rem] rounded-[2rem]" />
      </div>
    </main>
  )
}

export function LearnDashboard({ initialCohort }: { initialCohort?: PublicCohort | null }) {
  const identity = useLearnerIdentity()
  const cohort = usePublicCohort(initialCohort)
  const needsGroup = useNeedsGroup()
  const groups = useQuery(joinableGroupsRef, {})
  const reduce = useReducedMotion()
  if (identity === undefined) return <DashboardSkeleton />
  if (!identity.signedIn) return null
  const mine = groups?.myGroup ? groups.groups.find((g) => g.id === groups.myGroup!.id) : null
  return (
    <>
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className={cn('text-[34px] leading-[1.05] tracking-tight text-rh-ink sm:text-[46px]', displayFont)}>
            {greeting()}
            {identity.firstName ? `, ${identity.firstName}` : ''}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TagBadge tag={identity.tag} />
            {mine && <GroupChip group={{ name: mine.name, color: mine.color, lead: groups?.myGroup?.role === 'lead' }} className="px-2.5 py-1 text-xs" />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={MY_LEARNING_PATH} className={cn(pillOutline, 'h-11 px-5')}>
            Continue learning
          </Link>
          <Link href={LEADERBOARD_PATH} className={cn(pillOutline, 'h-11 px-5')}>
            <Crown className="h-4 w-4" /> Leaderboard
          </Link>
        </div>
      </motion.div>

      {identity.needsWelcome && (
        <Link
          href={WELCOME_PATH}
          className="mt-6 flex items-center justify-between gap-4 rounded-[1.5rem] bg-rh-jasmine/60 px-5 py-4 transition hover:bg-rh-jasmine/80"
        >
          <span className="min-w-0">
            <span className="block font-semibold text-rh-ink">Are you a physio student or a physiotherapist?</span>
            <span className="block text-sm text-rh-ink/65">Tell us once, then pick your group.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-rh-ink" />
        </Link>
      )}

      <LiveSpaceStrip />

      {needsGroup && <GroupPicker className="mt-6 rounded-[2rem] bg-rh-cream/60 p-5 sm:p-7" />}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <CommunityColumn />
        <CoursesColumn cohort={cohort} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead icon={Crown} title="Group leaderboard" sub="Which group is taking part the most this month" href={LEADERBOARD_PATH} linkLabel="Full board" />
          <div className="mt-5">
            <GroupStandings period="month" limit={5} compact />
          </div>
        </Card>
        <HowItWorksCompact />
      </div>

    </main>
    <SimsHomeBand />
    </>
  )
}
