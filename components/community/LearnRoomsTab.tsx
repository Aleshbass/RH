'use client'

/**
 * Physio dashboard › Community › Learn (owner 2026-11-13). Approved Rehabify physios take part in
 * the Rehabify Learn community too: students' questions nobody has answered yet come first, then
 * the latest conversations and the rooms. Replies and new posts happen on Learn, where the
 * physio shows with their "Rehabify physio" tag.
 */

import { useQuery } from 'convex/react'
import { makeFunctionReference, type RegisteredQuery } from 'convex/server'
import { formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, ChevronRight, GraduationCap, HelpCircle, Lock, MessageCircle, MessageSquare, Plus, Users } from '@/components/icons'
import { EmptyState, Panel } from '@/components/physio/ui'
import type * as learnCommunity from '@/convex/learnCommunity'
import { learnUrl } from '@/lib/site-hosts'
import { cn } from '@/lib/utils'

type Returns<T> = T extends RegisteredQuery<'public', infer _A, infer R> ? Awaited<R> : never
type ForClinicians = Returns<typeof learnCommunity.forClinicians>
type Post = NonNullable<ForClinicians>['latest'][number]
type Room = NonNullable<ForClinicians>['rooms'][number]

// Plain reference: the generated api type is at TypeScript's depth limit (TS2589)
const forCliniciansRef = makeFunctionReference<'query', Record<string, never>, ForClinicians>('learnCommunity:forClinicians')

const postHref = (id: string) => learnUrl(`/community/post/${id}`)

function roomIcon(room: Pick<Room, 'kind' | 'slug'>) {
  if (room.kind === 'course') return GraduationCap
  if (room.kind === 'program') return Users
  if (room.slug === 'ask-a-physio') return HelpCircle
  return MessageCircle
}

function PostCard({ post, highlight = false }: { post: Post; highlight?: boolean }) {
  return (
    <a
      href={postHref(post.id)}
      className={cn(
        'block rounded-3xl border p-4 transition hover:bg-pt-hover sm:p-5',
        highlight ? 'border-pt-green-fg/30 bg-pt-surface' : 'border-pt-line bg-pt-surface'
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-pt-muted">
        <span>{post.room.title}</span>
        <span>·</span>
        <span>{post.kind === 'question' ? 'Question' : 'Discussion'}</span>
      </p>
      <p className="mt-1.5 text-[15px] font-semibold leading-snug text-pt-ink">{post.title}</p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-pt-muted">{post.excerpt}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-pt-muted">
        <span className="font-semibold text-pt-ink">{post.author?.name ?? 'Former member'}</span>
        {post.author?.tag && <span>· {post.author.tag.label}</span>}
        <span>· {formatDistanceToNow(post.lastActivityAt, { addSuffix: true })}</span>
        <span className="ml-auto flex items-center gap-1 font-semibold">
          <MessageSquare className="h-3.5 w-3.5" /> {post.replyCount}
        </span>
      </p>
      {highlight && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-pt-green-fg">
          Answer on Learn <ArrowUpRight className="h-3.5 w-3.5" />
        </p>
      )}
    </a>
  )
}

export function LearnRoomsTab() {
  const data = useQuery(forCliniciansRef, {})

  if (data === undefined) return <div className="h-40 animate-pulse rounded-3xl bg-pt-sunken" />
  if (data === null) {
    return (
      <Panel>
        <EmptyState icon={<GraduationCap />} title="Learn community isn’t available" description="Sign in again, then come back to this tab." />
      </Panel>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl bg-pt-primary p-5 text-pt-on-primary sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-[17px] font-semibold leading-snug">Rehabify Learn community</p>
          <p className="mt-1 text-[13px] opacity-75">Physio students and physiotherapists learning together. Your answers show with your Rehabify physio tag.</p>
        </div>
        <a
          href={learnUrl('/community')}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white/10 px-5 text-sm font-semibold transition hover:bg-white/15"
        >
          <Plus className="h-4 w-4" /> Start a post
        </a>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-pt-ink">Students are asking</h2>
        {data.unanswered.length ? (
          data.unanswered.map((post) => <PostCard key={post.id} post={post} highlight />)
        ) : (
          <p className="text-sm text-pt-muted">No unanswered questions right now.</p>
        )}
      </section>

      {data.latest.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-pt-ink">Latest conversations</h2>
          {data.latest.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-pt-ink">Rooms</h2>
        <Panel>
          <ul className="divide-y divide-pt-line">
            {data.rooms.map((room) => {
              const Icon = roomIcon(room)
              return (
                <li key={room.slug}>
                  <a href={learnUrl(`/community/${room.slug}`)} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-pt-hover">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pt-sunken text-pt-ink">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-pt-ink">
                        <span className="truncate">{room.title}</span>
                        {room.kind !== 'open' && <Lock className="h-3 w-3 shrink-0 text-pt-faint" />}
                      </span>
                      <span className="block text-xs text-pt-muted">
                        {room.postCount === 0 ? 'No posts yet' : `${room.postCount} post${room.postCount === 1 ? '' : 's'}`}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-pt-faint" />
                  </a>
                </li>
              )
            })}
          </ul>
        </Panel>
      </section>
    </div>
  )
}
