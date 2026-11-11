'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAction, useMutation, useQuery } from 'convex/react'
import type { Editor } from '@tiptap/react'
import { toast } from 'sonner'
import { AlertCircle, ArrowLeft, Check, Eye, ImagePlus, Lightbulb, Loader2, Send, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge, inputClass, primaryButtonClass, softButtonClass, tabsListClass } from '@/components/admin/ui'
import { PostBody } from '@/components/blog/PostBody'
import {
  STATUS_LABEL,
  STATUS_TONE,
  blogApi,
  errorText,
  type AuthorId,
  type BlogImage,
  type BlogSeo,
  type BlogViewer,
  type CategoryId,
  type EditorOptions,
  type EditorPost,
  type PostId,
} from '@/lib/blog/api'
import { imagekitTransform, parseBody, plainText, slugify, type BlogNode } from '@/lib/blog/content'
import { analyzeSeo } from '@/lib/blog/seo'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AiPanel, type RewriteRequest } from './AiPanel'
import { HistoryPanel } from './HistoryPanel'
import { MediaPicker } from './MediaPicker'
import { PostSettings } from './PostSettings'
import { ScoreRing, SeoPanel } from './SeoPanel'
import { useBlogUpload } from './useBlogUpload'
import { BlogEditor } from './editor/BlogEditor'
import { BlogEditorContext, type BlogEditorTools } from './editor/context'

type Form = {
  title: string
  slug: string
  excerpt: string
  cover: BlogImage | null
  seo: BlogSeo
  authorId: AuthorId | null
  reviewerId: AuthorId | null
  categoryId: CategoryId | null
  tags: string[]
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

const AUTOSAVE_MS = 1200

function formFrom(post: EditorPost): Form {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    cover: post.cover,
    seo: post.seo,
    authorId: post.authorId,
    reviewerId: post.reviewerId,
    categoryId: post.categoryId,
    tags: post.tags,
  }
}

function AutoTextarea({ value, onChange, className, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))} rows={1} className={cn('block w-full resize-none overflow-hidden bg-transparent outline-none', className)} {...rest} />
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-neutral-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving
      </span>
    )
  if (state === 'unsaved') return <span className="text-[12px] text-neutral-500">Unsaved changes</span>
  if (state === 'error')
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-600">
        <AlertCircle className="h-3.5 w-3.5" /> Not saved
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-neutral-500">
      <Check className="h-3.5 w-3.5 text-rh-lime-deep" /> Saved
    </span>
  )
}

function Preview({ open, onOpenChange, form, doc, authorName }: { open: boolean; onOpenChange: (o: boolean) => void; form: Form; doc: BlogNode; authorName: string | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-w-5xl overflow-y-auto rounded-2xl border-0 bg-rh-canvas p-0 sm:max-w-5xl">
        <DialogHeader className="sticky top-0 z-10 flex-row items-center justify-between space-y-0 bg-rh-ink px-5 py-3 text-white">
          <DialogTitle className="text-sm font-semibold text-white">Preview: how the post will look</DialogTitle>
          <DialogDescription className="sr-only">A preview of the post as readers will see it.</DialogDescription>
        </DialogHeader>
        <article className="mx-auto max-w-3xl px-5 py-10 text-rh-ink">
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-tight sm:text-5xl">{form.title || 'Untitled post'}</h1>
          {form.excerpt ? <p className="mt-5 text-lg font-medium leading-relaxed text-rh-ink/70">{form.excerpt}</p> : null}
          {authorName ? <p className="mt-5 text-sm font-semibold">{authorName}</p> : null}
          {form.cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview only
            <img src={imagekitTransform(form.cover.url, { w: 1400, q: 75 })} alt={form.cover.alt} className="mt-8 max-h-[460px] w-full rounded-[2rem] object-cover" />
          ) : null}
          <div className="mt-10">
            <PostBody doc={doc} />
          </div>
        </article>
      </DialogContent>
    </Dialog>
  )
}

export function PostEditor({ postId }: { postId: PostId }) {
  const router = useRouter()
  const post = useQuery(blogApi.adminGetPost, { postId }) as EditorPost | null | undefined
  const viewer = useQuery(blogApi.viewer, {}) as BlogViewer | null | undefined
  const options = useQuery(blogApi.editorOptions, {}) as EditorOptions | null | undefined
  const savePost = useMutation(blogApi.savePost)
  const submit = useMutation(blogApi.submitForReview)
  const withdraw = useMutation(blogApi.withdrawSubmission)
  const publish = useMutation(blogApi.publishPost)
  const requestChanges = useMutation(blogApi.requestChanges)
  const assist = useAction(blogApi.aiAssist)
  const { upload } = useBlogUpload()

  const [form, setForm] = useState<Form | null>(null)
  const [initialBody, setInitialBody] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [doc, setDoc] = useState<BlogNode | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [tab, setTab] = useState('post')
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [changesNote, setChangesNote] = useState('')
  const [rewrite, setRewrite] = useState<RewriteRequest | null>(null)
  const [picker, setPicker] = useState<{ multiple: boolean; title?: string } | null>(null)
  const pickResolve = useRef<((images: BlogImage[]) => void) | null>(null)

  // Save plumbing: the latest form, a version counter, and whether the slug follows the title
  const formRef = useRef<Form | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const version = useRef(0)
  const savedVersion = useRef(0)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slugTouched = useRef(false)
  const docTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  formRef.current = form
  editorRef.current = editor

  // Load the post into the form once; later server updates (our own saves) must not overwrite typing
  useEffect(() => {
    if (!post || form) return
    setForm(formFrom(post))
    setInitialBody(post.body)
    setDoc(parseBody(post.body))
    slugTouched.current = Boolean(post.liveSlug) || (post.slug !== '' && post.slug !== slugify(post.title))
  }, [post, form])

  const canEdit = post?.can.edit ?? false
  const isAdmin = viewer?.role === 'admin'

  const doSave = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current
    const current = formRef.current
    const ed = editorRef.current
    if (!current || !ed || version.current === savedVersion.current) return true
    const target = version.current
    setSaveState('saving')
    const run = (async () => {
      try {
        const slug = slugTouched.current ? current.slug : slugify(current.title)
        const result = await savePost({
          postId,
          title: current.title,
          slug,
          excerpt: current.excerpt,
          cover: current.cover ?? undefined,
          seo: current.seo,
          authorId: current.authorId ?? undefined,
          reviewerId: current.reviewerId ?? undefined,
          categoryId: current.categoryId ?? undefined,
          tags: current.tags,
          body: JSON.stringify(ed.getJSON()),
        })
        savedVersion.current = Math.max(savedVersion.current, target)
        // The server may have made the address unique (adding -2)
        setForm((f) => (f && f.slug !== result.slug ? { ...f, slug: result.slug } : f))
        setSaveState(version.current === savedVersion.current ? 'saved' : 'unsaved')
        return true
      } catch (error) {
        setSaveState('error')
        toast.error(errorText(error, 'Your changes could not be saved. Check your connection.'))
        return false
      }
    })()
    inFlight.current = run
    const ok = await run
    inFlight.current = null
    return ok
  }, [postId, savePost])

  const schedule = useCallback(() => {
    version.current += 1
    setSaveState('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void doSave(), AUTOSAVE_MS)
  }, [doSave])

  /** Saves now (before submit, publish, restore...). False when the save failed. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    return await doSave()
  }, [doSave])

  // Leaving with unsaved changes: save, and warn if the tab is closing
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) {
        void doSave()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      if (timer.current) clearTimeout(timer.current)
      if (version.current !== savedVersion.current) void doSave()
    }
  }, [doSave])

  const update = useCallback(
    (patch: Partial<Form>) => {
      if (!canEdit) return
      setForm((f) => (f ? { ...f, ...patch } : f))
      schedule()
    },
    [canEdit, schedule]
  )

  const onEditorChange = useCallback(
    (ed: Editor) => {
      schedule()
      // The SEO checks read the document; refresh them a moment after typing stops
      if (docTimer.current) clearTimeout(docTimer.current)
      docTimer.current = setTimeout(() => setDoc(ed.getJSON() as BlogNode), 400)
    },
    [schedule]
  )

  const tools = useMemo<BlogEditorTools>(
    () => ({
      readOnly: !canEdit,
      pickImages: (opts) =>
        new Promise<BlogImage[]>((resolve) => {
          pickResolve.current = resolve
          setPicker(opts)
        }),
      suggestAlt: viewer?.ai.enabled
        ? async ({ url, caption }) => {
            try {
              const reply = await assist({ task: 'alt', postId, imageUrl: url, caption, title: formRef.current?.title, keyword: formRef.current?.seo.focusKeyword })
              return String(reply.result.alt ?? '') || null
            } catch (error) {
              toast.error(errorText(error, 'AI assist couldn’t describe the picture.'))
              return null
            }
          }
        : null,
    }),
    [canEdit, viewer?.ai.enabled, assist, postId]
  )

  const report = useMemo(() => {
    if (!form || !doc) return null
    return analyzeSeo({
      title: form.title,
      slug: slugTouched.current ? form.slug : slugify(form.title),
      excerpt: form.excerpt,
      metaTitle: form.seo.metaTitle,
      metaDescription: form.seo.metaDescription,
      focusKeyword: form.seo.focusKeyword,
      cover: form.cover,
      doc,
      duplicateTitle: post?.duplicateTitle,
    })
  }, [form, doc, post?.duplicateTitle])

  if (post === undefined || viewer === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }
  if (post === null || viewer === null) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-lg font-semibold text-rh-ink dark:text-white">We couldn&apos;t open this post</p>
        <p className="mt-2 text-sm text-neutral-500">It may have been deleted, or it belongs to another writer.</p>
        <Button asChild className={cn(primaryButtonClass, 'mt-6')}>
          <Link href="/dashboard/admin/blog">Back to posts</Link>
        </Button>
      </div>
    )
  }
  if (!form || initialBody === null || !report) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const blockers = report.errors.length
  const liveWithEdits = post.isLive && post.status !== 'published'
  const authorName = options?.authors.find((a) => a._id === form.authorId)?.name ?? null

  const act = async (name: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(name)
    try {
      if (!(await flush())) return
      await fn()
      playSound('success')
      toast.success(success)
    } catch (error) {
      playSound('error')
      toast.error(errorText(error))
    } finally {
      setBusy(null)
    }
  }

  const showBlockers = () => {
    setTab('seo')
    toast.error(`Fix ${blockers} thing${blockers === 1 ? '' : 's'} in the SEO checklist first.`)
  }

  const getText = () => (editorRef.current ? plainText(editorRef.current.getJSON() as BlogNode) : '')

  return (
    <BlogEditorContext.Provider value={tools}>
      <div className="mx-auto w-full max-w-[1400px]">
        {/* Top bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link href="/dashboard/admin/blog" className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-soft hover:bg-white/70 dark:bg-rh-ink-2" aria-label="Back to posts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <StatusBadge tone={STATUS_TONE[post.status]}>{STATUS_LABEL[post.status]}</StatusBadge>
          {post.isLive ? <StatusBadge tone="green">Live</StatusBadge> : null}
          <SaveIndicator state={canEdit ? saveState : 'saved'} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setPreview(true)}>
              <Eye className="mr-1.5 h-4 w-4" /> Preview
            </Button>
            {post.can.withdraw ? (
              <Button type="button" className={softButtonClass} disabled={busy !== null} onClick={() => act('withdraw', () => withdraw({ postId }), 'Taken back. You can edit it again.')}>
                Withdraw
              </Button>
            ) : null}
            {isAdmin && post.status === 'in_review' ? (
              <Button type="button" className={softButtonClass} disabled={busy !== null} onClick={() => setChangesOpen(true)}>
                Ask for changes
              </Button>
            ) : null}
            {post.can.submit && !isAdmin ? (
              <Button
                type="button"
                className={primaryButtonClass}
                disabled={busy !== null}
                onClick={() => (blockers > 0 ? showBlockers() : act('submit', () => submit({ postId }), 'Sent for review. An admin will publish it or ask for changes.'))}
              >
                {busy === 'submit' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Submit for review
              </Button>
            ) : null}
            {isAdmin && post.status !== 'scheduled' ? (
              <Button
                type="button"
                className={primaryButtonClass}
                disabled={busy !== null || post.status === 'published'}
                onClick={() => (blockers > 0 ? showBlockers() : act('publish', () => publish({ postId }), post.isLive ? 'Changes are live.' : 'Published. It is on the blog now.'))}
              >
                {busy === 'publish' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {post.status === 'published' ? 'Up to date' : post.isLive ? 'Publish changes' : 'Publish'}
              </Button>
            ) : null}
          </div>
        </div>

        {/* What state the post is in */}
        <div className="mb-5 space-y-2 empty:hidden">
          {post.status === 'changes_requested' && post.reviewNote ? (
            <div className="rounded-2xl bg-rh-blush p-4 text-[14px] text-rh-ink dark:bg-rose-400/10 dark:text-white">
              <p className="font-semibold">Changes requested</p>
              <p className="mt-1 whitespace-pre-line">{post.reviewNote}</p>
            </div>
          ) : null}
          {post.status === 'in_review' && post.reviewNote ? (
            <div className="rounded-2xl bg-rh-peach p-4 text-[14px] text-rh-ink dark:bg-amber-400/10 dark:text-white">{post.reviewNote}</div>
          ) : null}
          {post.status === 'in_review' && !isAdmin ? (
            <div className="rounded-2xl bg-rh-peach p-4 text-[14px] text-rh-ink dark:bg-amber-400/10 dark:text-white">
              This post is with an admin for review, so it is locked. Withdraw it if you need to change something.
            </div>
          ) : null}
          {post.status === 'scheduled' && post.scheduledFor ? (
            <div className="rounded-2xl bg-rh-honeydew p-4 text-[14px] text-rh-ink dark:bg-white/[0.06] dark:text-white">
              Scheduled to go live {new Date(post.scheduledFor).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}.{' '}
              {isAdmin ? 'Cancel the schedule (Post tab) to edit it.' : ''}
            </div>
          ) : null}
          {liveWithEdits ? (
            <div className="rounded-2xl bg-white p-4 text-[14px] text-rh-ink shadow-soft dark:bg-rh-ink-2 dark:text-white">
              The post is live. Your edits here are not on the site until {isAdmin ? 'you publish the changes' : 'an admin approves them'}.
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Writing area: a white page, like the post on the site */}
          <div className="min-w-0 rounded-[1.75rem] bg-white px-5 py-8 text-rh-ink shadow-soft sm:px-10 lg:px-16">
            <div className="mx-auto max-w-[720px]">
              {form.cover ? (
                <div className="group relative mb-8">
                  {/* eslint-disable-next-line @next/next/no-img-element -- editor preview of the cover */}
                  <img src={imagekitTransform(form.cover.url, { w: 1400, q: 75 })} alt={form.cover.alt} className="max-h-[380px] w-full rounded-2xl bg-rh-canvas object-cover" />
                  {canEdit ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={form.cover.alt}
                        onChange={(e) => update({ cover: { ...form.cover!, alt: e.target.value } })}
                        placeholder="Cover alt text: describe the picture"
                        maxLength={200}
                        className={cn(
                          'h-9 min-w-0 flex-1 rounded-lg border border-black/10 px-2.5 text-[13px] outline-none focus:border-rh-lime focus:ring-2 focus:ring-rh-lime/30',
                          form.cover.alt.trim().length < 5 && 'border-amber-400 bg-amber-50'
                        )}
                      />
                      {tools.suggestAlt ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="rounded-lg"
                          onClick={async () => {
                            const alt = await tools.suggestAlt!({ url: form.cover!.url })
                            if (alt && formRef.current?.cover) update({ cover: { ...formRef.current.cover, alt } })
                          }}
                        >
                          <Lightbulb className="mr-1 h-3.5 w-3.5" /> AI
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={() => setPicker({ multiple: false, title: 'Cover image' })}>
                        Change
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="rounded-lg text-rose-600" onClick={() => update({ cover: null })} aria-label="Remove cover">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    pickResolve.current = (imgs) => imgs[0] && update({ cover: imgs[0] })
                    setPicker({ multiple: false, title: 'Cover image' })
                  }}
                  className="mb-6 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-neutral-500 hover:bg-rh-canvas hover:text-rh-ink"
                >
                  <ImagePlus className="h-4 w-4" /> Add a cover image
                </button>
              ) : null}

              <AutoTextarea
                value={form.title}
                onChange={(title) => update({ title })}
                placeholder="Post title"
                maxLength={160}
                readOnly={!canEdit}
                aria-label="Title"
                className="text-[34px] font-bold leading-[1.12] tracking-tight placeholder:text-rh-ink/25 sm:text-[42px]"
              />
              <AutoTextarea
                value={form.excerpt}
                onChange={(excerpt) => update({ excerpt })}
                placeholder="Summary: one or two sentences that make people want to read on (shown on the blog card)"
                maxLength={400}
                readOnly={!canEdit}
                aria-label="Summary"
                className="mt-4 text-[18px] font-medium leading-relaxed text-rh-ink/70 placeholder:text-rh-ink/30"
              />
              <div className="my-8 h-px bg-black/[0.06]" />

              <BlogEditor
                initialBody={initialBody}
                readOnly={!canEdit}
                onChange={onEditorChange}
                onReady={setEditor}
                onFiles={async (files) => {
                  const out = []
                  for (const file of files.slice(0, 10)) out.push(await upload(file))
                  return out
                }}
                onRewrite={
                  viewer.ai.enabled
                    ? (text) => {
                        const ed = editorRef.current
                        if (!ed) return
                        const { from, to } = ed.state.selection
                        setRewrite({ text, from, to, nonce: Date.now() })
                        setTab('ai')
                      }
                    : undefined
                }
              />
            </div>
          </div>

          {/* Settings, SEO, AI, history */}
          <aside className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className={tabsListClass}>
                <TabsTrigger value="post">Post</TabsTrigger>
                <TabsTrigger value="seo" className="gap-1.5">
                  SEO
                  <span className={cn('rounded-full px-1.5 text-[10px] font-bold', blockers > 0 ? 'bg-rose-600 text-white' : 'bg-rh-ink/10')}>{blockers > 0 ? blockers : report.score}</span>
                </TabsTrigger>
                <TabsTrigger value="ai">AI assist</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <div className="mt-3 rounded-2xl bg-white p-4 shadow-soft dark:bg-rh-ink-2">
                <TabsContent value="post" className="mt-0">
                  <button type="button" onClick={() => setTab('seo')} className="mb-5 flex w-full items-center gap-3 rounded-xl bg-rh-canvas p-3 text-left dark:bg-white/[0.04]">
                    <ScoreRing report={report} size={44} />
                    <span className="text-[13px] leading-snug">
                      <span className="block font-semibold text-rh-ink dark:text-white">SEO score</span>
                      <span className="block text-neutral-500">{blockers > 0 ? `${blockers} to fix before publishing` : `${report.warnings.length} suggestions`}</span>
                    </span>
                  </button>
                  <PostSettings
                    post={post}
                    options={options}
                    isAdmin={isAdmin}
                    disabled={!canEdit}
                    slug={slugTouched.current ? form.slug : slugify(form.title)}
                    onSlug={(slug) => {
                      slugTouched.current = true
                      update({ slug })
                    }}
                    categoryId={form.categoryId}
                    onCategory={(categoryId) => update({ categoryId })}
                    tags={form.tags}
                    onTags={(tags) => update({ tags })}
                    authorId={form.authorId}
                    onAuthor={(authorId) => update({ authorId })}
                    reviewerId={form.reviewerId}
                    onReviewer={(reviewerId) => update({ reviewerId })}
                    flush={flush}
                    blockers={blockers}
                    onDeleted={() => router.push('/dashboard/admin/blog')}
                  />
                </TabsContent>
                <TabsContent value="seo" className="mt-0">
                  <SeoPanel
                    report={report}
                    seo={form.seo}
                    onSeo={(patch) => update({ seo: { ...form.seo, ...patch } })}
                    slug={slugTouched.current ? form.slug : slugify(form.title)}
                    cover={form.cover}
                    canNoindex={isAdmin}
                    disabled={!canEdit}
                  />
                </TabsContent>
                <TabsContent value="ai" className="mt-0">
                  <AiPanel
                    viewer={viewer}
                    postId={postId}
                    editor={editor}
                    getText={getText}
                    title={form.title}
                    keyword={form.seo.focusKeyword ?? ''}
                    disabled={!canEdit}
                    rewrite={rewrite}
                    onApply={(patch) => {
                      if (patch.slug) slugTouched.current = true
                      update({
                        ...(patch.title !== undefined ? { title: patch.title } : {}),
                        ...(patch.excerpt !== undefined ? { excerpt: patch.excerpt } : {}),
                        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
                        ...(patch.seo ? { seo: { ...(formRef.current?.seo ?? {}), ...patch.seo } } : {}),
                      })
                    }}
                  />
                </TabsContent>
                <TabsContent value="history" className="mt-0">
                  <HistoryPanel
                    postId={postId}
                    canRestore={canEdit}
                    flush={flush}
                    onRestored={(v) => {
                      setForm((f) => (f ? { ...f, title: v.title } : f))
                      const body = parseBody(v.body)
                      editorRef.current?.commands.setContent(body, { emitUpdate: false })
                      setDoc(body)
                      // Already saved on the server by the restore
                      version.current += 1
                      savedVersion.current = version.current
                      setSaveState('saved')
                    }}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </aside>
        </div>
      </div>

      <MediaPicker
        open={picker !== null}
        multiple={picker?.multiple}
        title={picker?.title}
        onOpenChange={(o) => {
          if (!o) {
            setPicker(null)
            pickResolve.current?.([])
            pickResolve.current = null
          }
        }}
        onPick={(images) => {
          if (pickResolve.current) {
            pickResolve.current(images)
            pickResolve.current = null
          } else if (picker?.title === 'Cover image' && images[0]) {
            update({ cover: images[0] })
          }
        }}
      />

      <Preview open={preview} onOpenChange={setPreview} form={form} doc={preview && editor ? (editor.getJSON() as BlogNode) : parseBody(initialBody)} authorName={authorName} />

      <Dialog open={changesOpen} onOpenChange={(o) => busy === null && setChangesOpen(o)}>
        <DialogContent className="rounded-2xl sm:max-w-lg dark:border-white/10 dark:bg-rh-ink-2">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Ask for changes</DialogTitle>
            <DialogDescription>The writer sees this note on the post and gets a notification.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            rows={5}
            placeholder="e.g. Please add a source for the second claim and a 'when to see a physio' section."
            className={inputClass}
            maxLength={1000}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setChangesOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={primaryButtonClass}
              disabled={!changesNote.trim() || busy !== null}
              onClick={async () => {
                await act('changes', () => requestChanges({ postId, note: changesNote }), 'Sent back to the writer.')
                setChangesOpen(false)
                setChangesNote('')
              }}
            >
              Send to the writer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BlogEditorContext.Provider>
  )
}
