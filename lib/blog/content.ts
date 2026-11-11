/**
 * Blog post bodies are Tiptap documents saved as JSON. These helpers read them without any
 * editor code, so the same rules run in Convex (word counts, checks), on the public pages
 * (contents list, FAQ schema) and in the editor's SEO panel. No imports: keep it that way.
 */

export type BlogMark = { type: string; attrs?: Record<string, unknown> }
export type BlogNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: BlogNode[]
  text?: string
  marks?: BlogMark[]
}

export const EMPTY_DOC: BlogNode = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Largest body we store (Convex documents cap at 1 MB). */
export const MAX_BODY_CHARS = 400_000

/** Parses a saved body; anything unreadable becomes an empty document. */
export function parseBody(json: string | null | undefined): BlogNode {
  if (!json) return EMPTY_DOC
  try {
    const doc = JSON.parse(json) as BlogNode
    return doc && doc.type === 'doc' && Array.isArray(doc.content) ? doc : EMPTY_DOC
  } catch {
    return EMPTY_DOC
  }
}

/** Calls `visit` on every node, depth first. */
export function walk(node: BlogNode, visit: (node: BlogNode, parent: BlogNode | null) => void, parent: BlogNode | null = null) {
  visit(node, parent)
  for (const child of node.content ?? []) walk(child, visit, node)
}

/** The text inside a node, with blocks joined by spaces. */
export function nodeText(node: BlogNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  const parts = (node.content ?? []).map(nodeText)
  return BLOCK_TYPES.has(node.type) ? parts.join(' ') : parts.join('')
}

const BLOCK_TYPES = new Set([
  'doc',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'callout',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
])

/** Text of atom blocks (FAQ, CTA, gallery captions) that live in attributes, not content. */
function atomText(node: BlogNode): string {
  const attrs = node.attrs ?? {}
  if (node.type === 'faq') {
    return faqFromNode(node)
      .map((item) => `${item.question} ${item.answer}`)
      .join(' ')
  }
  if (node.type === 'cta') return [attrs.title, attrs.text, attrs.label].filter((v) => typeof v === 'string').join(' ')
  if (node.type === 'image') return typeof attrs.caption === 'string' ? attrs.caption : ''
  if (node.type === 'gallery') {
    const images = Array.isArray(attrs.images) ? (attrs.images as { caption?: unknown }[]) : []
    return images.map((img) => (typeof img.caption === 'string' ? img.caption : '')).join(' ')
  }
  return ''
}

/** Plain text of the whole post: one line per block, for word counts, readability and the AI. */
export function plainText(doc: BlogNode): string {
  const lines: string[] = []
  const visitBlock = (node: BlogNode) => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
      const text = nodeText(node).trim()
      if (text) lines.push(text)
      return
    }
    const extra = atomText(node).trim()
    if (extra) lines.push(extra)
    for (const child of node.content ?? []) visitBlock(child)
  }
  visitBlock(doc)
  return lines.join('\n')
}

export function countWords(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}'’-]+/gu)
  return words ? words.length : 0
}

/** About 220 words a minute; never less than one. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220))
}

export function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section'
  )
}

/** Gives each heading a unique anchor id, in document order; the renderer uses the same one. */
export function headingIdMaker() {
  const used = new Map<string, number>()
  return (text: string) => {
    const base = slugifyHeading(text)
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    return n === 0 ? base : `${base}-${n + 1}`
  }
}

export type OutlineItem = { id: string; text: string; level: number }

/** Every heading (H2 to H4) with the anchor id the public page gives it. */
export function outline(doc: BlogNode): OutlineItem[] {
  const makeId = headingIdMaker()
  const items: OutlineItem[] = []
  walk(doc, (node) => {
    // An FAQ block draws its own Heading 2 (see PostBody), so it takes an id in the same order
    if (node.type === 'faq') {
      if (faqFromNode(node).length === 0) return
      const title = (typeof node.attrs?.title === 'string' ? node.attrs.title.trim() : '') || 'Frequently asked questions'
      items.push({ id: makeId(title), text: title, level: 2 })
      return
    }
    if (node.type !== 'heading') return
    const text = nodeText(node).trim()
    if (!text) return
    const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4)
    items.push({ id: makeId(text), text, level })
  })
  return items
}

export type FaqItem = { question: string; answer: string }

function faqFromNode(node: BlogNode): FaqItem[] {
  const items = Array.isArray(node.attrs?.items) ? (node.attrs!.items as { question?: unknown; answer?: unknown }[]) : []
  return items
    .map((item) => ({
      question: typeof item.question === 'string' ? item.question.trim() : '',
      answer: typeof item.answer === 'string' ? item.answer.trim() : '',
    }))
    .filter((item) => item.question && item.answer)
}

/** Questions and answers from every FAQ block, for FAQPage structured data. */
export function faqItems(doc: BlogNode): FaqItem[] {
  const all: FaqItem[] = []
  walk(doc, (node) => {
    if (node.type === 'faq') all.push(...faqFromNode(node))
  })
  return all
}

export type BodyImage = { src: string; alt: string; caption: string }

export function bodyImages(doc: BlogNode): BodyImage[] {
  const images: BodyImage[] = []
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  walk(doc, (node) => {
    if (node.type === 'image' && str(node.attrs?.src)) {
      images.push({ src: str(node.attrs?.src), alt: str(node.attrs?.alt).trim(), caption: str(node.attrs?.caption) })
    }
    if (node.type === 'gallery' && Array.isArray(node.attrs?.images)) {
      for (const img of node.attrs!.images as Record<string, unknown>[]) {
        if (str(img.src)) images.push({ src: str(img.src), alt: str(img.alt).trim(), caption: str(img.caption) })
      }
    }
  })
  return images
}

export type BodyLink = { href: string; text: string; internal: boolean }

/** Links written in the text (not the CTA button), split into internal and external. */
export function bodyLinks(doc: BlogNode, siteHosts: string[] = ['physioaroundme.com']): BodyLink[] {
  const links: BodyLink[] = []
  walk(doc, (node) => {
    if (node.type !== 'text') return
    const link = node.marks?.find((m) => m.type === 'link')
    const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : ''
    if (!href) return
    links.push({ href, text: node.text ?? '', internal: isInternalHref(href, siteHosts) })
  })
  return links
}

export function isInternalHref(href: string, siteHosts: string[] = ['physioaroundme.com']): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true
  try {
    const host = new URL(href).hostname.replace(/^www\./, '')
    return siteHosts.some((site) => host === site || host.endsWith(`.${site}`))
  } catch {
    return false
  }
}

/** Links we render: web, mail, phone, and paths on this site. Never javascript: or data:. */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string' || !href.trim()) return false
  const value = href.trim()
  if (value.startsWith('/') && !value.startsWith('//')) return true
  if (value.startsWith('#')) return true
  return /^(https?:|mailto:|tel:)/i.test(value)
}

/** Only https images are shown. */
export function isSafeImageSrc(src: unknown): src is string {
  return typeof src === 'string' && /^https:\/\/[^\s]+$/i.test(src.trim())
}

/** The YouTube video id from any common link form, or null. */
export function youtubeId(src: unknown): string | null {
  if (typeof src !== 'string') return null
  try {
    const url = new URL(src)
    const host = url.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return clean(url.pathname.slice(1))
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.searchParams.get('v')) return clean(url.searchParams.get('v')!)
      const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/)
      if (match) return clean(match[2])
    }
  } catch {
    // not a URL
  }
  return null
  function clean(id: string) {
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null
  }
}

/** Text of the first non-empty paragraph. */
export function firstParagraph(doc: BlogNode): string {
  let found = ''
  walk(doc, (node) => {
    if (found || node.type !== 'paragraph') return
    found = nodeText(node).trim()
  })
  return found
}

/** Word count and reading time for a saved body. */
export function bodyStats(doc: BlogNode): { wordCount: number; readingMinutes: number } {
  const wordCount = countWords(plainText(doc))
  return { wordCount, readingMinutes: readingMinutes(wordCount) }
}

/** Public URL path of a post, category or author. */
export const blogPaths = {
  index: '/blog',
  post: (slug: string) => `/blog/${slug}`,
  category: (slug: string) => `/blog/category/${slug}`,
  author: (slug: string) => `/blog/author/${slug}`,
  page: (n: number) => (n <= 1 ? '/blog' : `/blog/page/${n}`),
}

/** Slugs: lowercase letters, numbers and single hyphens, 3 to 80 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(text: string, max = 70): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

/** ImageKit resize on the fly: width in px, optional height (cropped around the subject). */
export function imagekitTransform(src: string, opts: { w: number; h?: number; q?: number }) {
  if (!/^https:\/\/ik\.imagekit\.io\//i.test(src)) return src
  const parts = [`w-${opts.w}`, opts.h ? `h-${opts.h}` : null, opts.h ? 'fo-auto' : null, `q-${opts.q ?? 80}`].filter(Boolean)
  return `${src}${src.includes('?') ? '&' : '?'}tr=${parts.join(',')}`
}
