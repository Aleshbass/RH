'use client'

/** One community post with its replies (Learn › Community › post). */

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Eye, EyeOff, Flag, Loader2, Lock, MessageCircle, MoreHorizontal, Send, ThumbsUp, Trash2 } from '@/components/icons'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { displayFont, pillInk } from '../shared'
import { TagBadge } from '../platform/identity'
import { communityApi, errorText, postPath, relativeTime, roomPath, type PostPage } from './socialApi'
import { BackToCommunity } from './Community'
import { Avatar, EmptyState, JoinPrompt, Sheet, Skeleton } from './ui'

type Ok = Extract<PostPage, { state: 'ok' }>
type Target = { type: 'post' | 'reply'; id: string; authorId: string | null; hidden: boolean; helpfulCount: number; markedHelpful: boolean }

const REPORT_REASONS = ['Shares patient details', 'Unsafe clinical advice', 'Spam or advertising', 'Rude or harassing', 'Something else']

function HelpfulButton({ target, own }: { target: Target; own: boolean }) {
  const toggle = useMutation(communityApi.toggleHelpful)
  const [pending, setPending] = useState(false)
  const click = async () => {
    if (own) {
      toast('You can’t mark your own post helpful.')
      return
    }
    setPending(true)
    try {
      const res = await toggle({ targetType: target.type, targetId: target.id })
      if (res.marked) playSound('helpful')
    } catch (err) {
      toast.error(errorText(err, 'Couldn’t update.'))
    } finally {
      setPending(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={pending}
      aria-pressed={target.markedHelpful}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition active:scale-95',
        target.markedHelpful ? 'bg-rh-ink text-white' : 'bg-rh-cream text-rh-ink/70 hover:text-rh-ink'
      )}
    >
      <motion.span key={String(target.markedHelpful)} initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className="flex">
        <ThumbsUp className={cn('h-3.5 w-3.5', target.markedHelpful && 'text-rh-lime')} />
      </motion.span>
      Helpful{target.helpfulCount > 0 ? ` · ${target.helpfulCount}` : ''}
    </button>
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

function ReplyBox({ postId }: { postId: Ok['post']['id'] }) {
  const reply = useMutation(communityApi.reply)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      await reply({ postId, body })
      playSound('send')
      setBody('')
      if (area.current) area.current.style.height = ''
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
    <form onSubmit={submit} className="rounded-3xl border border-rh-ink/10 bg-white p-2 transition focus-within:border-rh-ink/30 focus-within:shadow-[0_0_0_4px_rgba(10,20,18,0.05)]">
      <label htmlFor="reply-body" className="sr-only">
        Your reply
      </label>
      <textarea
        id="reply-body"
        ref={area}
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`
        }}
        onKeyDown={onKey}
        rows={2}
        maxLength={4000}
        placeholder="Write a reply"
        className="block w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-rh-ink placeholder:text-rh-ink/40 focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3 px-2 pb-1">
        <p className="text-xs text-rh-ink/45">Keep patients unidentifiable.</p>
        <button type="submit" disabled={!body.trim() || busy} className={cn(pillInk, 'h-10 px-4')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Reply
        </button>
      </div>
    </form>
  )
}

export function PostView({ postId }: { postId: string }) {
  const data = useQuery(communityApi.post, { postId })
  const [reporting, setReporting] = useState<Target | null>(null)

  if (data === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-8 h-10 w-3/4" />
        <Skeleton className="mt-4 h-32" />
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

  const { post, replies, viewerId, canModerate } = data
  const postTarget: Target = { type: 'post', id: post.id, authorId: post.author?.id ?? null, hidden: post.hidden, helpfulCount: post.helpfulCount, markedHelpful: post.markedHelpful }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <Link href={roomPath(data.room.slug)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink/60 transition hover:text-rh-ink">
        ← {data.room.title}
      </Link>

      <article className="mt-6">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('rounded-full px-2.5 py-1 font-semibold', post.kind === 'question' ? 'bg-rh-honeydew text-rh-ink' : 'bg-rh-cream text-rh-ink/75')}>
            {post.kind === 'question' ? 'Question' : 'Discussion'}
          </span>
          {post.hidden && <span className="rounded-full bg-rh-danger-soft px-2.5 py-1 font-semibold text-rh-danger-ink">Hidden from members</span>}
        </div>
        <h1 className={cn('mt-4 text-[28px] leading-tight tracking-tight text-rh-ink sm:text-[36px]', displayFont)}>{post.title}</h1>
        <div className="mt-5 flex items-center gap-3">
          <Avatar name={post.author?.name ?? 'Member'} imageUrl={post.author?.imageUrl} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-rh-ink">{post.author?.name ?? 'Former member'}</span>
              {post.author?.tag && <TagBadge tag={post.author.tag} size="xs" />}
            </div>
            <p className="text-xs text-rh-ink/50">{relativeTime(post.createdAt)}</p>
          </div>
        </div>
        <div className="mt-6 whitespace-pre-line break-words text-[16px] leading-7 text-rh-ink/85">{post.body}</div>
        <div className="mt-6 flex items-center gap-2">
          <HelpfulButton target={postTarget} own={post.author?.id === viewerId} />
          <span className="ml-auto" />
          <MoreMenu target={postTarget} canDelete={post.author?.id === viewerId || canModerate} canModerate={canModerate} onReport={() => setReporting(postTarget)} />
        </div>
      </article>

      <section aria-labelledby="replies-heading" className="mt-10 border-t border-rh-ink/[0.08] pt-8">
        <h2 id="replies-heading" className="text-sm font-semibold uppercase tracking-[0.14em] text-rh-ink/50">
          {replies.length === 0 ? 'Replies' : `${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}`}
        </h2>
        <ul className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {replies.map((r) => {
              const target: Target = { type: 'reply', id: r.id, authorId: r.author?.id ?? null, hidden: r.hidden, helpfulCount: r.helpfulCount, markedHelpful: r.markedHelpful }
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className={cn('rounded-3xl border border-rh-ink/[0.07] bg-white p-5', r.hidden && 'opacity-60')}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={r.author?.name ?? 'Member'} imageUrl={r.author?.imageUrl} size={32} />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-rh-ink">{r.author?.name ?? 'Former member'}</span>
                      {r.author?.tag && <TagBadge tag={r.author.tag} size="xs" />}
                      <span className="text-xs text-rh-ink/45">{relativeTime(r.createdAt)}</span>
                      {r.hidden && <span className="text-xs font-semibold text-rose-700">Hidden</span>}
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-7 text-rh-ink/85">{r.body}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <HelpfulButton target={target} own={r.author?.id === viewerId} />
                    <span className="ml-auto" />
                    <MoreMenu target={target} canDelete={r.author?.id === viewerId || canModerate} canModerate={canModerate} onReport={() => setReporting(target)} />
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
        <div className="mt-6">{post.hidden ? null : <ReplyBox postId={post.id} />}</div>
      </section>

      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
    </main>
  )
}
