'use client'

/**
 * Learn › Community (owner 2026-11-12: one community with Learn rooms; students never see the
 * approved-physio community). Open rooms for every member, a room per course for its learners,
 * and the MSK Specialist Program room for its cohort.
 */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Flame,
  GraduationCap,
  HelpCircle,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Radio,
  Reply as ReplyIcon,
  ShieldAlert,
  Users,
} from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass, pillInk, pillLime, pillOutline } from '../shared'
import { TagBadge } from '../platform/identity'
import { mainSiteUrl } from '../platform/learnApi'
import {
  COMMUNITY_PATH,
  communityApi,
  errorText,
  postPath,
  relativeTime,
  roomPath,
  SPACES_PATH,
  spacesApi,
  type CommunityHome as CommunityHomeData,
  type CommunityRoom,
  type PostSummary,
  type ReportRow,
} from './socialApi'
import { Avatar, EmptyState, JoinPrompt, Sheet, Skeleton } from './ui'
import { myGroupsRef, type MyGroup } from '@/lib/learnAdminsApi'
import { GroupHub, GroupInviteButton } from './GroupHub'
import { GroupChip, GroupPicker, useNeedsGroup } from './GroupPicker'
import { GroupImageButton } from './GroupAvatar'
import { activeMentions, MentionTextarea, type Mention } from './Mentions'
import { LoveCount } from './Love'
import {
  CardList,
  colorDot,
  CommunityCard,
  CommunityIcon,
  coverStyle,
  hasNewActivity,
  LayoutSwitch,
  markRoomSeen,
  plural,
  roomColor,
  roomIcon,
  shortAgo,
  useCardLayout,
  useSeenRooms,
  type CommunityCardData,
} from './CommunityCards'

const KIND_LABEL = { question: 'Question', discussion: 'Discussion' } as const

const firstName = (name: string) => name.split(/\s+/)[0] || name

// ── Post card ─────────────────────────────────────────────────────────────────

/**
 * A post in a feed (redesign 2026-11-21, Circle-style): who wrote it and where, the title and a
 * short preview, then loves, replies and the last repliers' faces ("Ada replied 2h ago"). The whole
 * card opens the thread; Reply opens it with the reply box ready (#reply).
 */
export function PostRow({ post, showRoom = true, index = 0 }: { post: PostSummary & { hidden?: boolean }; showRoom?: boolean; index?: number }) {
  const name = post.author?.name ?? 'Former member'
  const repliers = post.lastRepliers ?? []
  const latest = repliers[0]
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <article className="group relative min-w-0 rounded-2xl border border-rh-ink/[0.07] bg-white p-3.5 transition hover:border-rh-ink/15 hover:shadow-soft sm:rounded-3xl sm:p-5">
        <header className="flex items-center gap-2.5">
          <Avatar name={name} imageUrl={post.author?.imageUrl} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13.5px] font-semibold leading-5 text-rh-ink sm:text-sm">{name}</span>
              {post.author?.tag && <TagBadge tag={post.author.tag} size="xs" className="max-[379px]:hidden" />}
              <GroupChip group={post.author?.group} className="max-sm:hidden" />
            </div>
            <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4 text-rh-ink/50 sm:text-xs">
              {showRoom && (
                <>
                  {/* Above the card's own link, so it opens the room */}
                  <Link
                    href={roomPath(post.room.slug)}
                    className="relative z-10 inline-flex min-w-0 items-center gap-1 font-semibold text-rh-ink/65 transition hover:text-rh-ink"
                  >
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorDot(roomColor(post.room)) }} />
                    <span className="truncate">{post.room.title}</span>
                  </Link>
                  <span aria-hidden>·</span>
                </>
              )}
              <span className="shrink-0">{shortAgo(post.createdAt)}</span>
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 self-start text-[10.5px] font-semibold sm:text-[11px]">
            {post.hidden && <span className="rounded-full bg-rh-danger-soft px-2 py-0.5 text-rh-danger-ink">Hidden</span>}
            <span className={cn('rounded-full px-2 py-0.5', post.kind === 'question' ? 'bg-rh-honeydew text-rh-ink' : 'bg-rh-cream text-rh-ink/75')}>
              {KIND_LABEL[post.kind]}
            </span>
          </span>
        </header>
        <h3 className="mt-2.5 line-clamp-2 break-words text-[15px] font-semibold leading-snug text-rh-ink [overflow-wrap:anywhere] sm:mt-3 sm:text-[17px]">
          {/* The title's link covers the whole card (the room and Reply links sit above it) */}
          <Link
            href={postPath(post.id)}
            className="after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none group-hover:underline group-hover:decoration-rh-ink/30 group-hover:underline-offset-4"
          >
            {post.title}
          </Link>
        </h3>
        {post.excerpt && (
          <p className="mt-1 line-clamp-2 break-words text-[13px] leading-5 text-rh-ink/60 [overflow-wrap:anywhere] sm:line-clamp-3 sm:text-[14px] sm:leading-6">{post.excerpt}</p>
        )}
        <footer className="mt-3 flex min-w-0 items-center gap-3 text-xs text-rh-ink/55">
          <LoveCount count={post.helpfulCount} className="shrink-0 font-semibold" />
          {post.replyCount > 0 ? (
            <span className="flex min-w-0 items-center gap-2">
              {repliers.length > 0 && (
                <span className="flex shrink-0 -space-x-1.5">
                  {repliers.map((person, i) => (
                    <Avatar key={`${person.name}-${i}`} name={person.name} imageUrl={person.imageUrl} size={20} className="ring-2 ring-white" />
                  ))}
                </span>
              )}
              <span className="truncate">
                <span className="font-semibold text-rh-ink/75">{plural(post.replyCount, 'reply', 'replies')}</span>
                {latest && post.lastReplyAt && (
                  <>
                    {' · '}
                    {/* Phones: the faces already say who */}
                    <span className="max-sm:hidden">{firstName(latest.name)} replied </span>
                    {shortAgo(post.lastReplyAt)}
                  </>
                )}
              </span>
            </span>
          ) : (
            <span className="truncate font-medium">{post.kind === 'question' ? 'No answers yet' : 'No replies yet'}</span>
          )}
          {!post.hidden && (
            <Link
              href={`${postPath(post.id)}#reply`}
              className="relative z-10 -my-1.5 -mr-1.5 ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-rh-ink/70 transition hover:bg-rh-ink/[0.06] hover:text-rh-ink"
            >
              <ReplyIcon className="h-3.5 w-3.5" /> Reply
            </Link>
          )}
        </footer>
      </article>
    </motion.li>
  )
}

function PostListSkeleton() {
  return (
    <ul className="space-y-2.5 sm:space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-36 rounded-2xl sm:h-40 sm:rounded-3xl" />
        </li>
      ))}
    </ul>
  )
}

// ── Feed with Latest · Popular · Unanswered ───────────────────────────────────

type FeedSort = 'latest' | 'popular' | 'unanswered'
const SORTS: { id: FeedSort; label: string; icon: typeof Clock }[] = [
  { id: 'latest', label: 'Latest', icon: Clock },
  { id: 'popular', label: 'Popular', icon: Flame },
  { id: 'unanswered', label: 'Unanswered', icon: HelpCircle },
]

/** Sorted in the browser, over the posts already loaded (the newest by activity). */
function sortPosts<T extends PostSummary>(posts: T[], sort: FeedSort): T[] {
  if (sort === 'unanswered') return posts.filter((p) => p.replyCount === 0)
  if (sort === 'popular') {
    const score = (p: T) => p.helpfulCount * 2 + p.replyCount
    return [...posts].sort((a, b) => score(b) - score(a) || b.lastActivityAt - a.lastActivityAt)
  }
  return posts
}

function SortTabs({ value, onChange }: { value: FeedSort; onChange: (sort: FeedSort) => void }) {
  return (
    <div role="radiogroup" aria-label="Sort posts" className="flex shrink-0 gap-1">
      {SORTS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          onClick={() => onChange(s.id)}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition',
            value === s.id ? 'bg-rh-ink text-white' : 'text-rh-ink/60 hover:bg-rh-ink/[0.05] hover:text-rh-ink'
          )}
        >
          <s.icon className="hidden h-3 w-3 sm:block" />
          {s.label}
        </button>
      ))}
    </div>
  )
}

function PostFeed({
  posts,
  showRoom = true,
  title,
  titleId,
  more,
}: {
  posts: (PostSummary & { hidden?: boolean })[]
  showRoom?: boolean
  title?: string
  titleId?: string
  more?: ReactNode
}) {
  const [sort, setSort] = useState<FeedSort>('latest')
  const shown = useMemo(() => sortPosts(posts, sort), [posts, sort])
  return (
    <div>
      <div className={cn('flex flex-wrap items-center gap-2', title ? 'justify-between' : 'justify-end')}>
        {title && (
          <h2 id={titleId} className="text-[13px] font-semibold uppercase tracking-[0.12em] text-rh-ink/50">
            {title}
          </h2>
        )}
        {posts.length > 1 && <SortTabs value={sort} onChange={setSort} />}
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-rh-ink/15 px-5 py-8 text-center text-sm text-rh-ink/55">
          {sort === 'unanswered' ? 'Every post here has a reply. Nice work.' : 'Nothing here yet.'}
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5 sm:space-y-3">
          {shown.map((post, i) => (
            <PostRow key={post.id} post={post} showRoom={showRoom} index={i} />
          ))}
        </ul>
      )}
      {more}
    </div>
  )
}

// ── Composer ──────────────────────────────────────────────────────────────────

export function PostComposer({
  open,
  onClose,
  rooms,
  defaultRoom,
}: {
  open: boolean
  onClose: () => void
  rooms: CommunityRoom[]
  defaultRoom?: string
}) {
  const router = useRouter()
  const createPost = useMutation(communityApi.createPost)
  const [room, setRoom] = useState(defaultRoom ?? rooms[0]?.slug ?? 'student-lounge')
  const [kind, setKind] = useState<'question' | 'discussion'>('question')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState<Mention[]>([])
  const [busy, setBusy] = useState(false)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const tagged = activeMentions(`${title}\n${body}`, mentions)
      const id = await createPost({ roomSlug: room, kind, title, body, ...(tagged.length ? { mentions: tagged } : {}) })
      playSound('send')
      setTitle('')
      setBody('')
      setMentions([])
      onClose()
      router.push(postPath(id))
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Couldn’t post. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Start a post"
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-xs leading-5 text-rh-ink/50 sm:block">Never share anything that could identify a patient.</p>
          <button type="button" onClick={() => void submit()} disabled={busy || title.trim().length < 4 || !body.trim()} className={cn(pillInk, 'h-11 px-6')}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Post
          </button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-5 pt-2">
        <div className="relative flex rounded-full bg-rh-cream p-1" role="radiogroup" aria-label="Kind of post">
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ease-out',
              kind === 'discussion' && 'translate-x-full'
            )}
          />
          {(['question', 'discussion'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'relative flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors',
                kind === k ? 'text-rh-ink' : 'text-rh-ink/55 hover:text-rh-ink'
              )}
            >
              <span className="relative">{k === 'question' ? 'Ask a question' : 'Start a discussion'}</span>
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="post-room" className="text-sm font-semibold text-rh-ink">
            Room
          </label>
          <select id="post-room" value={room} onChange={(e) => setRoom(e.target.value)} className={cn(fieldClass, 'mt-2')}>
            {rooms.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="post-title" className="text-sm font-semibold text-rh-ink">
            {kind === 'question' ? 'Your question' : 'Title'}
          </label>
          <input
            id="post-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder={kind === 'question' ? 'e.g. How do you progress loading after an ACL repair?' : 'e.g. Revision plan for the MSK exam'}
            className={cn(fieldClass, 'mt-2')}
          />
        </div>
        <div>
          <label htmlFor="post-body" className="text-sm font-semibold text-rh-ink">
            Details
          </label>
          <div className="mt-2">
            <MentionTextarea
              id="post-body"
              value={body}
              onValueChange={setBody}
              mentions={mentions}
              onMentionsChange={setMentions}
              roomSlug={room}
              maxLength={5000}
              rows={6}
              placeholder="Add context, what you’ve tried, or what you’d like to talk about. Type @ to tag someone."
              className={cn(fieldClass, 'h-auto min-h-[140px] resize-y py-3 leading-6')}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-rh-ink/50 sm:hidden">Never share anything that could identify a patient.</p>
        </div>
      </form>
    </Sheet>
  )
}

// ── Admin: reported posts ─────────────────────────────────────────────────────

function ReportsPanel() {
  const reports = useQuery(communityApi.adminReports, {})
  const moderate = useMutation(communityApi.adminModerate)
  if (!reports || reports.length === 0) return null
  const act = async (row: ReportRow, action: 'hide' | 'restore' | 'dismiss') => {
    try {
      await moderate({ targetType: row.targetType, targetId: row.targetId, action })
      toast.success(action === 'hide' ? 'Hidden' : action === 'restore' ? 'Restored' : 'Dismissed')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t update.'))
    }
  }
  return (
    <section className="mt-8 rounded-3xl border border-rh-danger-line bg-rh-danger-soft p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-rh-danger-ink">
        <ShieldAlert className="h-4 w-4" /> Reported ({reports.length})
      </h2>
      <ul className="mt-4 space-y-3">
        {reports.map((row) => (
          <li key={`${row.targetType}:${row.targetId}`} className="rounded-2xl bg-white p-4">
            <p className="line-clamp-3 whitespace-pre-line text-sm text-rh-ink">{row.text}</p>
            <p className="mt-2 text-xs text-rh-ink/55">
              {row.count} report{row.count === 1 ? '' : 's'} · {row.reasons.slice(0, 3).join(' · ')} · {row.status === 'hidden' ? 'Hidden' : 'Visible'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={postPath(row.postId)} className={cn(pillOutline, 'h-9 px-4 text-xs')}>
                Open
              </Link>
              {row.status === 'hidden' ? (
                <button type="button" onClick={() => void act(row, 'restore')} className={cn(pillOutline, 'h-9 px-4 text-xs')}>
                  Restore
                </button>
              ) : (
                <button type="button" onClick={() => void act(row, 'hide')} className={cn(pillInk, 'h-9 px-4 text-xs')}>
                  Hide
                </button>
              )}
              <button type="button" onClick={() => void act(row, 'dismiss')} className="h-9 rounded-full px-4 text-xs font-semibold text-rh-ink/60 hover:text-rh-ink">
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Pieces of the home page ───────────────────────────────────────────────────

function SpacesPromo() {
  const spaces = useQuery(spacesApi.list, {})
  const live = spaces?.live[0]
  const next = spaces?.upcoming[0]
  return (
    <Link href={SPACES_PATH} className="group block overflow-hidden rounded-3xl bg-rh-ink p-5 text-white transition hover:bg-black sm:p-6">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60">
          <Radio className="h-3.5 w-3.5 text-rh-lime" /> Rehabify Spaces
        </span>
        <ArrowUpRight className="h-4 w-4 text-white/50 transition group-hover:text-rh-lime" />
      </div>
      {live ? (
        <>
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-rh-lime">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-lime opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rh-lime" />
            </span>
            Live now
          </p>
          <p className="mt-1.5 line-clamp-2 text-lg font-semibold leading-snug">{live.title}</p>
          <p className="mt-1 text-sm text-white/60">with {live.host.name}</p>
        </>
      ) : next ? (
        <>
          <p className="mt-4 text-xs font-semibold text-white/55">Next up · {relativeTime(next.scheduledFor ?? next.startedAt ?? Date.now())}</p>
          <p className="mt-1.5 line-clamp-2 text-lg font-semibold leading-snug">{next.title}</p>
          <p className="mt-1 text-sm text-white/60">with {next.host.name}</p>
        </>
      ) : (
        <p className="mt-4 text-[15px] leading-6 text-white/75">Live audio conversations with Rehabify physiotherapists. Listen in and ask your question.</p>
      )}
    </Link>
  )
}

/** A group the member belongs to, as a community card. */
function groupCard(g: MyGroup, seen: Record<string, number> | null): CommunityCardData {
  return {
    key: g.id,
    href: roomPath(g.roomSlug),
    name: g.name,
    description: g.description,
    color: g.color,
    imageUrl: g.imageUrl,
    icon: Users,
    meta: [plural(g.memberCount, 'person', 'people'), g.lastActivityAt ? `active ${shortAgo(g.lastActivityAt)}` : 'say hello'],
    chips: [{ label: 'Private', icon: Lock }],
    badge: g.role === 'lead' ? <span className="shrink-0 rounded-full bg-rh-lime px-1.5 py-px text-[10px] font-semibold text-rh-ink">Champion</span> : null,
    isNew: hasNewActivity(g.roomSlug, g.lastActivityAt, seen),
  }
}

function roomCard(room: CommunityRoom, seen: Record<string, number> | null): CommunityCardData {
  return {
    key: room.slug,
    href: roomPath(room.slug),
    name: room.title,
    description: room.description,
    color: roomColor(room),
    icon: roomIcon(room),
    meta: [room.postCount === 0 ? 'No posts yet' : plural(room.postCount, 'post'), ...(room.lastActivityAt ? [`active ${shortAgo(room.lastActivityAt)}`] : [])],
    chips:
      room.kind === 'course'
        ? [{ label: 'Course', icon: GraduationCap }]
        : room.kind === 'program'
          ? [{ label: 'Program', icon: Lock }]
          : undefined,
    isNew: hasNewActivity(room.slug, room.lastActivityAt, seen),
  }
}

/**
 * The member's groups and the rooms (owner 2026-11-21): cards in a grid, a list or a sideways
 * scroll, as they choose. Groups come from Admin › Learn › Groups; each opens its private room.
 */
function Browse({ rooms }: { rooms: CommunityRoom[] }) {
  const groups = useQuery(myGroupsRef, {})
  const [layout, setLayout] = useCardLayout()
  const seen = useSeenRooms()
  const groupCards = (groups ?? []).map((g) => groupCard(g, seen))
  const roomCards = rooms.filter((room) => room.kind !== 'group').map((room) => roomCard(room, seen))
  if (groupCards.length === 0 && roomCards.length === 0) return null
  const both = groupCards.length > 0 && roomCards.length > 0
  return (
    <section aria-labelledby="browse-heading" className="mt-6 sm:mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 id="browse-heading" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-rh-ink/50">
          {both ? 'Groups and rooms' : groupCards.length ? 'Your groups' : 'Rooms'}
        </h2>
        <LayoutSwitch value={layout} onChange={setLayout} />
      </div>
      {groupCards.length > 0 && (
        <>
          {both && <h3 className="mb-2 mt-4 text-xs font-semibold text-rh-ink/60">Your groups</h3>}
          <div className={both ? '' : 'mt-3'}>
            <CardList layout={layout} label="Your groups">
              {groupCards.map((card) => (
                <CommunityCard key={card.key} card={card} layout={layout} />
              ))}
            </CardList>
          </div>
        </>
      )}
      {roomCards.length > 0 && (
        <>
          {both && <h3 className="mb-2 mt-5 text-xs font-semibold text-rh-ink/60">Rooms</h3>}
          <div className={both ? '' : 'mt-3'}>
            <CardList layout={layout} label="Rooms">
              {roomCards.map((card) => (
                <CommunityCard key={card.key} card={card} layout={layout} />
              ))}
            </CardList>
          </div>
        </>
      )}
    </section>
  )
}

/** The slim banner on top (owner 2026-11-21): who's talking and how much, kept short on phones. */
function CommunityBanner({ data, onPost }: { data: CommunityHomeData | undefined; onPost: () => void }) {
  const faces = useMemo(() => {
    const seen = new Set<string>()
    const out: { name: string; imageUrl: string | null }[] = []
    for (const post of data?.latest ?? []) {
      for (const person of [post.author, ...post.lastRepliers]) {
        if (!person || seen.has(person.name) || out.length >= 5) continue
        seen.add(person.name)
        out.push({ name: person.name, imageUrl: person.imageUrl })
      }
    }
    return out
  }, [data])
  const posts = data?.rooms.reduce((n, room) => n + room.postCount, 0) ?? 0
  const rooms = data?.rooms.length ?? 0
  const facts = [posts > 0 ? plural(posts, 'post') : null, rooms > 0 ? plural(rooms, 'room') : null].filter(Boolean).join(' · ')
  return (
    <section className="relative overflow-hidden rounded-3xl bg-rh-ink px-5 py-4 text-white sm:px-8 sm:py-8">
      <div className="relative flex items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <h1 className={cn('text-[24px] leading-tight tracking-tight sm:text-[44px]', displayFont)}>Community</h1>
          <p className="mt-0.5 text-[13px] leading-5 text-white/70 sm:hidden">Ask, share and learn together.</p>
          <p className="mt-2 hidden max-w-xl text-[15px] leading-6 text-white/70 sm:block">
            Ask questions, share what you’re learning and help each other: physiotherapists and physio students together.
          </p>
          {data?.member && (faces.length > 0 || facts) && (
            <div className="mt-3 flex items-center gap-2.5 sm:mt-4">
              {faces.length > 0 && (
                <span className="flex -space-x-1.5">
                  {faces.map((f) => (
                    // Literal colours: the banner is ink in both themes
                    <Avatar key={f.name} name={f.name} imageUrl={f.imageUrl} size={26} className="bg-[#e3dfd2] text-[#0b1312] ring-2 ring-rh-ink" />
                  ))}
                </span>
              )}
              {facts && <span className="text-xs text-white/65">{facts}</span>}
            </div>
          )}
        </div>
        {data?.member && (
          <button type="button" onClick={onPost} className={cn(pillLime, 'h-10 shrink-0 px-4 text-[13px] sm:h-12 sm:px-6 sm:text-sm')}>
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">Post</span>
            <span className="hidden sm:inline">Start a post</span>
          </button>
        )}
      </div>
    </section>
  )
}

/** Mary 2026-11-17: everyone belongs to a group. Until they pick one, the picker sits on top. */
function PickGroupNudge() {
  const needs = useNeedsGroup()
  if (!needs) return null
  return <GroupPicker className="mt-8 rounded-[2rem] bg-rh-cream/60 p-5 sm:p-7" />
}

// ── Community home ────────────────────────────────────────────────────────────

export function CommunityHome() {
  const data = useQuery(communityApi.home, {})
  const [composing, setComposing] = useState(false)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-4 sm:px-6 sm:pt-10">
      <CommunityBanner data={data} onPost={() => setComposing(true)} />

      {data?.member && data.physioCommunity && (
        <a
          href={mainSiteUrl('/dashboard/physiotherapist/community')}
          className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-rh-ink/[0.08] bg-rh-cream px-4 py-3 text-[13px] transition hover:border-rh-ink/20 sm:mt-6 sm:px-5 sm:py-4 sm:text-sm"
        >
          <span className="min-w-0 text-rh-ink/70">
            <span className="font-semibold text-rh-ink">Rehabify physio community</span> · the clinicians-only space in your dashboard
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-rh-ink/50" />
        </a>
      )}

      {data?.member && <ReportsPanel />}

      {data?.member && <PickGroupNudge />}

      {data && <Browse rooms={data.rooms} />}

      <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <section aria-labelledby="posts-heading" className="min-w-0">
          {data && data.member && data.latest.length > 0 ? (
            <PostFeed posts={data.latest} title="Latest posts" titleId="posts-heading" />
          ) : (
            <>
              <h2 id="posts-heading" className="text-[13px] font-semibold uppercase tracking-[0.12em] text-rh-ink/50">
                Latest posts
              </h2>
              <div className="mt-3">
                {data === undefined ? (
                  <PostListSkeleton />
                ) : !data.member ? (
                  <JoinPrompt signedIn={data.signedIn} returnTo={COMMUNITY_PATH} />
                ) : (
                  <EmptyState
                    icon={<MessageCircle className="h-5 w-5" />}
                    title="Be the first to post"
                    action={
                      <button type="button" onClick={() => setComposing(true)} className={cn(pillInk, 'h-11 px-5')}>
                        Start a post
                      </button>
                    }
                  >
                    Ask a question or start a discussion. Physios and students will see it here.
                  </EmptyState>
                )}
              </div>
            </>
          )}
        </section>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
          <SpacesPromo />
        </aside>
      </div>

      {data?.member && <PostComposer open={composing} onClose={() => setComposing(false)} rooms={data.rooms} />}
    </main>
  )
}

// ── A room ────────────────────────────────────────────────────────────────────

export function RoomView({ slug }: { slug: string }) {
  const [limit, setLimit] = useState(20)
  const data = useQuery(communityApi.room, { slug, limit })
  const home = useQuery(communityApi.home, {})
  const [composing, setComposing] = useState(false)
  const rooms = useMemo(() => home?.rooms ?? [], [home])
  const state = data?.state
  const lastAt = data && data.state !== 'missing' ? data.room.lastActivityAt : null

  // Clears this room's "new" dot on the community cards (in this browser)
  useEffect(() => {
    if (state === 'ok') markRoomSeen(slug)
  }, [state, slug, lastAt])

  if (data === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-4 sm:px-6 sm:pt-10">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-3 h-44 max-sm:-mx-4 max-sm:rounded-none sm:mt-5 sm:h-56 sm:rounded-3xl" />
        <div className="mt-8">
          <PostListSkeleton />
        </div>
      </main>
    )
  }
  if (data.state === 'missing') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 sm:px-6">
        <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="This room doesn’t exist" action={<BackToCommunity />} />
      </main>
    )
  }
  const Icon = roomIcon(data.room)
  const group = data.state === 'ok' ? data.group : null
  const color = group?.color ?? roomColor(data.room)
  const leads = group?.members.filter((m) => m.role === 'lead') ?? []
  const kindLabel = group
    ? `Private group${group.myRole === 'lead' ? ' · you lead it' : ''}`
    : data.room.kind === 'course'
      ? 'Course room'
      : data.room.kind === 'program'
        ? 'Program room'
        : 'Open room'
  const startFirst = (
    <button type="button" onClick={() => setComposing(true)} className={cn(pillInk, 'h-11 px-5')}>
      Start the first post
    </button>
  )
  const feed =
    data.state === 'ok' ? (
      <PostFeed
        posts={data.posts}
        showRoom={false}
        title={group ? undefined : 'Posts'}
        more={
          data.hasMore && (
            <div className="mt-6 text-center">
              <button type="button" onClick={() => setLimit((l) => l + 20)} className={cn(pillOutline, 'h-11 px-6')}>
                Show more
              </button>
            </div>
          )
        }
      />
    ) : null

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-4 sm:px-6 sm:pt-10">
      <BackToCommunity />

      {/* The room's header: a cover in its colour (or the group's picture) with its icon over the edge */}
      <section className="mt-3 overflow-hidden border-rh-ink/[0.07] bg-white max-sm:-mx-4 max-sm:border-y sm:mt-5 sm:rounded-3xl sm:border">
        <div aria-hidden className="relative h-20 overflow-hidden sm:h-32" style={group?.imageUrl ? undefined : coverStyle(color)}>
          {group?.imageUrl ? (
            <Image src={group.imageUrl} alt="" fill unoptimized priority sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
          ) : (
            <Icon className="absolute -bottom-6 right-5 h-28 w-28 opacity-20 sm:h-36 sm:w-36" style={{ color: colorDot(color) }} />
          )}
        </div>
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="flex items-end justify-between gap-3">
            <CommunityIcon color={color} imageUrl={group?.imageUrl} icon={Icon} size={60} className="-mt-8 ring-4 ring-white" />
            {data.state === 'ok' && (
              <div className="flex shrink-0 gap-2">
                {group && <GroupInviteButton groupId={group.id} groupName={group.name} className="h-10 px-4 text-[13px] sm:h-11 sm:px-5 sm:text-sm" />}
                <button type="button" onClick={() => setComposing(true)} className={cn(pillInk, 'h-10 shrink-0 px-4 text-[13px] sm:h-11 sm:px-5 sm:text-sm')}>
                  <Plus className="h-4 w-4" /> New post
                </button>
              </div>
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-rh-ink/50">
            {data.room.kind !== 'open' && <Lock className="h-3 w-3" />}
            {kindLabel}
          </p>
          <h1 className={cn('mt-1 break-words text-[22px] leading-tight tracking-tight text-rh-ink [overflow-wrap:anywhere] sm:text-[34px]', displayFont)}>
            {data.room.title}
          </h1>
          {data.room.description && <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-rh-ink/60 sm:text-[15px] sm:leading-6">{data.room.description}</p>}
          {/* The champion (or a Learn admin) gives the group its picture */}
          {group?.canEditImage && <GroupImageButton groupId={group.id} hasImage={Boolean(group.imageUrl)} className="mt-3" />}
          {group && group.members.length > 0 ? (
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <div className="flex shrink-0 -space-x-2">
                {group.members.slice(0, 8).map((m) => (
                  <Avatar key={m.id} name={m.name} imageUrl={m.imageUrl} size={26} className="ring-2 ring-white" />
                ))}
              </div>
              <span className="min-w-0 truncate text-xs text-rh-ink/55">
                {plural(group.memberCount, 'person', 'people')}
                {leads.length
                  ? ` · led by ${leads
                      .slice(0, 2)
                      .map((m) => firstName(m.name))
                      .join(' & ')}`
                  : ''}
              </span>
            </div>
          ) : (
            !group && (
              <p className="mt-3 text-xs text-rh-ink/50">
                {data.room.postCount === 0 ? 'No posts yet' : plural(data.room.postCount, 'post')}
                {data.room.lastActivityAt ? ` · active ${shortAgo(data.room.lastActivityAt)}` : ''}
              </p>
            )
          )}
        </div>
      </section>

      <div className={group && data.state === 'ok' ? '' : 'mt-6 sm:mt-8'}>
        {group && data.state === 'ok' ? (
          <GroupHub
            groupId={group.id}
            posts={
              data.posts.length === 0 ? (
                <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="Nothing here yet" action={startFirst}>
                  Say hello, share notes or ask the group a question.
                </EmptyState>
              ) : (
                feed
              )
            }
          />
        ) : data.state === 'join' ? (
          <JoinPrompt signedIn={data.signedIn} returnTo={roomPath(slug)} />
        ) : data.state === 'locked' ? (
          <EmptyState icon={<Lock className="h-5 w-5" />} title={data.room.kind === 'group' ? 'A private group' : 'For this course’s learners'}>
            {data.room.kind === 'group'
              ? 'Only the group’s members can see this room. Ask the group’s lead for an invite link.'
              : data.room.kind === 'program'
                ? 'This room is for learners on the MSK Specialist Program.'
                : 'Enrol in the course to join its room and ask the instructor questions.'}
          </EmptyState>
        ) : data.posts.length === 0 ? (
          <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="Nothing here yet" action={startFirst}>
            Ask a question or start a discussion in {data.room.title}.
          </EmptyState>
        ) : (
          feed
        )}
      </div>

      {data.state === 'ok' && (
        <PostComposer
          open={composing}
          onClose={() => setComposing(false)}
          rooms={rooms.length ? rooms : [{ ...data.room }]}
          defaultRoom={slug}
          key={slug}
        />
      )}
    </main>
  )
}

export function BackToCommunity({ label = 'Community' }: { label?: string }) {
  return (
    <Link href={COMMUNITY_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  )
}

