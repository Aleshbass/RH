'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { CalendarClock, ExternalLink, EyeOff, Trash2, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog, inputClass, softButtonClass } from '@/components/admin/ui'
import { blogApi, errorText, type AuthorId, type CategoryId, type EditorOptions, type EditorPost } from '@/lib/blog/api'
import { slugify } from '@/lib/blog/content'
import { cn } from '@/lib/utils'

const NONE = '__none'

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">
      {children}
    </label>
  )
}

/** "2026-11-12T09:30" in the browser's own time zone, for <input type="datetime-local">. */
function localInputValue(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PostSettings({
  post,
  options,
  isAdmin,
  disabled,
  slug,
  onSlug,
  categoryId,
  onCategory,
  tags,
  onTags,
  authorId,
  onAuthor,
  reviewerId,
  onReviewer,
  flush,
  blockers,
  onDeleted,
}: {
  post: EditorPost
  options: EditorOptions | null | undefined
  isAdmin: boolean
  disabled: boolean
  slug: string
  onSlug: (slug: string) => void
  categoryId: CategoryId | null
  onCategory: (id: CategoryId | null) => void
  tags: string[]
  onTags: (tags: string[]) => void
  authorId: AuthorId | null
  onAuthor: (id: AuthorId | null) => void
  reviewerId: AuthorId | null
  onReviewer: (id: AuthorId | null) => void
  flush: () => Promise<boolean>
  blockers: number
  onDeleted: () => void
}) {
  const schedule = useMutation(blogApi.schedulePost)
  const cancelSchedule = useMutation(blogApi.cancelSchedule)
  const unpublish = useMutation(blogApi.unpublishPost)
  const remove = useMutation(blogApi.deletePost)
  const [tagDraft, setTagDraft] = useState('')
  const [when, setWhen] = useState(() => localInputValue(Date.now() + 24 * 60 * 60 * 1000))
  const [confirm, setConfirm] = useState<'unpublish' | 'delete' | null>(null)

  const addTags = (raw: string) => {
    const next = [...tags]
    for (const part of raw.split(',')) {
      const tag = part.trim().replace(/\s+/g, ' ').slice(0, 40)
      if (tag && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag)
    }
    onTags(next.slice(0, 12))
    setTagDraft('')
  }

  const slugChanged = Boolean(post.liveSlug && slug && slug !== post.liveSlug)

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="post-slug">Web address</Label>
        <div className="flex items-center overflow-hidden rounded-xl border border-black/10 bg-white focus-within:ring-2 focus-within:ring-rh-lime/40 dark:border-white/10 dark:bg-rh-ink-3">
          <span className="shrink-0 pl-3 text-[13px] text-neutral-500">/blog/</span>
          <input
            id="post-slug"
            value={slug}
            onChange={(e) => onSlug(slugify(e.target.value.replace(/\s/g, '-'), 80) + (/[-\s]$/.test(e.target.value) ? '-' : ''))}
            onBlur={() => onSlug(slugify(slug, 80))}
            placeholder="made-from-the-title"
            disabled={disabled}
            className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-[13px] text-rh-ink outline-none dark:text-white"
          />
        </div>
        {slugChanged ? (
          <p className="mt-1 text-[11px] text-amber-600">
            The live post is at /blog/{post.liveSlug}. When this is published the old address will redirect here, so old links keep working.
          </p>
        ) : null}
        {post.isLive && post.liveSlug ? (
          <Link href={`/blog/${post.liveSlug}`} target="_blank" className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-rh-ink underline decoration-rh-lime underline-offset-2 dark:text-white">
            View the live post <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
      </div>

      <div>
        <Label>Topic</Label>
        <Select value={categoryId ?? NONE} onValueChange={(v) => onCategory(v === NONE ? null : (v as CategoryId))} disabled={disabled}>
          <SelectTrigger className={inputClass}>
            <SelectValue placeholder="Choose a topic" />
          </SelectTrigger>
          <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
            <SelectItem value={NONE}>No topic</SelectItem>
            {(options?.categories ?? []).map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (options?.categories.length ?? 0) === 0 ? (
          <p className="mt-1 text-[11px] text-neutral-500">
            No topics yet.{' '}
            <Link href="/dashboard/admin/blog/categories" className="font-semibold underline">
              Add some
            </Link>
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="post-tags">Tags</Label>
        {tags.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-rh-honeydew px-2.5 py-1 text-[12px] font-semibold text-rh-ink dark:bg-white/10 dark:text-white">
                {t}
                {!disabled ? (
                  <button type="button" onClick={() => onTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        <Input
          id="post-tags"
          value={tagDraft}
          onChange={(e) => (e.target.value.includes(',') ? addTags(e.target.value) : setTagDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTags(tagDraft)
            }
          }}
          onBlur={() => tagDraft && addTags(tagDraft)}
          placeholder="Type a tag and press Enter"
          className={inputClass}
          disabled={disabled}
        />
      </div>

      <div>
        <Label>Written by</Label>
        {isAdmin ? (
          <Select value={authorId ?? NONE} onValueChange={(v) => onAuthor(v === NONE ? null : (v as AuthorId))} disabled={disabled}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder="Choose the author" />
            </SelectTrigger>
            <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
              <SelectItem value={NONE}>Rehabify Health (no byline)</SelectItem>
              {(options?.authors ?? []).map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name}
                  {a.credentials ? ` · ${a.credentials}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-xl bg-rh-canvas px-3 py-2.5 text-[13px] text-rh-ink dark:bg-white/[0.04] dark:text-white">
            {options?.authors.find((a) => a._id === authorId)?.name ?? 'You'}{' '}
            <Link href="/dashboard/admin/blog/authors" className="ml-1 text-[12px] font-semibold underline decoration-rh-lime underline-offset-2">
              Edit my profile
            </Link>
          </p>
        )}
      </div>

      <div>
        <Label>Medically reviewed by</Label>
        {isAdmin ? (
          <Select value={reviewerId ?? NONE} onValueChange={(v) => onReviewer(v === NONE ? null : (v as AuthorId))} disabled={disabled}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder="Choose a reviewer" />
            </SelectTrigger>
            <SelectContent className="dark:border-white/10 dark:bg-rh-ink-2">
              <SelectItem value={NONE}>Not reviewed</SelectItem>
              {(options?.authors ?? []).map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.name}
                  {a.credentials ? ` · ${a.credentials}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-xl bg-rh-canvas px-3 py-2.5 text-[13px] text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-300">
            {options?.authors.find((a) => a._id === reviewerId)?.name ?? 'An administrator picks the reviewer.'}
          </p>
        )}
        <p className="mt-1 text-[11px] text-neutral-500">Health posts rank better (and earn trust) with a named clinician who checked them.</p>
      </div>

      {isAdmin ? (
        <div className="space-y-2 border-t border-black/5 pt-5 dark:border-white/10">
          <Label htmlFor="post-when">Publish later</Label>
          {post.status === 'scheduled' && post.scheduledFor ? (
            <div className="rounded-xl bg-rh-honeydew p-3 text-[13px] text-rh-ink dark:bg-white/[0.06] dark:text-white">
              Goes live {new Date(post.scheduledFor).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 w-full rounded-xl"
                onClick={async () => {
                  try {
                    await cancelSchedule({ postId: post._id })
                    toast.success('Schedule cancelled. The post is a draft again.')
                  } catch (error) {
                    toast.error(errorText(error))
                  }
                }}
              >
                Cancel the schedule
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input id="post-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cn(inputClass, 'min-w-0 flex-1')} />
              <Button
                type="button"
                className={softButtonClass}
                disabled={blockers > 0}
                title={blockers > 0 ? 'Fix the SEO checklist first' : undefined}
                onClick={async () => {
                  const at = new Date(when).getTime()
                  if (!Number.isFinite(at)) return
                  if (!(await flush())) return
                  try {
                    await schedule({ postId: post._id, at })
                    toast.success('Scheduled. It goes live on its own.')
                  } catch (error) {
                    toast.error(errorText(error))
                  }
                }}
              >
                <CalendarClock className="mr-1.5 h-4 w-4" /> Schedule
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {post.can.remove || (isAdmin && post.isLive) ? (
        <div className="space-y-2 border-t border-black/5 pt-5 dark:border-white/10">
          {isAdmin && post.isLive ? (
            <Button type="button" variant="ghost" className="w-full justify-start rounded-xl text-[13px]" onClick={() => setConfirm('unpublish')}>
              <EyeOff className="mr-2 h-4 w-4" /> Take it off the site
            </Button>
          ) : null}
          {post.can.remove ? (
            <Button type="button" variant="ghost" className="w-full justify-start rounded-xl text-[13px] text-rose-600 hover:text-rose-700" onClick={() => setConfirm('delete')}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete this post
            </Button>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm === 'unpublish'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Take this post off the site?"
        description="People opening the link will see a 'page not found'. Your text stays here as a draft, and you can publish it again."
        confirmLabel="Take it off"
        onConfirm={async () => {
          try {
            await unpublish({ postId: post._id })
            toast.success('The post is off the site.')
          } catch (error) {
            toast.error(errorText(error))
            throw error
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this post for good?"
        description={post.isLive ? 'It is live now: it will disappear from the site and its history is deleted too.' : 'The post and its saved versions are deleted. This cannot be undone.'}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await remove({ postId: post._id })
            toast.success('Post deleted.')
            onDeleted()
          } catch (error) {
            toast.error(errorText(error))
            throw error
          }
        }}
      />
    </div>
  )
}
