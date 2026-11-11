'use client'

import { useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ImagePlus, Lightbulb, Loader2, Plus, Trash2, X } from '@/components/icons'
import { CALLOUT_KINDS, DEFAULT_CTA, type CalloutKind } from '@/components/blog/PostBody'
import { imagekitTransform } from '@/lib/blog/content'
import { cn } from '@/lib/utils'
import { useBlogEditorTools } from './context'

/**
 * The blog's own blocks. Each one stores everything in attributes (or, for callouts, ordinary
 * paragraphs and lists inside it), so components/blog/PostBody can draw it on the site with no
 * editor code. Keep the attribute names in step with PostBody and lib/blog/content.
 */

const field =
  'w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[13px] text-rh-ink outline-none placeholder:text-neutral-400 focus:border-rh-lime focus:ring-2 focus:ring-rh-lime/30'
const iconButton = 'flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-black/5 hover:text-rh-ink'

const jsonAttr = (name: string, fallback: unknown) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    try {
      return JSON.parse(el.getAttribute(`data-${name}`) ?? '') ?? fallback
    } catch {
      return fallback
    }
  },
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
})

const textAttr = (name: string) => ({
  default: '',
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? '',
  renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: String(attrs[name] ?? '') }),
})

function BlockFrame({ selected, label, children, onDelete }: { selected: boolean; label: string; children: React.ReactNode; onDelete?: () => void }) {
  const { readOnly } = useBlogEditorTools()
  return (
    <NodeViewWrapper
      className={cn('blog-block group/block relative my-6 rounded-2xl transition-shadow', selected && 'ring-2 ring-rh-lime ring-offset-4')}
      contentEditable={false}
    >
      {!readOnly ? (
        <div className="pointer-events-none absolute -top-3 left-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover/block:pointer-events-auto group-hover/block:opacity-100">
          <span className="rounded-md bg-rh-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{label}</span>
          {onDelete ? (
            <button type="button" onClick={onDelete} className="flex h-5 w-5 items-center justify-center rounded-md bg-rh-ink text-white hover:bg-rose-600" aria-label={`Remove ${label}`}>
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
    </NodeViewWrapper>
  )
}

function AltButton({ url, caption, onAlt }: { url: string; caption?: string; onAlt: (alt: string) => void }) {
  const { suggestAlt } = useBlogEditorTools()
  const [busy, setBusy] = useState(false)
  if (!suggestAlt) return null
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          const alt = await suggestAlt({ url, caption })
          if (alt) onAlt(alt)
        } finally {
          setBusy(false)
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rh-honeydew px-2 py-1.5 text-[12px] font-semibold text-rh-ink hover:bg-[#e2f7d8] disabled:opacity-60"
      title="Let AI describe the picture"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="h-3.5 w-3.5" />}
      AI
    </button>
  )
}

// ── Image ────────────────────────────────────────────────────────────────────

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pickImages, readOnly } = useBlogEditorTools()
  const src = String(node.attrs.src ?? '')
  const alt = String(node.attrs.alt ?? '')
  const caption = String(node.attrs.caption ?? '')
  return (
    <BlockFrame selected={selected} label="Picture" onDelete={readOnly ? undefined : deleteNode}>
      <figure className="m-0">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- editor preview of an ImageKit picture
          <img src={imagekitTransform(src, { w: 1200, q: 75 })} alt={alt} className="mx-auto block max-h-[520px] w-auto max-w-full rounded-2xl bg-rh-canvas" />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-2xl bg-rh-canvas text-sm text-neutral-500">Picture missing</div>
        )}
        {!readOnly ? (
          <div className="mt-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={alt}
                onChange={(e) => updateAttributes({ alt: e.target.value })}
                placeholder="Alt text: describe what the picture shows (needed for Google and screen readers)"
                className={cn(field, alt.trim().length < 5 && 'border-amber-400 bg-amber-50')}
                maxLength={200}
              />
              {src ? <AltButton url={src} caption={caption} onAlt={(a) => updateAttributes({ alt: a })} /> : null}
              <button
                type="button"
                className={iconButton}
                title="Replace picture"
                onClick={async () => {
                  const [img] = await pickImages({ multiple: false, title: 'Replace picture' })
                  if (img) updateAttributes({ src: img.url, alt: img.alt || alt, width: img.width ?? null, height: img.height ?? null })
                }}
              >
                <ImagePlus className="h-4 w-4" />
              </button>
            </div>
            <input value={caption} onChange={(e) => updateAttributes({ caption: e.target.value })} placeholder="Caption (optional, shown under the picture)" className={field} maxLength={240} />
          </div>
        ) : caption ? (
          <figcaption className="mt-2 text-center text-sm text-neutral-500">{caption}</figcaption>
        ) : null}
      </figure>
    </BlockFrame>
  )
}

export const ImageBlock = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      caption: textAttr('caption'),
      width: { default: null },
      height: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: 'img[src]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView)
  },
})

// ── Gallery ──────────────────────────────────────────────────────────────────

type GalleryImage = { src: string; alt: string; caption?: string; width?: number; height?: number }

function GalleryView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { pickImages, readOnly } = useBlogEditorTools()
  const images = (Array.isArray(node.attrs.images) ? node.attrs.images : []) as GalleryImage[]
  const set = (next: GalleryImage[]) => updateAttributes({ images: next })
  return (
    <BlockFrame selected={selected} label="Gallery" onDelete={readOnly ? undefined : deleteNode}>
      <div className={cn('grid gap-3', images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
        {images.map((img, i) => (
          <div key={`${img.src}-${i}`} className="space-y-1.5">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-rh-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element -- editor preview */}
              <img src={imagekitTransform(img.src, { w: 480, q: 70 })} alt={img.alt} className="h-full w-full object-cover" />
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => set(images.filter((_, j) => j !== i))}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rh-ink/80 text-white hover:bg-rose-600"
                  aria-label="Remove from gallery"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            {!readOnly ? (
              <div className="flex items-center gap-1">
                <input
                  value={img.alt}
                  onChange={(e) => set(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                  placeholder="Alt text"
                  className={cn(field, 'py-1 text-[12px]', img.alt.trim().length < 5 && 'border-amber-400 bg-amber-50')}
                  maxLength={200}
                />
                <AltButton url={img.src} caption={img.caption} onAlt={(a) => set(images.map((x, j) => (j === i ? { ...x, alt: a } : x)))} />
              </div>
            ) : null}
          </div>
        ))}
        {!readOnly ? (
          <button
            type="button"
            onClick={async () => {
              const picked = await pickImages({ multiple: true, title: 'Add to the gallery' })
              if (picked.length) set([...images, ...picked.map((p) => ({ src: p.url, alt: p.alt, width: p.width, height: p.height }))].slice(0, 12))
            }}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-black/10 text-[13px] font-semibold text-neutral-500 hover:border-rh-lime hover:text-rh-ink"
          >
            <Plus className="h-5 w-5" />
            Add pictures
          </button>
        ) : null}
      </div>
    </BlockFrame>
  )
}

export const GalleryBlock = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { images: jsonAttr('images', []) }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="gallery"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'gallery' }, HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(GalleryView)
  },
})

// ── Callout (note, tip, warning, key takeaways) ──────────────────────────────

function CalloutView({ node, updateAttributes, selected }: NodeViewProps) {
  const { readOnly } = useBlogEditorTools()
  const kind = (String(node.attrs.kind) in CALLOUT_KINDS ? String(node.attrs.kind) : 'note') as CalloutKind
  const style = CALLOUT_KINDS[kind]
  return (
    <NodeViewWrapper className={cn('my-6 rounded-2xl p-5', style.box, selected && 'ring-2 ring-rh-lime ring-offset-4')}>
      <div contentEditable={false} className="mb-2 flex items-center gap-2">
        {readOnly ? (
          <span className={cn('text-[12px] font-bold uppercase tracking-wide', style.title)}>{style.label}</span>
        ) : (
          <select
            value={kind}
            onChange={(e) => updateAttributes({ kind: e.target.value })}
            className={cn('cursor-pointer rounded-md border-0 bg-transparent py-0 pl-0 pr-6 text-[12px] font-bold uppercase tracking-wide outline-none', style.title)}
            aria-label="Callout type"
          >
            {(Object.keys(CALLOUT_KINDS) as CalloutKind[]).map((k) => (
              <option key={k} value={k} className="text-rh-ink">
                {CALLOUT_KINDS[k].label}
              </option>
            ))}
          </select>
        )}
      </div>
      <NodeViewContent className={cn('callout-content', kind === 'takeaways' && 'is-dark')} />
    </NodeViewWrapper>
  )
}

export const CalloutBlock = Node.create({
  name: 'callout',
  group: 'block',
  content: '(paragraph | bulletList | orderedList)+',
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      kind: {
        default: 'note',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-kind') ?? 'note',
        renderHTML: (attrs: Record<string, unknown>) => ({ 'data-kind': String(attrs.kind ?? 'note') }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes({ 'data-type': 'callout' }, HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },
})

// ── FAQ ──────────────────────────────────────────────────────────────────────

type FaqRow = { question: string; answer: string }

function FaqView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { readOnly } = useBlogEditorTools()
  const items = (Array.isArray(node.attrs.items) ? node.attrs.items : []) as FaqRow[]
  const title = String(node.attrs.title ?? '')
  const set = (next: FaqRow[]) => updateAttributes({ items: next })
  const move = (i: number, by: number) => {
    const next = [...items]
    const [row] = next.splice(i, 1)
    next.splice(i + by, 0, row)
    set(next)
  }
  return (
    <BlockFrame selected={selected} label="FAQ" onDelete={readOnly ? undefined : deleteNode}>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-black/10">
        {readOnly ? (
          <p className="text-xl font-bold">{title || 'Frequently asked questions'}</p>
        ) : (
          <input
            value={title}
            onChange={(e) => updateAttributes({ title: e.target.value })}
            placeholder="Frequently asked questions"
            className="w-full border-0 bg-transparent p-0 text-xl font-bold text-rh-ink outline-none placeholder:text-rh-ink/40"
            maxLength={120}
          />
        )}
        <p className="mt-1 text-[12px] text-neutral-500">Shown as an accordion, and sent to Google as FAQ structured data.</p>
        <div className="mt-4 space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl bg-rh-canvas/70 p-3">
              {readOnly ? (
                <>
                  <p className="font-semibold">{item.question}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-neutral-600">{item.answer}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <input
                      value={item.question}
                      onChange={(e) => set(items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                      placeholder="Question"
                      className={cn(field, 'font-semibold')}
                      maxLength={240}
                    />
                    <button type="button" className={iconButton} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={iconButton} disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className={iconButton} onClick={() => set(items.filter((_, j) => j !== i))} aria-label="Remove question">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={item.answer}
                    onChange={(e) => set(items.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                    placeholder="Answer (plain text, 30 to 80 words works best)"
                    rows={3}
                    className={cn(field, 'mt-2 resize-y leading-relaxed')}
                    maxLength={900}
                  />
                </>
              )}
            </div>
          ))}
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => {
              if (items.length >= 12) {
                toast.message('Keep an FAQ to 12 questions at most.')
                return
              }
              set([...items, { question: '', answer: '' }])
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-rh-ink hover:bg-black/5"
          >
            <Plus className="h-4 w-4" /> Add a question
          </button>
        ) : null}
      </div>
    </BlockFrame>
  )
}

export const FaqBlock = Node.create({
  name: 'faq',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { title: textAttr('title'), items: jsonAttr('items', [{ question: '', answer: '' }]) }
  },
  parseHTML() {
    return [{ tag: 'section[data-type="faq"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes({ 'data-type': 'faq' }, HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FaqView)
  },
})

// ── Call to action ───────────────────────────────────────────────────────────

function CtaView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { readOnly } = useBlogEditorTools()
  const a = node.attrs as { title?: string; text?: string; label?: string; href?: string }
  const input = 'w-full border-0 bg-transparent p-0 outline-none placeholder:text-white/40'
  return (
    <BlockFrame selected={selected} label="Button" onDelete={readOnly ? undefined : deleteNode}>
      <div className="rounded-[1.5rem] bg-rh-ink p-6 text-white">
        {readOnly ? (
          <>
            <p className="text-xl font-bold">{a.title || DEFAULT_CTA.title}</p>
            {a.text ? <p className="mt-1 text-sm text-white/70">{a.text}</p> : null}
            <span className="mt-4 inline-flex h-10 items-center rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink">{a.label || DEFAULT_CTA.label}</span>
          </>
        ) : (
          <>
            <input value={a.title ?? ''} onChange={(e) => updateAttributes({ title: e.target.value })} placeholder={DEFAULT_CTA.title} className={cn(input, 'text-xl font-bold')} maxLength={90} />
            <textarea
              value={a.text ?? ''}
              onChange={(e) => updateAttributes({ text: e.target.value })}
              placeholder={DEFAULT_CTA.text}
              rows={2}
              className={cn(input, 'mt-1 resize-none text-sm text-white/80')}
              maxLength={220}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={a.label ?? ''}
                onChange={(e) => updateAttributes({ label: e.target.value })}
                placeholder={DEFAULT_CTA.label}
                className="h-10 w-56 rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink outline-none placeholder:text-rh-ink/60"
                maxLength={40}
              />
              <input
                value={a.href ?? ''}
                onChange={(e) => updateAttributes({ href: e.target.value })}
                placeholder="Link (empty = chat with Joy on WhatsApp)"
                className="h-10 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-[13px] text-white outline-none placeholder:text-white/40 focus:bg-white/15"
                maxLength={300}
              />
            </div>
          </>
        )}
      </div>
    </BlockFrame>
  )
}

export const CtaBlock = Node.create({
  name: 'cta',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { title: textAttr('title'), text: textAttr('text'), label: textAttr('label'), href: textAttr('href') }
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="cta"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes({ 'data-type': 'cta' }, HTMLAttributes)]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CtaView)
  },
})
