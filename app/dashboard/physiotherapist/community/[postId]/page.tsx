'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { ConvexError } from 'convex/values'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Check, EyeOff, Flag, GraduationCap, Lightbulb, Loader2, Send, ThumbsUp } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, PageContainer, PageHeader, PageSkeleton, PhysioDrawer, StatusBadge, fieldClass, primaryButtonClass, softButtonClass } from '@/components/physio/ui'
import { TierBadge } from '@/components/rewards/TierBadge'
import { PrivacyWarnings } from '@/components/community/drawers'
import { closesLabel, communityRefs, type CommunityAuthor, type PostDetail } from '@/components/community/refs'
import type { Id } from '@/convex/_generated/dataModel'
import { privacyIssues } from '@/lib/community/privacy'
import { cpdHours } from '@/lib/rewards/rules'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const errorText = (error: unknown, fallback: string) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : fallback

const ROLE_LABEL = { lead: 'Case lead', moderator: 'Moderator', rehabify: 'Rehabify' } as const

function Byline({ author, className }: { author: CommunityAuthor; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span className="font-semibold text-pt-ink">{author.name}</span>
      <TierBadge tier={author.tierKey} name={author.tierName} />
      {author.role && <StatusBadge tone="ink">{ROLE_LABEL[author.role]}</StatusBadge>}
    </span>
  )
}

export default function CommunityPostPage() {
  const { postId } = useParams<{ postId: Id<'communityPosts'> }>()
  const data = useQuery(communityRefs.post, { postId })
  if (data === undefined) return <PageSkeleton />
  if (data === null) {
    return (
      <PageContainer className="max-w-3xl">
        <PageHeader title="Not available" back={{ href: '/dashboard/physiotherapist/community', label: 'Community' }} />
        <EmptyState title="This post isn’t available" description="It may have been removed by a moderator." />
      </PageContainer>
    )
  }
  return <PostView data={data} />
}

function PostView({ data }: { data: NonNullable<PostDetail> }) {
  const { post, poll, answers, me } = data
  const vote = useMutation(communityRefs.vote)
  const useful = useMutation(communityRefs.useful)
  const helpful = useMutation(communityRefs.helpful)
  const report = useMutation(communityRefs.report)
  const moderate = useMutation(communityRefs.moderate)
  const setClosed = useMutation(communityRefs.setClosed)
  const [revealOpen, setRevealOpen] = useState(false)
  const isCase = post.kind === 'case'

  async function run<T>(action: () => Promise<T>, sound: Parameters<typeof playSound>[0], done?: string) {
    try {
      await action()
      playSound(sound)
      if (done) toast.success(done)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'That didn’t work. Try again.'))
    }
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={isCase ? `Case #${post.caseNumber}` : 'Question'}
        back={{ href: '/dashboard/physiotherapist/community', label: 'Community' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isCase && <StatusBadge tone={post.status === 'open' ? 'green' : 'neutral'}>{closesLabel(post.closesAt, post.status)}</StatusBadge>}
            {isCase && post.cpdMinutes ? (
              <StatusBadge tone="neutral">
                <GraduationCap className="h-3 w-3" /> {cpdHours(post.cpdMinutes)} CPD
              </StatusBadge>
            ) : null}
            {post.status === 'hidden' && <StatusBadge tone="rose">Hidden</StatusBadge>}
          </div>
        }
      />

      <article className="rounded-3xl border border-pt-line bg-pt-surface p-5 sm:p-6">
        <h1 className="text-lg font-semibold leading-snug text-pt-ink">{post.title}</h1>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-pt-ink">{post.body}</p>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-pt-muted">
          <Byline author={post.author} />
          <span>· {formatDistanceToNow(post.createdAt, { addSuffix: true })}</span>
          {post.bodyRegion && <span>· {post.bodyRegion}</span>}
        </p>
        <p className="mt-2 text-[11px] text-pt-faint">Details changed to protect the patient.</p>
        {!isCase && me.isAuthor && post.status !== 'hidden' && (
          <Button
            size="sm"
            className={cn(softButtonClass, 'mt-4 h-8')}
            onClick={() => void run(() => setClosed({ postId: post._id, closed: post.status === 'open' }), 'success', post.status === 'open' ? 'Marked as answered' : 'Opened again')}
          >
            {post.status === 'open' ? 'Mark as answered' : 'Open again'}
          </Button>
        )}
      </article>

      {poll && (
        <section className="rounded-3xl border border-pt-line bg-pt-surface p-5 sm:p-6">
          <p className="text-[15px] font-semibold text-pt-ink">
            What’s most likely? <span className="font-normal text-pt-muted">· {poll.total} {poll.total === 1 ? 'vote' : 'votes'}</span>
          </p>
          <div className="mt-4 space-y-3">
            {poll.options.map((o) => {
              const pct = poll.showResults && poll.total ? Math.round(((o.votes ?? 0) / poll.total) * 100) : 0
              const leading = poll.showResults && poll.options.every((x) => (x.votes ?? 0) <= (o.votes ?? 0))
              return poll.showResults ? (
                <div key={o.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={cn('text-pt-ink', poll.myVote === o.key && 'font-semibold')}>
                      {o.label}
                      {poll.myVote === o.key && <Check className="ml-1.5 inline h-3.5 w-3.5 align-[-2px]" />}
                    </span>
                    <span className="font-semibold tabular-nums text-pt-ink">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-pt-sunken">
                    <div className={cn('h-full rounded-full transition-all', leading ? 'bg-pt-primary' : 'bg-pt-muted/50')} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ) : (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => void run(() => vote({ postId: post._id, option: o.key }), 'vote')}
                  className="w-full rounded-2xl bg-pt-sunken px-4 py-3 text-left text-[15px] font-medium text-pt-ink transition hover:bg-pt-hover active:scale-[0.99]"
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {!poll.showResults && <p className="mt-3 text-xs text-pt-muted">Results show after you vote, so nobody is swayed.</p>}
          {isCase && <p className="mt-3 text-xs text-pt-faint">Vote and answer to log {cpdHours(post.cpdMinutes ?? 60)} CPD when the case closes.</p>}
        </section>
      )}

      {post.reveal ? (
        <section className="rounded-3xl bg-pt-primary p-5 text-pt-on-primary sm:p-6">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-pt-accent">
            <Lightbulb className="h-3.5 w-3.5" /> The answer
          </p>
          <p className="mt-2 text-xl font-semibold">{post.reveal.answer}</p>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed opacity-85">{post.reveal.teaching}</p>
        </section>
      ) : (
        isCase &&
        me.canLead && (
          <Button variant="outline" className="h-11 w-full rounded-xl border-pt-line-strong" onClick={() => setRevealOpen(true)}>
            <Lightbulb className="mr-1.5 h-4 w-4" />
            Post the answer and teaching points
          </Button>
        )
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-pt-ink">
          {answers.length} {answers.length === 1 ? 'answer' : 'answers'}
        </h2>
        {answers.map((a) => (
          <article
            key={a._id}
            className={cn('rounded-3xl border bg-pt-surface p-5', a.helpful ? 'border-2 border-pt-primary' : 'border-pt-line', a.hidden && 'opacity-60')}
          >
            {a.helpful && (
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-pt-green-bg px-3 py-1 text-xs font-semibold text-pt-green-fg">
                <Check className="h-3.5 w-3.5" />
                {isCase || a.helpfulByLead ? 'Marked helpful by case lead' : 'Marked helpful by the asker'}
              </span>
            )}
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-pt-ink">{a.body}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-pt-muted">
              <Byline author={a.author} />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={a.mine}
                  onClick={() => void run(() => useful({ answerId: a._id }), 'vote')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition disabled:cursor-default',
                    a.iFoundUseful ? 'bg-pt-primary text-pt-on-primary' : 'bg-pt-sunken text-pt-muted hover:text-pt-ink'
                  )}
                  aria-pressed={a.iFoundUseful}
                >
                  <ThumbsUp className="h-3 w-3" />
                  {a.usefulCount} found this useful
                </button>
                {me.canMarkHelpful && !a.helpful && !a.mine && (
                  <button
                    type="button"
                    onClick={() => void run(() => helpful({ answerId: a._id }), 'helpful', 'Marked helpful · +50 points for them')}
                    className="rounded-full bg-pt-sunken px-2.5 py-1 font-medium text-pt-ink hover:bg-pt-hover"
                  >
                    Mark helpful
                  </button>
                )}
                {me.canModerate ? (
                  <button
                    type="button"
                    onClick={() => void run(() => moderate({ postId: post._id, answerId: a._id, hidden: !a.hidden }), 'success', a.hidden ? 'Shown again' : 'Hidden')}
                    className="rounded-full p-1.5 text-pt-faint hover:text-pt-ink"
                    aria-label={a.hidden ? 'Show answer' : 'Hide answer'}
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  !a.mine && (
                    <button
                      type="button"
                      onClick={() => {
                        const reason = window.prompt('What’s wrong with this answer?')
                        if (reason) void run(() => report({ postId: post._id, answerId: a._id, reason }), 'success', 'Thanks. A moderator will look.')
                      }}
                      className="rounded-full p-1.5 text-pt-faint hover:text-pt-ink"
                      aria-label="Report answer"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
              </div>
            </div>
          </article>
        ))}
        {answers.length === 0 && <p className="text-sm text-pt-muted">No answers yet. Be the first.</p>}
      </section>

      {post.status === 'open' && <Composer postId={post._id} isCase={isCase} />}
      {isCase && me.canLead && <RevealDrawer open={revealOpen} onOpenChange={setRevealOpen} postId={post._id} />}
    </PageContainer>
  )
}

/** Sticky "Add your answer" bar at the bottom, growing as you type. */
function Composer({ postId, isCase }: { postId: Id<'communityPosts'>; isCase: boolean }) {
  const answer = useMutation(communityRefs.answer)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const blocked = privacyIssues(text).some((i) => i.blocking)

  async function post() {
    setBusy(true)
    try {
      await answer({ postId, body: text })
      playSound('send')
      if (isCase) {
        playSound('points')
        toast.success('Answer posted · +5 points')
      } else toast.success('Answer posted')
      setText('')
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Couldn’t post your answer.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Sticks above the phone tab bar (h-16) and to the bottom of the window on a computer
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-1 rounded-3xl border border-pt-line bg-pt-canvas/95 p-2 backdrop-blur lg:bottom-4">
      <div className="space-y-1.5">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={text.length > 80 ? 4 : 1}
            placeholder="Add your answer…"
            className={cn(fieldClass, 'min-h-12 resize-none rounded-3xl border px-4 py-3 text-[15px]')}
          />
          <Button className={cn(primaryButtonClass, 'h-12 rounded-full px-5')} disabled={busy || blocked || text.trim().length < 15} onClick={() => void post()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1.5 h-4 w-4" />Post</>}
          </Button>
        </div>
        <PrivacyWarnings text={text} />
      </div>
    </div>
  )
}

function RevealDrawer({ open, onOpenChange, postId }: { open: boolean; onOpenChange: (o: boolean) => void; postId: Id<'communityPosts'> }) {
  const reveal = useMutation(communityRefs.reveal)
  const [answer, setAnswer] = useState('')
  const [teaching, setTeaching] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try {
      const res = await reveal({ postId, answer, teaching })
      playSound('certified')
      toast.success('Answer revealed', { description: res.logged ? `${res.logged} physios logged CPD for this case.` : undefined })
      onOpenChange(false)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error, 'Couldn’t post the reveal.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <PhysioDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Reveal the answer"
      description="Closes the case and logs CPD for everyone who voted and answered."
      footer={
        <Button className={cn(primaryButtonClass, 'h-11 w-full')} disabled={busy || answer.trim().length < 3 || teaching.trim().length < 20} onClick={() => void submit()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post the reveal'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="rv-answer" className="text-sm font-semibold text-pt-ink">The answer</label>
          <Textarea id="rv-answer" rows={2} value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 200))} placeholder="Gluteal tendinopathy (GTPS)" className={cn(fieldClass, 'resize-none border p-3')} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rv-teach" className="text-sm font-semibold text-pt-ink">Teaching points</label>
          <Textarea id="rv-teach" rows={8} value={teaching} onChange={(e) => setTeaching(e.target.value.slice(0, 3000))} placeholder="What gave it away, what to rule out, how you’d load it." className={cn(fieldClass, 'resize-none border p-3 leading-relaxed')} />
          <PrivacyWarnings text={`${answer}\n${teaching}`} />
        </div>
      </div>
    </PhysioDrawer>
  )
}
