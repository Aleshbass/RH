'use client'

/**
 * Learn › Community (owner 2026-11-12: one community with Learn rooms; students never see the
 * approved-physio community). Open rooms for every member, a room per course for its learners,
 * and the MSK Specialist Program room for its cohort.
 */

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowUpRight,
  GraduationCap,
  HelpCircle,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  Plus,
  Radio,
  ShieldAlert,
  ThumbsUp,
  Users,
} from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, fieldClass, pillInk, pillOutline } from '../shared'
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
  type CommunityRoom,
  type PostSummary,
  type ReportRow,
} from './socialApi'
import { Avatar, EmptyState, JoinPrompt, Sheet, Skeleton } from './ui'
import { groupTone, myGroupsRef } from '@/lib/learnAdminsApi'

const KIND_LABEL = { question: 'Question', discussion: 'Discussion' } as const

function roomIcon(room: Pick<CommunityRoom, 'kind' | 'slug'>) {
  if (room.kind === 'group') return Users
  if (room.kind === 'course') return GraduationCap
  if (room.kind === 'program') return Users
  if (room.slug === 'ask-a-physio') return HelpCircle
  return MessageCircle
}

// ── Post row ──────────────────────────────────────────────────────────────────

export function PostRow({ post, showRoom = true, index = 0 }: { post: PostSummary & { hidden?: boolean }; showRoom?: boolean; index?: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={postPath(post.id)}
        className="group block rounded-3xl border border-rh-ink/[0.07] bg-white p-5 transition hover:-translate-y-0.5 hover:border-rh-ink/15 hover:shadow-[0_12px_32px_-18px_rgba(10,20,18,0.35)] sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 font-semibold',
              post.kind === 'question' ? 'bg-rh-honeydew text-rh-ink' : 'bg-rh-cream text-rh-ink/75'
            )}
          >
            {KIND_LABEL[post.kind]}
          </span>
          {showRoom && <span className="font-medium text-rh-ink/50">in {post.room.title}</span>}
          {post.hidden && <span className="rounded-full bg-rh-danger-soft px-2.5 py-1 font-semibold text-rh-danger-ink">Hidden</span>}
        </div>
        <h3 className="mt-3 text-[17px] font-semibold leading-snug text-rh-ink group-hover:underline group-hover:decoration-rh-ink/30 group-hover:underline-offset-4">
          {post.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-[14px] leading-6 text-rh-ink/60">{post.excerpt}</p>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={post.author?.name ?? 'Member'} imageUrl={post.author?.imageUrl} size={28} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-rh-ink">{post.author?.name ?? 'Former member'}</span>
            {post.author?.tag && <TagBadge tag={post.author.tag} size="xs" />}
            <span className="text-xs text-rh-ink/45">{relativeTime(post.lastActivityAt)}</span>
          </div>
          <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-rh-ink/55">
            {post.helpfulCount > 0 && (
              <span className="flex items-center gap-1">
                <ThumbsUp className="h-3.5 w-3.5" /> {post.helpfulCount}
              </span>
            )}
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> {post.replyCount}
            </span>
          </span>
        </div>
      </Link>
    </motion.li>
  )
}

function PostListSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-40 rounded-3xl" />
        </li>
      ))}
    </ul>
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
  const [busy, setBusy] = useState(false)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const id = await createPost({ roomSlug: room, kind, title, body })
      playSound('send')
      setTitle('')
      setBody('')
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
        <div className="flex rounded-full bg-rh-cream p-1" role="radiogroup" aria-label="Kind of post">
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
              {kind === k && (
                <motion.span layoutId="composer-kind" className="absolute inset-0 rounded-full bg-white shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
              )}
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
          <textarea
            id="post-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={6}
            placeholder="Add context, what you’ve tried, or what you’d like to talk about."
            className={cn(fieldClass, 'mt-2 h-auto min-h-[140px] resize-y py-3 leading-6')}
          />
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

function RoomLink({ room }: { room: CommunityRoom }) {
  const Icon = roomIcon(room)
  return (
    <Link href={roomPath(room.slug)} className="group flex items-start gap-3 rounded-2xl p-3 transition hover:bg-rh-cream">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-cream text-rh-ink transition group-hover:bg-white">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-rh-ink">
          <span className="truncate">{room.title}</span>
          {room.kind !== 'open' && (
            <Lock className="h-3 w-3 shrink-0 text-rh-ink/40" aria-label={room.kind === 'group' ? 'Private group' : 'For learners only'} />
          )}
        </span>
        <span className="mt-0.5 block text-xs text-rh-ink/50">
          {room.postCount === 0 ? 'No posts yet' : `${room.postCount} post${room.postCount === 1 ? '' : 's'}`}
          {room.lastActivityAt ? ` · active ${relativeTime(room.lastActivityAt)}` : ''}
        </span>
      </span>
    </Link>
  )
}

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

/** The member's small groups (Admin › Learn › Groups): each opens its private room. */
function MyGroups() {
  const groups = useQuery(myGroupsRef, {})
  if (!groups?.length) return null
  return (
    <section aria-labelledby="groups-heading" className="mt-8">
      <h2 id="groups-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
        Your groups
      </h2>
      <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {groups.map((g) => {
          const tone = groupTone(g.color)
          return (
            <Link
              key={g.id}
              href={roomPath(g.roomSlug)}
              className="group flex w-[78vw] max-w-[320px] shrink-0 snap-start items-start gap-3 rounded-2xl border border-rh-ink/[0.07] bg-white p-4 transition hover:border-rh-ink/20 sm:w-auto sm:max-w-none"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tone.soft, color: tone.ink }}>
                <Users className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-rh-ink">{g.name}</span>
                  {g.role === 'lead' && <span className="shrink-0 rounded-full bg-rh-lime px-1.5 py-px text-[10px] font-semibold text-[#0a0a0a]">Lead</span>}
                </span>
                <span className="mt-0.5 block text-xs text-rh-ink/50">
                  {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}
                  {g.lastActivityAt ? ` · active ${relativeTime(g.lastActivityAt)}` : ' · say hello'}
                </span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-rh-ink/30 transition group-hover:text-rh-ink" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ── Community home ────────────────────────────────────────────────────────────

export function CommunityHome() {
  const data = useQuery(communityApi.home, {})
  const [composing, setComposing] = useState(false)
  const identity = data?.member

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={cn('text-[36px] leading-tight tracking-tight text-rh-ink sm:text-[48px]', displayFont)}>Community</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-6 text-rh-ink/60">
            Ask questions, share what you’re learning and help each other: physiotherapists and physio students together.
          </p>
        </div>
        {identity && (
          <button type="button" onClick={() => setComposing(true)} className={cn(pillInk, 'h-12 self-start px-6 sm:self-auto')}>
            <Plus className="h-4 w-4" /> Start a post
          </button>
        )}
      </div>

      {data?.member && data.physioCommunity && (
        <a
          href={mainSiteUrl('/dashboard/physiotherapist/community')}
          className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-rh-ink/[0.08] bg-rh-cream px-5 py-4 text-sm transition hover:border-rh-ink/20"
        >
          <span className="text-rh-ink/70">
            <span className="font-semibold text-rh-ink">Rehabify physio community</span> · the clinicians-only space in your dashboard
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-rh-ink/50" />
        </a>
      )}

      {data?.member && <ReportsPanel />}

      {data?.member && <MyGroups />}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="latest-heading">
          <h2 id="latest-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
            Latest
          </h2>
          <div className="mt-4">
            {data === undefined ? (
              <PostListSkeleton />
            ) : !data.member ? (
              <JoinPrompt signedIn={data.signedIn} returnTo={COMMUNITY_PATH} />
            ) : data.latest.length === 0 ? (
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
            ) : (
              <ul className="space-y-3">
                {data.latest.map((post, i) => (
                  <PostRow key={post.id} post={post} index={i} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <SpacesPromo />
          <section aria-labelledby="rooms-heading" className="rounded-3xl border border-rh-ink/[0.07] bg-white p-3">
            <h2 id="rooms-heading" className="px-3 pb-1 pt-2 text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
              Rooms
            </h2>
            {data === undefined ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <div>
                {data.rooms
                  .filter((room) => room.kind !== 'group')
                  .map((room) => (
                    <RoomLink key={room.slug} room={room} />
                  ))}
              </div>
            )}
          </section>
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

  if (data === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <Skeleton className="h-10 w-2/3" />
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
  const tone = group ? groupTone(group.color) : null

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <BackToCommunity />
      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', !tone && 'bg-rh-ink text-rh-lime')}
            style={tone ? { background: tone.soft, color: tone.ink } : undefined}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            {group && (
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
                <Lock className="h-3 w-3" /> Private group{group.myRole === 'lead' ? ' · you lead it' : ''}
              </p>
            )}
            <h1 className={cn('text-[30px] leading-tight tracking-tight text-rh-ink sm:text-[38px]', displayFont)}>{data.room.title}</h1>
            {data.room.description && <p className="mt-1.5 max-w-lg text-[15px] leading-6 text-rh-ink/60">{data.room.description}</p>}
            {group && group.members.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex -space-x-2">
                  {group.members.slice(0, 8).map((m) => (
                    <Avatar key={m.id} name={m.name} imageUrl={m.imageUrl} size={28} className="ring-2 ring-white" />
                  ))}
                </div>
                <span className="text-xs text-rh-ink/55">
                  {group.memberCount} {group.memberCount === 1 ? 'person' : 'people'}
                  {group.members.some((m) => m.role === 'lead')
                    ? ` · led by ${group.members
                        .filter((m) => m.role === 'lead')
                        .slice(0, 2)
                        .map((m) => m.name.split(' ')[0])
                        .join(' & ')}`
                    : ''}
                </span>
              </div>
            )}
          </div>
        </div>
        {data.state === 'ok' && (
          <button type="button" onClick={() => setComposing(true)} className={cn(pillInk, 'h-12 shrink-0 self-start px-6 sm:self-auto')}>
            <Plus className="h-4 w-4" /> New post
          </button>
        )}
      </div>

      <div className="mt-8">
        {data.state === 'join' ? (
          <JoinPrompt signedIn={data.signedIn} returnTo={roomPath(slug)} />
        ) : data.state === 'locked' ? (
          <EmptyState icon={<Lock className="h-5 w-5" />} title={data.room.kind === 'group' ? 'A private group' : 'For this course’s learners'}>
            {data.room.kind === 'group'
              ? 'Only the group’s members can see this room. The Learn team adds people to groups.'
              : data.room.kind === 'program'
                ? 'This room is for learners on the MSK Specialist Program.'
                : 'Enrol in the course to join its room and ask the instructor questions.'}
          </EmptyState>
        ) : data.posts.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-5 w-5" />}
            title="Nothing here yet"
            action={
              <button type="button" onClick={() => setComposing(true)} className={cn(pillInk, 'h-11 px-5')}>
                Start the first post
              </button>
            }
          >
            Ask a question or start a discussion in {data.room.title}.
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-3">
              {data.posts.map((post, i) => (
                <PostRow key={post.id} post={post} showRoom={false} index={i} />
              ))}
            </ul>
            {data.hasMore && (
              <div className="mt-6 text-center">
                <button type="button" onClick={() => setLimit((l) => l + 20)} className={cn(pillOutline, 'h-11 px-6')}>
                  Show more
                </button>
              </div>
            )}
          </>
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

