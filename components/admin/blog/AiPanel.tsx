'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useAction } from 'convex/react'
import type { Editor } from '@tiptap/react'
import type { Node as PmNode } from '@tiptap/pm/model'
import { toast } from 'sonner'
import { AlertTriangle, Check, HelpCircle, Lightbulb, Link as LinkIcon, ListChecks, Loader2, Search, ShieldCheck } from '@/components/icons'
import { Type } from './editor/icons'
import { Button } from '@/components/ui/button'
import { primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { blogApi, errorText, type AiTask, type BlogViewer, type PostId } from '@/lib/blog/api'
import { cn } from '@/lib/utils'

export type RewriteRequest = { text: string; from: number; to: number; nonce: number }

type Meta = { metaTitle: string; metaDescription: string; excerpt: string; slug: string; focusKeyword: string; relatedKeywords: string[] }
type Outline = { heading: string; level: number; points: string[] }[]
type Faq = { question: string; answer: string }[]
type Links = { anchorText: string; path: string; reason: string }[]
type Safety = { summary: string; issues: { quote: string; problem: string; suggestion: string; severity: 'high' | 'medium' | 'low' }[] }

type Results = {
  titles?: string[]
  meta?: Meta
  outline?: Outline
  faq?: Faq
  links?: Links
  safety?: Safety
  rewrite?: string
}

const REWRITE_MODES = [
  { id: 'simpler', label: 'Simpler' },
  { id: 'shorter', label: 'Shorter' },
  { id: 'longer', label: 'Longer' },
  { id: 'warmer', label: 'Warmer' },
  { id: 'nigerian', label: 'For Nigerian readers' },
  { id: 'fix', label: 'Fix spelling' },
]

/** Finds `needle` in the text of the post; returns its document range, or null. */
export function findInDoc(doc: PmNode, needle: string): { from: number; to: number } | null {
  const target = needle.trim()
  if (!target) return null
  let found: { from: number; to: number } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (!node.isTextblock) return true
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i]
          map.push(pos + 1 + offset + i)
        }
      } else {
        text += ' '
        map.push(pos + 1 + offset)
      }
    })
    let at = text.indexOf(target)
    if (at < 0) at = text.toLowerCase().indexOf(target.toLowerCase())
    if (at >= 0) found = { from: map[at], to: map[at + target.length - 1] + 1 }
    return false
  })
  return found
}

function Action({ icon, title, hint, busy, onClick, disabled }: { icon: ReactNode; title: string; hint: string; busy: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-black/[0.06] transition-colors hover:bg-rh-honeydew disabled:opacity-60 dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.08]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rh-honeydew text-rh-ink dark:bg-white/10 dark:text-rh-lime [&_svg]:h-4 [&_svg]:w-4">
        {busy ? <Loader2 className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-rh-ink dark:text-white">{title}</span>
        <span className="block text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">{hint}</span>
      </span>
    </button>
  )
}

function Result({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{title}</p>
        <button type="button" onClick={onClose} className="text-[11px] font-semibold text-neutral-500 hover:text-rh-ink dark:hover:text-white">
          Close
        </button>
      </div>
      {children}
    </div>
  )
}

function UseRow({ label, value, onUse }: { label?: string; value: string; onUse: () => void }) {
  const [used, setUsed] = useState(false)
  return (
    <div className="flex items-start gap-2 border-t border-black/5 py-2 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="min-w-0 flex-1 text-[13px] leading-snug text-rh-ink dark:text-white">
        {label ? <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span> : null}
        {value}
      </div>
      <button
        type="button"
        onClick={() => {
          onUse()
          setUsed(true)
        }}
        className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold', used ? 'bg-rh-lime text-rh-ink' : 'bg-white text-rh-ink ring-1 ring-black/10 hover:bg-rh-honeydew dark:bg-white/10 dark:text-white dark:ring-0')}
      >
        {used ? <Check className="h-3.5 w-3.5" /> : 'Use'}
      </button>
    </div>
  )
}

export function AiPanel({
  viewer,
  postId,
  editor,
  getText,
  title,
  keyword,
  disabled,
  rewrite,
  onApply,
}: {
  viewer: BlogViewer
  postId: PostId
  editor: Editor | null
  /** The post as plain text, for the AI to read */
  getText: () => string
  title: string
  keyword: string
  disabled: boolean
  rewrite: RewriteRequest | null
  onApply: (patch: { title?: string; excerpt?: string; slug?: string; seo?: { metaTitle?: string; metaDescription?: string; focusKeyword?: string } }) => void
}) {
  const assist = useAction(blogApi.aiAssist)
  const [busy, setBusy] = useState<AiTask | null>(null)
  const [results, setResults] = useState<Results>({})
  const [remaining, setRemaining] = useState(viewer.ai.remaining)
  const [mode, setMode] = useState('simpler')
  const [pendingRewrite, setPendingRewrite] = useState<RewriteRequest | null>(null)

  useEffect(() => setRemaining(viewer.ai.remaining), [viewer.ai.remaining])
  useEffect(() => {
    if (rewrite) {
      setPendingRewrite(rewrite)
      setResults((r) => ({ ...r, rewrite: undefined }))
    }
  }, [rewrite])

  if (!viewer.ai.enabled) {
    return (
      <div className="rounded-xl bg-rh-canvas p-4 text-[13px] leading-relaxed text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-400">
        AI assist isn&apos;t switched on yet. An administrator needs to add the AI key on Convex (the same one Rehabify Scribe uses).
      </div>
    )
  }

  const call = async (task: AiTask, extra: { text?: string; mode?: string } = {}) => {
    setBusy(task)
    try {
      const reply = await assist({ task, postId, title, keyword, text: extra.text ?? getText(), ...(extra.mode ? { mode: extra.mode } : {}) })
      setRemaining(reply.remaining)
      return reply.result
    } catch (error) {
      toast.error(errorText(error, 'AI assist couldn’t do that just now. Try again.'))
      return null
    } finally {
      setBusy(null)
    }
  }

  const select = (needle: string) => {
    if (!editor) return false
    const range = findInDoc(editor.state.doc, needle)
    if (!range) {
      toast.message("Couldn't find those words in the post any more.")
      return false
    }
    editor.chain().focus().setTextSelection(range).scrollIntoView().run()
    return range
  }

  const insertAtEnd = (content: object[]) => {
    if (!editor) return
    editor.chain().focus().insertContentAt(editor.state.doc.content.size, content).run()
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        Suggestions only: nothing changes until you press Use. Check every health fact yourself. {remaining} of {viewer.ai.limit} left today.
      </p>

      {pendingRewrite ? (
        <Result title="Rewrite the selected text" onClose={() => setPendingRewrite(null)}>
          <p className="line-clamp-4 rounded-lg bg-white p-2 text-[12px] italic text-neutral-600 dark:bg-white/5 dark:text-neutral-300">{pendingRewrite.text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REWRITE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold', mode === m.id ? 'bg-rh-ink text-white dark:bg-rh-lime dark:text-rh-ink' : 'bg-white text-rh-ink ring-1 ring-black/10 dark:bg-white/10 dark:text-white dark:ring-0')}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className={cn(primaryButtonClass, 'mt-2 w-full')}
            disabled={busy !== null || disabled}
            onClick={async () => {
              const result = await call('rewrite', { text: pendingRewrite.text, mode })
              if (result) setResults((r) => ({ ...r, rewrite: String(result.text ?? '') }))
            }}
          >
            {busy === 'rewrite' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Rewrite
          </Button>
          {results.rewrite ? (
            <div className="mt-3">
              <p className="whitespace-pre-line rounded-lg bg-white p-2 text-[13px] leading-relaxed text-rh-ink dark:bg-white/5 dark:text-white">{results.rewrite}</p>
              <Button
                type="button"
                size="sm"
                className={cn(softButtonClass, 'mt-2 w-full')}
                disabled={disabled}
                onClick={() => {
                  if (!editor) return
                  const current = editor.state.doc.textBetween(pendingRewrite.from, pendingRewrite.to, '\n\n')
                  if (current !== pendingRewrite.text) {
                    toast.message('The text changed since you selected it. Select it again and rewrite.')
                    return
                  }
                  const paragraphs = results.rewrite!.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
                  const content =
                    paragraphs.length <= 1
                      ? results.rewrite!.trim()
                      : paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
                  editor.chain().focus().insertContentAt({ from: pendingRewrite.from, to: pendingRewrite.to }, content).run()
                  setPendingRewrite(null)
                  setResults((r) => ({ ...r, rewrite: undefined }))
                }}
              >
                Replace the selected text
              </Button>
            </div>
          ) : null}
        </Result>
      ) : null}

      <Action
        icon={<Type />}
        title="Suggest titles"
        hint="Five clear titles with your keyword"
        busy={busy === 'titles'}
        disabled={disabled}
        onClick={async () => {
          const r = await call('titles')
          if (r) setResults((x) => ({ ...x, titles: (r.titles as string[]) ?? [] }))
        }}
      />
      {results.titles ? (
        <Result title="Titles" onClose={() => setResults((x) => ({ ...x, titles: undefined }))}>
          {results.titles.map((t) => (
            <UseRow key={t} value={t} onUse={() => onApply({ title: t })} />
          ))}
        </Result>
      ) : null}

      <Action
        icon={<Search />}
        title="Write the search details"
        hint="SEO title, meta description, summary, web address, keyword"
        busy={busy === 'meta'}
        disabled={disabled}
        onClick={async () => {
          const r = await call('meta')
          if (r) setResults((x) => ({ ...x, meta: r as unknown as Meta }))
        }}
      />
      {results.meta ? (
        <Result title="Search details" onClose={() => setResults((x) => ({ ...x, meta: undefined }))}>
          {results.meta.metaTitle ? <UseRow label="SEO title" value={results.meta.metaTitle} onUse={() => onApply({ seo: { metaTitle: results.meta!.metaTitle } })} /> : null}
          {results.meta.metaDescription ? (
            <UseRow label="Meta description" value={results.meta.metaDescription} onUse={() => onApply({ seo: { metaDescription: results.meta!.metaDescription } })} />
          ) : null}
          {results.meta.excerpt ? <UseRow label="Summary" value={results.meta.excerpt} onUse={() => onApply({ excerpt: results.meta!.excerpt })} /> : null}
          {results.meta.slug ? <UseRow label="Web address" value={`/blog/${results.meta.slug}`} onUse={() => onApply({ slug: results.meta!.slug })} /> : null}
          {results.meta.focusKeyword ? (
            <UseRow label="Focus keyword" value={results.meta.focusKeyword} onUse={() => onApply({ seo: { focusKeyword: results.meta!.focusKeyword } })} />
          ) : null}
          {results.meta.relatedKeywords.length ? (
            <p className="border-t border-black/5 pt-2 text-[12px] text-neutral-500 dark:border-white/10">
              <span className="font-semibold">Also mention:</span> {results.meta.relatedKeywords.join(', ')}
            </p>
          ) : null}
        </Result>
      ) : null}

      <Action
        icon={<ListChecks />}
        title="Plan the post"
        hint="Section headings with what to cover"
        busy={busy === 'outline'}
        disabled={disabled}
        onClick={async () => {
          const r = await call('outline')
          if (r) setResults((x) => ({ ...x, outline: (r.outline as Outline) ?? [] }))
        }}
      />
      {results.outline ? (
        <Result title="Outline" onClose={() => setResults((x) => ({ ...x, outline: undefined }))}>
          <ol className="space-y-1.5 text-[13px] text-rh-ink dark:text-white">
            {results.outline.map((o, i) => (
              <li key={i} className={o.level === 3 ? 'pl-4' : ''}>
                <span className="font-semibold">{o.heading}</span>
                {o.points.length ? <span className="block text-[12px] text-neutral-500">{o.points.join(' · ')}</span> : null}
              </li>
            ))}
          </ol>
          <Button
            type="button"
            size="sm"
            className={cn(softButtonClass, 'mt-3 w-full')}
            disabled={disabled}
            onClick={() => {
              const content: object[] = []
              for (const o of results.outline!) {
                content.push({ type: 'heading', attrs: { level: o.level }, content: [{ type: 'text', text: o.heading }] })
                if (o.points.length)
                  content.push({
                    type: 'bulletList',
                    content: o.points.map((p) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: p }] }] })),
                  })
              }
              insertAtEnd(content)
              toast.success('Outline added at the end. Turn each set of points into paragraphs.')
            }}
          >
            Add the outline to the post
          </Button>
        </Result>
      ) : null}

      <Action
        icon={<HelpCircle />}
        title="Write an FAQ"
        hint="Questions readers ask, from what the post says"
        busy={busy === 'faq'}
        disabled={disabled}
        onClick={async () => {
          const r = await call('faq')
          if (r) setResults((x) => ({ ...x, faq: (r.items as Faq) ?? [] }))
        }}
      />
      {results.faq ? (
        <Result title="FAQ" onClose={() => setResults((x) => ({ ...x, faq: undefined }))}>
          <ul className="space-y-2 text-[13px]">
            {results.faq.map((f, i) => (
              <li key={i}>
                <span className="font-semibold text-rh-ink dark:text-white">{f.question}</span>
                <span className="block text-[12px] text-neutral-500">{f.answer}</span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            className={cn(softButtonClass, 'mt-3 w-full')}
            disabled={disabled || results.faq.length === 0}
            onClick={() => {
              insertAtEnd([{ type: 'faq', attrs: { title: '', items: results.faq } }])
              toast.success('FAQ block added at the end of the post.')
            }}
          >
            Add as an FAQ block
          </Button>
        </Result>
      ) : null}

      <Action
        icon={<LinkIcon />}
        title="Suggest internal links"
        hint="Places to link to our pages and other posts"
        busy={busy === 'links'}
        disabled={disabled}
        onClick={async () => {
          const r = await call('links')
          if (r) setResults((x) => ({ ...x, links: (r.links as Links) ?? [] }))
        }}
      />
      {results.links ? (
        <Result title="Links" onClose={() => setResults((x) => ({ ...x, links: undefined }))}>
          {results.links.length === 0 ? <p className="text-[13px] text-neutral-500">No good matches yet. Publish more posts and try again.</p> : null}
          {results.links.map((l, i) => (
            <UseRow
              key={i}
              value={`“${l.anchorText}” → ${l.path}${l.reason ? ` (${l.reason})` : ''}`}
              onUse={() => {
                const range = select(l.anchorText)
                if (range && editor) editor.chain().focus().setTextSelection(range).setLink({ href: l.path }).run()
              }}
            />
          ))}
        </Result>
      ) : null}

      <Action
        icon={<ShieldCheck />}
        title="Health safety check"
        hint="Claims without sources, dosing, missing red flags"
        busy={busy === 'safety'}
        disabled={disabled}
        onClick={async () => {
          const r = await call('safety')
          if (r) setResults((x) => ({ ...x, safety: r as unknown as Safety }))
        }}
      />
      {results.safety ? (
        <Result title="Safety check" onClose={() => setResults((x) => ({ ...x, safety: undefined }))}>
          {results.safety.summary ? <p className="mb-2 text-[13px] text-rh-ink dark:text-white">{results.safety.summary}</p> : null}
          {results.safety.issues.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-rh-lime-deep">
              <Check className="h-4 w-4" /> Nothing flagged.
            </p>
          ) : (
            <ul className="space-y-2">
              {results.safety.issues.map((issue, i) => (
                <li key={i} className="rounded-lg bg-white p-2.5 text-[12px] leading-snug dark:bg-white/5">
                  <span className={cn('mb-1 inline-flex items-center gap-1 font-semibold', issue.severity === 'high' ? 'text-rose-600' : issue.severity === 'medium' ? 'text-amber-600' : 'text-neutral-500')}>
                    <AlertTriangle className="h-3.5 w-3.5" /> {issue.severity === 'high' ? 'Important' : issue.severity === 'medium' ? 'Check this' : 'Minor'}
                  </span>
                  {issue.quote ? <span className="block italic text-neutral-500">“{issue.quote}”</span> : null}
                  <span className="mt-1 block text-rh-ink dark:text-white">{issue.problem}</span>
                  {issue.suggestion ? <span className="mt-1 block text-neutral-600 dark:text-neutral-300">Try: {issue.suggestion}</span> : null}
                  {issue.quote ? (
                    <button type="button" onClick={() => select(issue.quote)} className="mt-1.5 text-[11px] font-semibold text-rh-ink underline decoration-rh-lime underline-offset-2 dark:text-white">
                      Show me
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Result>
      ) : null}

      <p className="flex items-start gap-2 pt-1 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Select words in the post and press Rewrite to make them simpler, shorter or warmer. Pictures have an AI button for alt text.
      </p>
    </div>
  )
}
