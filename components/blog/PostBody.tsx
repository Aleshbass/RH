import { Fragment, type ReactNode } from 'react'
import Link from 'next/link'
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp'
import {
  headingIdMaker,
  isInternalHref,
  isSafeHref,
  isSafeImageSrc,
  nodeText,
  youtubeId,
  type BlogMark,
  type BlogNode,
} from '@/lib/blog/content'
import { BlogImage } from './BlogImage'
import { YouTubeEmbed } from './YouTubeEmbed'

/**
 * Renders a saved post (Tiptap JSON) as plain semantic HTML. It has no editor code in it, so
 * the article page ships almost no JavaScript, and it only draws block types and link kinds it
 * knows: anything else in the JSON is skipped. Used on /blog and for the editor's preview.
 */

export const CALLOUT_KINDS = {
  note: { label: 'Good to know', box: 'bg-white ring-1 ring-rh-ink/10', title: 'text-rh-ink' },
  tip: { label: 'Tip', box: 'bg-rh-honeydew', title: 'text-rh-ink' },
  warning: { label: 'Take care', box: 'bg-rh-peach', title: 'text-rh-ink' },
  takeaways: { label: 'Key takeaways', box: 'bg-rh-ink text-white', title: 'text-rh-lime' },
} as const

export type CalloutKind = keyof typeof CALLOUT_KINDS

export const DEFAULT_CTA = {
  title: 'Need help with this?',
  text: 'Talk to a licensed physiotherapist by video or at home. Joy, our WhatsApp assistant, will set it up for you.',
  label: 'Book a physiotherapist',
  message: "Hi Joy, I'd like to book a physiotherapy session.",
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined)

type Options = { makeId: (text: string) => string; tight: boolean; dark: boolean }

function linkProps(href: string) {
  if (isInternalHref(href)) return {}
  return /^https?:/i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}

function withMarks(text: string, marks: BlogMark[] | undefined, dark: boolean): ReactNode {
  let out: ReactNode = text
  let link: string | null = null
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') out = <strong className="font-semibold">{out}</strong>
    else if (mark.type === 'italic') out = <em>{out}</em>
    else if (mark.type === 'underline') out = <u>{out}</u>
    else if (mark.type === 'strike') out = <s>{out}</s>
    else if (mark.type === 'code') out = <code className="rounded bg-rh-ink/[0.06] px-1.5 py-0.5 text-[0.9em]">{out}</code>
    else if (mark.type === 'link' && isSafeHref(mark.attrs?.href)) link = mark.attrs!.href as string
  }
  if (!link) return out
  const className = dark
    ? 'font-medium text-rh-lime underline decoration-rh-lime/50 underline-offset-[3px] hover:decoration-rh-lime'
    : 'font-medium text-rh-ink underline decoration-rh-lime decoration-2 underline-offset-[3px] hover:decoration-rh-lime-deep'
  if (link.startsWith('/')) {
    return (
      <Link href={link} className={className}>
        {out}
      </Link>
    )
  }
  return (
    <a href={link} className={className} {...linkProps(link)}>
      {out}
    </a>
  )
}

function Inline({ nodes, dark }: { nodes: BlogNode[] | undefined; dark: boolean }) {
  return (
    <>
      {(nodes ?? []).map((node, i) => {
        if (node.type === 'text') return <Fragment key={i}>{withMarks(node.text ?? '', node.marks, dark)}</Fragment>
        if (node.type === 'hardBreak') return <br key={i} />
        return null
      })}
    </>
  )
}

function Figure({ src, alt, caption, width, height }: { src: string; alt: string; caption: string; width?: number; height?: number }) {
  const w = width ?? 1600
  const h = height ?? 900
  return (
    <figure className="mt-8">
      <BlogImage
        src={src}
        alt={alt}
        width={w}
        height={h}
        sizes="(min-width: 1024px) 720px, 100vw"
        className="h-auto w-full rounded-2xl bg-rh-ink/5"
      />
      {caption ? <figcaption className="mt-2.5 text-center text-sm text-rh-ink/60">{caption}</figcaption> : null}
    </figure>
  )
}

function Block({ node, opts }: { node: BlogNode; opts: Options }): ReactNode {
  const children = (tight = opts.tight, dark = opts.dark) =>
    (node.content ?? []).map((child, i) => <Block key={i} node={child} opts={{ ...opts, tight, dark }} />)
  const body = opts.dark ? 'text-white/85' : 'text-rh-ink/85'

  switch (node.type) {
    case 'paragraph': {
      if (!node.content?.length) return null
      return (
        <p className={`${opts.tight ? 'mt-2 first:mt-0' : 'mt-5'} text-[17px] leading-[1.75] ${body}`}>
          <Inline nodes={node.content} dark={opts.dark} />
        </p>
      )
    }
    case 'heading': {
      const text = nodeText(node).trim()
      if (!text) return null
      const id = opts.makeId(text)
      const level = Math.min(Math.max(Number(node.attrs?.level) || 2, 2), 4)
      const inner = <Inline nodes={node.content} dark={opts.dark} />
      if (level === 2)
        return (
          <h2 id={id} className="mt-12 scroll-mt-28 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">
            {inner}
          </h2>
        )
      if (level === 3)
        return (
          <h3 id={id} className="mt-9 scroll-mt-28 text-xl font-bold leading-snug tracking-tight sm:text-2xl">
            {inner}
          </h3>
        )
      return (
        <h4 id={id} className="mt-7 scroll-mt-28 text-lg font-bold leading-snug">
          {inner}
        </h4>
      )
    }
    case 'bulletList':
      return <ul className={`${opts.tight ? 'mt-2' : 'mt-5'} list-disc space-y-2 pl-6 marker:text-rh-lime-deep`}>{children(true)}</ul>
    case 'orderedList':
      return (
        <ol start={num(node.attrs?.start)} className={`${opts.tight ? 'mt-2' : 'mt-5'} list-decimal space-y-2 pl-6 marker:font-semibold`}>
          {children(true)}
        </ol>
      )
    case 'listItem':
      return <li className={`pl-1 text-[17px] leading-[1.75] ${body}`}>{children(true)}</li>
    case 'blockquote':
      return (
        <blockquote className="mt-8 border-l-4 border-rh-lime pl-5 text-xl font-medium leading-relaxed [&>p]:text-xl [&>p]:leading-relaxed">
          {children(true)}
        </blockquote>
      )
    case 'horizontalRule':
      return <hr className="my-10 border-rh-ink/10" />
    case 'codeBlock':
      return (
        <pre className="mt-6 overflow-x-auto rounded-2xl bg-rh-ink p-5 text-sm leading-relaxed text-white">
          <code>{nodeText(node)}</code>
        </pre>
      )
    case 'image': {
      const src = str(node.attrs?.src)
      if (!isSafeImageSrc(src)) return null
      return <Figure src={src} alt={str(node.attrs?.alt)} caption={str(node.attrs?.caption)} width={num(node.attrs?.width)} height={num(node.attrs?.height)} />
    }
    case 'gallery': {
      const images = (Array.isArray(node.attrs?.images) ? (node.attrs!.images as Record<string, unknown>[]) : []).filter((img) =>
        isSafeImageSrc(img.src)
      )
      if (images.length === 0) return null
      return (
        <div className={`mt-8 grid gap-3 ${images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {images.map((img, i) => (
            <figure key={i}>
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-rh-ink/5">
                <BlogImage src={str(img.src)} alt={str(img.alt)} fill sizes="(min-width: 640px) 240px, 50vw" className="object-cover" />
              </div>
              {str(img.caption) ? <figcaption className="mt-2 text-center text-[13px] text-rh-ink/60">{str(img.caption)}</figcaption> : null}
            </figure>
          ))}
        </div>
      )
    }
    case 'callout': {
      const kind = (str(node.attrs?.kind) in CALLOUT_KINDS ? str(node.attrs?.kind) : 'note') as CalloutKind
      const style = CALLOUT_KINDS[kind]
      return (
        <aside className={`mt-8 rounded-2xl p-5 sm:p-6 ${style.box}`}>
          <p className={`text-[13px] font-bold uppercase tracking-wide ${style.title}`}>{style.label}</p>
          <div className="mt-2">{children(true, kind === 'takeaways')}</div>
        </aside>
      )
    }
    case 'table':
      return (
        <div className="mt-8 overflow-x-auto rounded-2xl ring-1 ring-rh-ink/10">
          <table className="w-full min-w-[480px] border-collapse bg-white text-left text-[15px]">
            <tbody>{children(true)}</tbody>
          </table>
        </div>
      )
    case 'tableRow':
      return <tr className="border-t border-rh-ink/10 first:border-t-0">{children(true)}</tr>
    case 'tableHeader':
      return (
        <th scope="col" colSpan={num(node.attrs?.colspan)} rowSpan={num(node.attrs?.rowspan)} className="bg-rh-ink/[0.04] px-4 py-3 align-top font-semibold [&_p]:text-[15px] [&_p]:leading-normal">
          {children(true)}
        </th>
      )
    case 'tableCell':
      return (
        <td colSpan={num(node.attrs?.colspan)} rowSpan={num(node.attrs?.rowspan)} className="px-4 py-3 align-top [&_p]:text-[15px] [&_p]:leading-normal">
          {children(true)}
        </td>
      )
    case 'youtube': {
      const id = youtubeId(node.attrs?.src)
      if (!id) return null
      return (
        <div className="mt-8">
          <YouTubeEmbed id={id} title={str(node.attrs?.title)} />
        </div>
      )
    }
    case 'faq': {
      const items = (Array.isArray(node.attrs?.items) ? (node.attrs!.items as Record<string, unknown>[]) : [])
        .map((item) => ({ question: str(item.question).trim(), answer: str(item.answer).trim() }))
        .filter((item) => item.question && item.answer)
      if (items.length === 0) return null
      const title = str(node.attrs?.title).trim() || 'Frequently asked questions'
      return (
        <section className="mt-12">
          <h2 id={opts.makeId(title)} className="scroll-mt-28 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">
            {title}
          </h2>
          <div className="mt-5 divide-y divide-rh-ink/10 overflow-hidden rounded-2xl bg-white ring-1 ring-rh-ink/10">
            {items.map((item, i) => (
              <details key={i} className="group px-5 py-4 sm:px-6" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[17px] font-semibold leading-snug [&::-webkit-details-marker]:hidden">
                  <h3 className="text-[17px] font-semibold">{item.question}</h3>
                  <span aria-hidden className="mt-0.5 text-xl leading-none text-rh-ink/50 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-line text-[16px] leading-[1.7] text-rh-ink/80">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )
    }
    case 'cta': {
      const title = str(node.attrs?.title).trim() || DEFAULT_CTA.title
      const text = str(node.attrs?.text).trim()
      const label = str(node.attrs?.label).trim() || DEFAULT_CTA.label
      const custom = str(node.attrs?.href).trim()
      const href = isSafeHref(custom) ? custom : joyWhatsAppUrl(DEFAULT_CTA.message)
      const className =
        'mt-5 inline-flex h-12 items-center rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep'
      return (
        <aside className="mt-10 rounded-[1.75rem] bg-rh-ink p-7 text-white sm:p-9">
          <p className="text-2xl font-bold leading-tight tracking-tight">{title}</p>
          {text ? <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-white/75">{text}</p> : null}
          {href.startsWith('/') ? (
            <Link href={href} className={className}>
              {label}
            </Link>
          ) : (
            <a href={href} className={className} {...linkProps(href)}>
              {label}
            </a>
          )}
        </aside>
      )
    }
    default:
      return null
  }
}

export function PostBody({ doc }: { doc: BlogNode }) {
  const opts: Options = { makeId: headingIdMaker(), tight: false, dark: false }
  return (
    <div className="[&>*:first-child]:mt-0">
      {(doc.content ?? []).map((node, i) => (
        <Block key={i} node={node} opts={opts} />
      ))}
    </div>
  )
}
