'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ImageIcon,
  Info,
  Layers,
  Lightbulb,
  List,
  ListChecks,
  Minus,
  MousePointerClick,
  PlayCircle,
  Quote,
  Table2,
  Type,
  type IconComponent,
} from './icons'
import { cn } from '@/lib/utils'

/** One entry in the "/" menu. `run` gets the editor with the typed "/query" already removed. */
export type SlashItem = {
  title: string
  hint: string
  keywords: string[]
  icon: IconComponent
  group: 'Text' | 'Media' | 'Blocks'
  run: (editor: Editor) => void
}

type Handlers = { pickImage: () => void; pickGallery: () => void; addVideo: () => void }

export function slashItems(h: Handlers): SlashItem[] {
  const callout = (kind: string, text: string) => (editor: Editor) =>
    editor
      .chain()
      .focus()
      .insertContent({ type: 'callout', attrs: { kind }, content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })
      .run()
  return [
    { group: 'Text', title: 'Text', hint: 'A plain paragraph', keywords: ['paragraph', 'p'], icon: Type, run: (e) => e.chain().focus().setParagraph().run() },
    { group: 'Text', title: 'Heading 2', hint: 'A main section', keywords: ['h2', 'title', 'section'], icon: Type, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
    { group: 'Text', title: 'Heading 3', hint: 'A sub-section', keywords: ['h3', 'subtitle'], icon: Type, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
    { group: 'Text', title: 'Heading 4', hint: 'A small heading', keywords: ['h4'], icon: Type, run: (e) => e.chain().focus().setHeading({ level: 4 }).run() },
    { group: 'Text', title: 'Bullet list', hint: 'A simple list', keywords: ['ul', 'unordered', 'points'], icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
    { group: 'Text', title: 'Numbered list', hint: 'Steps in order', keywords: ['ol', 'ordered', 'steps'], icon: ListChecks, run: (e) => e.chain().focus().toggleOrderedList().run() },
    { group: 'Text', title: 'Quote', hint: 'A quote or a patient story', keywords: ['blockquote', 'testimonial'], icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run() },
    { group: 'Text', title: 'Divider', hint: 'A line between parts', keywords: ['hr', 'line', 'separator'], icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
    { group: 'Media', title: 'Picture', hint: 'Upload or pick from the library', keywords: ['image', 'photo', 'img'], icon: ImageIcon, run: () => h.pickImage() },
    { group: 'Media', title: 'Gallery', hint: 'Two or more pictures in a grid', keywords: ['images', 'photos', 'grid'], icon: Layers, run: () => h.pickGallery() },
    { group: 'Media', title: 'YouTube video', hint: 'Paste a YouTube link', keywords: ['video', 'embed', 'youtube'], icon: PlayCircle, run: () => h.addVideo() },
    {
      group: 'Blocks',
      title: 'Table',
      hint: 'Rows and columns',
      keywords: ['grid', 'compare'],
      icon: Table2,
      run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { group: 'Blocks', title: 'Key takeaways', hint: 'The main points, in a dark box', keywords: ['summary', 'tldr', 'points'], icon: CheckCircle2, run: (e) => e.chain().focus().insertContent({ type: 'callout', attrs: { kind: 'takeaways' }, content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] }).run() },
    { group: 'Blocks', title: 'Good to know', hint: 'A side note', keywords: ['callout', 'note', 'info'], icon: Info, run: callout('note', '') },
    { group: 'Blocks', title: 'Tip', hint: 'A helpful tip', keywords: ['callout', 'hint'], icon: Lightbulb, run: callout('tip', '') },
    { group: 'Blocks', title: 'Take care', hint: 'A warning or safety note', keywords: ['callout', 'warning', 'caution', 'red flag'], icon: AlertTriangle, run: callout('warning', '') },
    { group: 'Blocks', title: 'FAQ', hint: 'Questions and answers (Google FAQ data)', keywords: ['questions', 'accordion', 'faq'], icon: HelpCircle, run: (e) => e.chain().focus().insertContent({ type: 'faq', attrs: { title: '', items: [{ question: '', answer: '' }] } }).run() },
    { group: 'Blocks', title: 'Button', hint: 'Call to action, e.g. book with Joy', keywords: ['cta', 'book', 'link', 'call to action', 'whatsapp'], icon: MousePointerClick, run: (e) => e.chain().focus().insertContent({ type: 'cta', attrs: { title: '', text: '', label: '', href: '' } }).run() },
  ]
}

export function filterItems(items: SlashItem[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => [item.title, item.hint, ...item.keywords].join(' ').toLowerCase().includes(q))
}

type MenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }
type MenuProps = { items: SlashItem[]; command: (item: SlashItem) => void }

const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu({ items, command }, ref) {
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false
      if (event.key === 'ArrowDown') {
        setIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setIndex((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[index]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  useEffect(() => {
    document.querySelector(`[data-slash-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (items.length === 0) {
    return <div className="w-72 rounded-2xl bg-white p-3 text-sm text-neutral-500 shadow-xl ring-1 ring-black/10">No block matches</div>
  }
  let lastGroup = ''
  return (
    <div className="max-h-[360px] w-72 overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-black/10" role="listbox" aria-label="Add a block">
      {items.map((item, i) => {
        const header = item.group !== lastGroup ? item.group : null
        lastGroup = item.group
        const Icon = item.icon
        return (
          <div key={item.title}>
            {header ? <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{header}</p> : null}
            <button
              type="button"
              data-slash-index={i}
              role="option"
              aria-selected={i === index}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                command(item)
              }}
              className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left', i === index ? 'bg-rh-honeydew' : 'hover:bg-black/[0.03]')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/10">
                <Icon className="h-4 w-4 text-rh-ink" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-rh-ink">{item.title}</span>
                <span className="block truncate text-[12px] text-neutral-500">{item.hint}</span>
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
})

export const slashPluginKey = new PluginKey('blogSlash')

/**
 * Type "/" at the start of a line (or after a space) to open the block menu. The list of items
 * comes from `getItems` so the page can wire picture and video pickers into it.
 */
export function createSlashCommand(getItems: () => SlashItem[]) {
  return Extension.create({
    name: 'blogSlash',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: slashPluginKey,
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from)
            // Not inside code, and only where a new block makes sense
            return $from.parent.type.name !== 'codeBlock'
          },
          items: ({ query }) => filterItems(getItems(), query),
          command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
            editor.chain().focus().deleteRange(range).run()
            props.run(editor)
          },
          render: () => {
            let component: ReactRenderer<MenuHandle, MenuProps> | null = null
            let popup: HTMLDivElement | null = null
            const place = (props: SuggestionProps<SlashItem, SlashItem>) => {
              const rect = props.clientRect?.()
              if (!popup || !rect) return
              const below = rect.bottom + 8
              const fitsBelow = below + 360 < window.innerHeight
              popup.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`
              popup.style.top = fitsBelow ? `${below}px` : `${Math.max(8, rect.top - 368)}px`
            }
            return {
              onStart: (props) => {
                component = new ReactRenderer(SlashMenu, { props: { items: props.items, command: props.command }, editor: props.editor })
                popup = document.createElement('div')
                popup.style.position = 'fixed'
                popup.style.zIndex = '60'
                popup.appendChild(component.element)
                document.body.appendChild(popup)
                place(props)
              },
              onUpdate: (props) => {
                component?.updateProps({ items: props.items, command: props.command })
                place(props)
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  popup?.remove()
                  popup = null
                  return true
                }
                return component?.ref?.onKeyDown(props) ?? false
              },
              onExit: () => {
                popup?.remove()
                popup = null
                component?.destroy()
                component = null
              },
            }
          },
        }),
      ]
    },
  })
}
