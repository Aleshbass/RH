'use client'

/**
 * One community post with its replies (Learn › Community › post).
 *
 * Redesign 2026-11-21 (owner: replies felt "disconnected from the real post"; Circle as the model):
 * the post and its replies are one card that reads as a thread, a thin line running from the
 * author's picture down through every reply's picture. The reply box sits right under the post on
 * computers and is docked to the bottom of the screen on phones. Links ending #reply-<id> (reply and
 * mention notifications) open the thread at that reply; #reply opens it ready to write.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { Id } from '@/convex/_generated/dataModel'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, Flag, Loader2, Lock, MessageCircle, MoreHorizontal, Reply as ReplyIcon, Send, Trash2 } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, pillInk } from '../shared'
import { TagBadge } from '../platform/identity'
import { communityApi, errorText, postPath, relativeTime, roomPath, type PostPage } from './socialApi'
import { BackToCommunity } from './Community'
import { PostShareButton } from './PostShare'
import { Avatar, EmptyState, JoinPrompt, Sheet, Skeleton, useKeyboardInset } from './ui'
import { GroupChip } from './GroupPicker'
import { activeMentions, MentionText, MentionTextarea, type Mention, type MentionTextareaHandle } from './Mentions'
import { DoubleTapLove, HeartButton, LovedBy, useLove } from './Love'
import { colorDot, roomColor, shortAgo, usePhone } from './CommunityCards'

type Ok = Extract<PostPage, { state: 'ok' }>
type ReplyRow = Ok['replies'][number]
type Person = { id: string; name: string } | null | undefined
type Target = { type: 'post' | 'reply'; id: string; authorId: string | null; hidden: boolean; helpfulCount: number; markedHelpful: boolean }

const REPORT_REASONS = ['Shares patient details', 'Unsafe clinical advice', 'Spam or advertising', 'Rude or harassing', 'Something else']

/** The thread line, centred in the picture column. */
const LINE = 'pointer-events-none absolute left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-rh-ink/[0.09]'
const POST_AVATAR = 36
const REPLY_AVATAR = 30

/** A post or reply that can be loved: the heart below it, and double-tap anywhere on it. */
function Lovable({
  target,
  own,
  disabled,
  children,
  actions,
  lovedBy,
  className,
  compact = false,
}: {
  target: Target
  own: boolean
  disabled?: boolean
  children: React.ReactNode
  actions: React.ReactNode
  lovedBy?: string[]
  className?: string
  compact?: boolean
}) {
  const love = useLove({ type: target.type, id: target.id }, target.markedHelpful, target.helpfulCount, own)
  return (
    <DoubleTapLove onLove={() => void love.set(true)} disabled={disabled || own} className={className}>
      {children}
      {/* Pulled left so the heart lines up with the text above it */}
      <div className={cn('flex flex-wrap items-center gap-1', compact ? '-ml-2.5 mt-1' : '-ml-2.5 mt-3')}>
        <HeartButton loved={love.loved} count={love.count} own={own} onToggle={(next) => love.set(next)} />
        {actions}
      </div>
      {lovedBy && (
        <div className="mt-1 px-1">
          <LovedBy names={lovedBy} count={love.count} loved={love.loved} />
        </div>
      )}
    </DoubleTapLove>
  )
}

function MoreMenu({ target, canDelete, canModerate, onReport }: { target: Target; canDelete: boolean; canModerate: boolean; onReport: () => void }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const remove = useMutation(communityApi.remove)
  const moderate = useMutation(communityApi.adminModerate)
  const del = async () => {
    setOpen(false)
    if (!window.confirm(target.type === 'post' ? 'Delete this post and its replies?' : 'Delete this reply?')) return
    try {
      await remove({ targetType: target.type, targetId: target.id })
      toast.success('Deleted')
      if (target.type === 'post') router.back()
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t delete.'))
    }
  }
  const hide = async () => {
    setOpen(false)
    try {
      await moderate({ targetType: target.type, targetId: target.id, action: target.hidden ? 'restore' : 'hide' })
      toast.success(target.hidden ? 'Restored' : 'Hidden from members')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t update.'))
    }
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-rh-ink/50 transition hover:bg-rh-ink/[0.06] hover:text-rh-ink"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-rh-ink/[0.08] bg-white p-1.5 shadow-xl"
            >
              <button type="button" onClick={() => {
                  setOpen(false)
                  onReport()
                }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rh-ink hover:bg-rh-cream">
                <Flag className="h-3.5 w-3.5" /> Report
              </button>
              {canModerate && (
                <button type="button" onClick={() => void hide()} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rh-ink hover:bg-rh-cream">
                  {target.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} {target.hidden ? 'Restore' : 'Hide'}
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => void del()} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rh-danger-ink hover:bg-rh-danger-soft">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function ReportSheet({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const report = useMutation(communityApi.report)
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!target) return
    setBusy(true)
    try {
      await report({ targetType: target.type, targetId: target.id, reason })
      toast.success('Thanks. The Rehabify team will take a look.')
      onClose()
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t send the report.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open={Boolean(target)}
      onClose={onClose}
      title="Report"
      footer={
        <button type="button" onClick={() => void send()} disabled={busy} className={cn(pillInk, 'h-11 w-full')}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send report
        </button>
      }
    >
      <p className="text-sm leading-6 text-rh-ink/60">What’s wrong with this {target?.type === 'reply' ? 'reply' : 'post'}?</p>
      <div className="mt-4 space-y-2" role="radiogroup">
        {REPORT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition',
              reason === r ? 'border-rh-ink bg-rh-cream text-rh-ink' : 'border-rh-ink/10 text-rh-ink/75 hover:border-rh-ink/25'
            )}
          >
            {r}
            <span className={cn('h-4 w-4 rounded-full border-2', reason === r ? 'border-rh-ink bg-rh-ink shadow-[inset_0_0_0_2px_white]' : 'border-rh-ink/25')} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

/**
 * The reply box. Computers: attached under the post, beside your picture. Phones: docked to the
 * bottom of the screen (above the keyboard and the home bar), one line that grows as you type.
 */
function ReplyBox({
  postId,
  boxRef,
  onSent,
}: {
  postId: Ok['post']['id']
  boxRef: React.RefObject<MentionTextareaHandle | null>
  onSent: (replyId: string) => void
}) {
  const reply = useMutation(communityApi.reply)
  const phone = usePhone()
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState<Mention[]>([])
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  // iPhones cover the bottom of the page with the keyboard: lift the docked box above it
  const keyboard = useKeyboardInset(phone === true && focused)
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      const tagged = activeMentions(body, mentions)
      const id = await reply({ postId, body, ...(tagged.length ? { mentions: tagged } : {}) })
      playSound('send')
      setBody('')
      setMentions([])
      onSent(id)
    } catch (err) {
      playSound('error')
      toast.error(errorText(err, 'Couldn’t send your reply.'))
    } finally {
      setBusy(false)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
  }
  return (
    <form
      id="reply"
      onSubmit={submit}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      style={phone ? { bottom: keyboard } : undefined}
      className={cn(
        'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:border-t max-sm:border-rh-ink/[0.08] max-sm:bg-white max-sm:px-3 max-sm:pt-2',
        keyboard ? 'max-sm:pb-2' : 'max-sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
        'sm:rounded-2xl sm:border sm:border-rh-ink/10 sm:bg-white sm:p-1.5 sm:transition sm:focus-within:border-rh-ink/30'
      )}
    >
      <label htmlFor="reply-body" className="sr-only">
        Your reply
      </label>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 rounded-[22px] bg-rh-ink/[0.05] sm:rounded-none sm:bg-transparent">
          <MentionTextarea
            id="reply-body"
            ref={boxRef}
            value={body}
            onValueChange={setBody}
            mentions={mentions}
            onMentionsChange={setMentions}
            postId={postId}
            autoGrowMax={phone ? 132 : 320}
            onKeyDown={onKey}
            rows={1}
            maxLength={4000}
            placeholder="Write a reply…"
            // 16px on phones: iPhones zoom into anything smaller
            className="block w-full resize-none bg-transparent px-4 py-2.5 text-base leading-6 text-rh-ink placeholder:text-rh-ink/40 focus:outline-none sm:min-h-[52px] sm:px-3 sm:text-[15px]"
          />
        </div>
        <button type="submit" disabled={!body.trim() || busy} aria-label="Send reply" className={cn(pillInk, 'h-11 w-11 shrink-0 px-0 py-0 sm:hidden')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <div className="hidden items-center justify-between gap-3 px-2 pb-0.5 pt-1 sm:flex">
        <p className="text-xs text-rh-ink/45">Type @ to tag someone. Keep patients unidentifiable.</p>
        <button type="submit" disabled={!body.trim() || busy} className={cn(pillInk, 'h-10 px-4')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Reply
        </button>
      </div>
    </form>
  )
}

/** "Reply" on someone writes "@Name " first: show that as "Replying to @Name" above the rest. */
function replyLead(r: ReplyRow): { to: { id: string; name: string } | null; body: string } {
  const lower = r.body.toLowerCase()
  for (const m of r.mentions) {
    const tag = `@${m.name}`
    if (!lower.startsWith(tag.toLowerCase())) continue
    const rest = r.body.slice(tag.length).replace(/^[\s,:;–-]+/, '')
    if (rest) return { to: m, body: rest }
  }
  return { to: null, body: r.body }
}

/** One step of the thread: the picture column (carrying the line) and the content beside it. */
function ThreadStep({
  id,
  avatar,
  above,
  below,
  highlight,
  children,
}: {
  id?: string
  avatar: ReactNode
  above: boolean
  below: boolean
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <div
      id={id}
      className={cn('relative flex scroll-mt-32 gap-2.5 px-4 transition-colors duration-700 sm:gap-3 sm:px-6', highlight && 'bg-rh-lime/[0.09]')}
    >
      <div className="relative flex w-9 shrink-0 justify-center">
        {above && <span aria-hidden className={cn(LINE, 'top-0 h-[9px]')} />}
        <span className="relative mt-3 flex">{avatar}</span>
        {below && <span aria-hidden className={cn(LINE, 'bottom-0')} style={{ top: 12 + REPLY_AVATAR + 3 }} />}
      </div>
      <div className="min-w-0 flex-1 py-3">{children}</div>
    </div>
  )
}

function ThreadSkeleton() {
  return (
    <div className="mt-4 rounded-3xl border border-rh-ink/[0.07] bg-white p-4 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 sm:mt-6 sm:p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="mt-5 h-7 w-3/4" />
      <Skeleton className="mt-3 h-24" />
    </div>
  )
}

export function PostView({ postId }: { postId: string }) {
  const data = useQuery(communityApi.post, { postId })
  const phone = usePhone()
  const [reporting, setReporting] = useState<Target | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [justSent, setJustSent] = useState<string | null>(null)
  const replyBox = useRef<MentionTextareaHandle | null>(null)
  const openedHash = useRef(false)
  const flashTimer = useRef(0)

  /** Scroll to a reply and tint it for a moment, so it's clear which one. */
  const showReply = useCallback((replyId: string) => {
    const el = document.getElementById(`reply-${replyId}`)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(replyId)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 2200)
    return true
  }, [])

  const focusComposer = useCallback(() => {
    replyBox.current?.focus()
    if (!window.matchMedia('(max-width: 639px)').matches) document.getElementById('reply')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // "Reply" on someone's message: tag them in the reply box and bring it into view
  const replyTo = (person: Person) => {
    if (!person) return focusComposer()
    replyBox.current?.mention({ id: person.id as Id<'users'>, name: person.name })
    if (!phone) document.getElementById('reply')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const ok = data?.state === 'ok' ? data : null
  const replyIds = ok?.replies.map((r) => r.id).join(',') ?? ''

  // Links from notifications (#reply-<id>) and the feed's Reply button (#reply), once loaded
  useEffect(() => {
    if (!ok || openedHash.current) return
    openedHash.current = true
    const hash = window.location.hash
    requestAnimationFrame(() => {
      if (hash.startsWith('#reply-')) showReply(decodeURIComponent(hash.slice('#reply-'.length)))
      else if (hash === '#reply') focusComposer()
    })
  }, [ok, showReply, focusComposer])

  // Your new reply joins the end of the thread: take you to it
  useEffect(() => {
    if (justSent && replyIds.includes(justSent) && showReply(justSent)) setJustSent(null)
  }, [justSent, replyIds, showReply])

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  if (data === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6 sm:pt-10">
        <Skeleton className="h-5 w-32" />
        <ThreadSkeleton />
      </main>
    )
  }
  if (data.state !== 'ok') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <BackToCommunity />
        <div className="mt-8">
          {data.state === 'join' ? (
            <JoinPrompt signedIn={data.signedIn} returnTo={postPath(postId)} />
          ) : data.state === 'locked' ? (
            <EmptyState icon={<Lock className="h-5 w-5" />} title="For this course’s learners">
              This conversation is in a room for learners on {data.room.title}.
            </EmptyState>
          ) : (
            <EmptyState icon={<MessageCircle className="h-5 w-5" />} title="This post isn’t here any more" />
          )}
        </div>
      </main>
    )
  }

  const { post, replies, viewerId, canModerate, viewer } = data
  const postTarget: Target = { type: 'post', id: post.id, authorId: post.author?.id ?? null, hidden: post.hidden, helpfulCount: post.helpfulCount, markedHelpful: post.markedHelpful }
  const dot = colorDot(roomColor(data.room))
  const authorName = post.author?.name ?? 'Former member'
  const composer = !post.hidden
  const count = replies.length

  // "Replying to @Ada": jump to Ada's last message above this reply (or the post, if it's hers)
  const jumpTo = (personId: string, index: number) => {
    for (let j = index - 1; j >= 0; j--) if (replies[j].author?.id === personId) return void showReply(replies[j].id)
    if (post.author?.id === personId) document.getElementById('post')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 sm:px-6 sm:pb-24 sm:pt-10">
      {/* Phones: a compact bar under the Learn header, so you always know where you are */}
      <div className="sticky top-16 z-30 -mx-4 flex h-12 items-center gap-1.5 border-b border-rh-ink/[0.06] bg-learn-page/95 pl-1 pr-4 backdrop-blur sm:hidden">
        <Link
          href={roomPath(data.room.slug)}
          aria-label={`Back to ${data.room.title}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-rh-ink transition active:bg-rh-ink/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold text-rh-ink">{data.room.title}</p>
          <p className="truncate text-[11px] text-rh-ink/50">
            {post.kind === 'question' ? 'Question' : 'Discussion'} by {authorName}
          </p>
        </div>
      </div>

      <Link href={roomPath(data.room.slug)} className="hidden items-center gap-2 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink sm:inline-flex">
        <ArrowLeft className="h-3.5 w-3.5" />
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: dot }} />
        {data.room.title}
      </Link>

      {/* The post and its replies: one card, one thread */}
      <div className="border-rh-ink/[0.07] bg-white max-sm:-mx-4 max-sm:border-b sm:mt-5 sm:rounded-3xl sm:border">
        <article id="post" aria-labelledby="post-title" className="scroll-mt-32 px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2.5 sm:gap-x-3">
            {/* Computers: the post sits beside the author's picture and the thread line starts here */}
            <div className="relative flex justify-center sm:row-span-2">
              <Avatar name={authorName} imageUrl={post.author?.imageUrl} size={POST_AVATAR} />
              {(composer || count > 0) && <span aria-hidden className={cn(LINE, 'bottom-0 hidden sm:block')} style={{ top: POST_AVATAR + 3 }} />}
            </div>
            <header className="flex min-w-0 items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-[14px] font-semibold leading-5 text-rh-ink">{authorName}</span>
                  {post.author?.tag && <TagBadge tag={post.author.tag} size="xs" />}
                  <GroupChip group={post.author?.group} />
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-rh-ink/50">
                  <Link href={roomPath(data.room.slug)} className="inline-flex items-center gap-1 font-semibold text-rh-ink/65 hover:text-rh-ink">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
                    {data.room.title}
                  </Link>
                  <span aria-hidden>·</span>
                  <time dateTime={new Date(post.createdAt).toISOString()} title={new Date(post.createdAt).toLocaleString('en-GB')}>
                    {relativeTime(post.createdAt)}
                  </time>
                </p>
              </div>
              <div className="-mr-2 -mt-1">
                <MoreMenu target={postTarget} canDelete={post.author?.id === viewerId || canModerate} canModerate={canModerate} onReport={() => setReporting(postTarget)} />
              </div>
            </header>
            <div className="col-span-2 mt-3 min-w-0 pb-4 sm:col-span-1 sm:col-start-2 sm:pb-5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={cn('rounded-full px-2 py-0.5 font-semibold', post.kind === 'question' ? 'bg-rh-honeydew text-rh-ink' : 'bg-rh-cream text-rh-ink/75')}>
                  {post.kind === 'question' ? 'Question' : 'Discussion'}
                </span>
                {post.hidden && <span className="rounded-full bg-rh-danger-soft px-2 py-0.5 font-semibold text-rh-danger-ink">Hidden from members</span>}
              </div>
              <h1
                id="post-title"
                className={cn('mt-2 break-words text-[20px] leading-snug tracking-tight text-rh-ink [overflow-wrap:anywhere] sm:text-[28px] sm:leading-tight', displayFont)}
              >
                {post.title}
              </h1>
              <Lovable
                target={postTarget}
                own={post.author?.id === viewerId}
                disabled={post.hidden}
                lovedBy={post.lovedBy}
                className="mt-2.5 sm:mt-3"
                actions={
                  <>
                    {composer && (
                      <button
                        type="button"
                        onClick={() => replyTo(post.author && post.author.id !== viewerId ? post.author : null)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-rh-ink/60 transition hover:bg-rh-ink/[0.06] hover:text-rh-ink"
                      >
                        <ReplyIcon className="h-3.5 w-3.5" /> Reply
                      </button>
                    )}
                    {data.room.kind === 'open' && !post.hidden && (
                      <span className="ml-auto">
                        <PostShareButton postId={post.id} title={post.title} />
                      </span>
                    )}
                  </>
                }
              >
                <div className="whitespace-pre-line break-words text-[14px] leading-6 text-rh-ink/85 [overflow-wrap:anywhere] sm:text-[16px] sm:leading-7">
                  <MentionText text={post.body} mentions={post.mentions} />
                </div>
              </Lovable>
            </div>
          </div>
        </article>

        {/* Computers: the reply box hangs off the thread, beside your picture. Phones: docked below. */}
        {composer && (
          <div className="sm:flex sm:gap-3 sm:px-6 sm:pb-3">
            <div className="relative hidden w-9 shrink-0 justify-center sm:flex">
              <span aria-hidden className={cn(LINE, 'top-0 h-[9px]')} />
              <span className="relative mt-3 flex">
                <Avatar name={viewer.name} imageUrl={viewer.imageUrl} size={REPLY_AVATAR} />
              </span>
              {count > 0 && <span aria-hidden className={cn(LINE, 'bottom-0')} style={{ top: 12 + REPLY_AVATAR + 3 }} />}
            </div>
            <div className="min-w-0 flex-1 sm:pt-1.5">
              <ReplyBox postId={post.id} boxRef={replyBox} onSent={setJustSent} />
            </div>
          </div>
        )}

        {count === 0 ? (
          <p className="border-t border-rh-ink/[0.06] px-4 py-4 text-[13px] text-rh-ink/50 sm:border-0 sm:pb-6 sm:pl-[4.5rem] sm:pt-1">
            No replies yet. {composer ? 'Be the first to help.' : ''}
          </p>
        ) : (
          <section aria-labelledby="replies-heading" className="pb-2 sm:pb-3">
            <div className="relative flex gap-2.5 px-4 sm:gap-3 sm:px-6">
              <div className="relative w-9 shrink-0">
                {/* Phones: the thread starts here; computers: it carries on from the post */}
                <span aria-hidden className={cn(LINE, 'bottom-0 top-1/2 sm:top-0')} />
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-3 py-2">
                <h2 id="replies-heading" className="shrink-0 text-xs font-semibold text-rh-ink/55">
                  {count} {count === 1 ? 'reply' : 'replies'}
                </h2>
                <span aria-hidden className="h-px flex-1 bg-rh-ink/[0.07]" />
              </div>
            </div>
            <ul>
              <AnimatePresence initial={false}>
                {replies.map((r, i) => {
                  const target: Target = { type: 'reply', id: r.id, authorId: r.author?.id ?? null, hidden: r.hidden, helpfulCount: r.helpfulCount, markedHelpful: r.markedHelpful }
                  const name = r.author?.name ?? 'Former member'
                  const lead = replyLead(r)
                  const byPostAuthor = Boolean(r.author && r.author.id === post.author?.id)
                  return (
                    <motion.li
                      key={r.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className={cn(r.hidden && 'opacity-60')}
                    >
                      <ThreadStep
                        id={`reply-${r.id}`}
                        above
                        below={i < count - 1}
                        highlight={flash === r.id}
                        avatar={<Avatar name={name} imageUrl={r.author?.imageUrl} size={REPLY_AVATAR} />}
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-5">
                              <span className="text-[13.5px] font-semibold text-rh-ink sm:text-sm">{name}</span>
                              {r.author?.tag && <TagBadge tag={r.author.tag} size="xs" />}
                              {byPostAuthor && <span className="rounded-full bg-rh-ink/[0.06] px-1.5 py-px text-[10.5px] font-semibold text-rh-ink/70">Author</span>}
                              <GroupChip group={r.author?.group} className="max-sm:hidden" />
                              <time dateTime={new Date(r.createdAt).toISOString()} title={new Date(r.createdAt).toLocaleString('en-GB')} className="text-xs text-rh-ink/45">
                                {shortAgo(r.createdAt)}
                              </time>
                              {r.hidden && <span className="text-xs font-semibold text-rh-danger-ink">Hidden</span>}
                            </div>
                            {lead.to && (
                              <button
                                type="button"
                                onClick={() => jumpTo(lead.to!.id, i)}
                                className="mt-0.5 text-left text-xs text-rh-ink/50 transition hover:text-rh-ink"
                              >
                                Replying to <span className="font-semibold text-rh-ink/75">@{lead.to.name}</span>
                              </button>
                            )}
                          </div>
                          <div className="-mr-2 -mt-1.5">
                            <MoreMenu target={target} canDelete={r.author?.id === viewerId || canModerate} canModerate={canModerate} onReport={() => setReporting(target)} />
                          </div>
                        </div>
                        <Lovable
                          target={target}
                          own={r.author?.id === viewerId}
                          disabled={r.hidden}
                          compact
                          actions={
                            !post.hidden &&
                            r.author &&
                            r.author.id !== viewerId && (
                              <button
                                type="button"
                                onClick={() => replyTo(r.author)}
                                aria-label={`Reply to ${r.author.name}`}
                                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-rh-ink/55 transition hover:bg-rh-ink/[0.06] hover:text-rh-ink"
                              >
                                <ReplyIcon className="h-3.5 w-3.5" /> Reply
                              </button>
                            )
                          }
                        >
                          <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-6 text-rh-ink/85 [overflow-wrap:anywhere] sm:text-[15px] sm:leading-[1.65]">
                            <MentionText text={lead.body} mentions={r.mentions} />
                          </p>
                        </Lovable>
                      </ThreadStep>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </main>
  )
}
