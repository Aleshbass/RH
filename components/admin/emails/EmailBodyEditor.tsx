'use client'

import './email-editor.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { toast } from 'sonner'
import {
  Bold,
  BulletList,
  Italic,
  Link as LinkIcon,
  Minus,
  NumberedList,
  Quote,
  Redo2,
  Underline,
  Undo2,
  Unlink,
} from '@/components/admin/blog/editor/icons'
import { isRichBody, parseRichBody, plainTextToDoc } from '@/lib/email/richText'
import { cn } from '@/lib/utils'

/**
 * The campaign message editor. Only formatting that every email app shows well: bold, italic,
 * underline, links, a heading and a subheading, lists, a quote and a divider. Saves Tiptap JSON,
 * which lib/email/richText.ts turns into the email's HTML (and the preview beside it).
 */

const IDLE = {
  bold: false,
  italic: false,
  underline: false,
  h2: false,
  h3: false,
  bullet: false,
  ordered: false,
  quote: false,
  link: false,
  canUndo: false,
  canRedo: false,
}

function startingContent(value: string) {
  if (isRichBody(value)) return parseRichBody(value) ?? plainTextToDoc('')
  return plainTextToDoc(value)
}

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-[12px] font-semibold transition-colors disabled:opacity-35',
        active ? 'bg-rh-ink text-white dark:bg-rh-lime dark:text-rh-ink' : 'text-rh-ink hover:bg-black/[0.06] dark:text-white dark:hover:bg-white/10'
      )}
    >
      {children}
    </button>
  )
}

const Sep = () => <span aria-hidden className="mx-0.5 h-5 w-px bg-black/10 dark:bg-white/15" />

export function EmailBodyEditor({ value, onChange, id }: { value: string; onChange: (json: string) => void; id?: string }) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['mailto', 'tel'] },
      }),
      Placeholder.configure({ placeholder: 'Write your message. Each email already starts with "Hello" and the person\'s first name.' }),
    ],
    []
  )

  // Created once: the value is only read at the start (the composer remounts this after a send)
  const [initial] = useState(() => startingContent(value))
  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'email-editor min-h-[220px] px-4 py-3 text-[15px] leading-relaxed text-rh-ink outline-none dark:text-white',
        ...(id ? { id } : {}),
        'aria-label': 'Message',
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(JSON.stringify(e.getJSON())),
  })

  // Store JSON from the start, so a plain-text value (older campaign) is saved in the new format
  useEffect(() => {
    if (editor && !isRichBody(value)) onChangeRef.current(JSON.stringify(editor.getJSON()))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the editor appears
  }, [editor])

  // Null until the editor's first change: never wait on it to show the text box
  const selected = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            link: e.isActive('link'),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  })
  const s = selected ?? IDLE

  const openLink = (e: Editor) => {
    if (e.state.selection.empty && !e.isActive('link')) {
      toast.message('Select the words you want to link first.')
      return
    }
    setLinkValue(String(e.getAttributes('link').href ?? ''))
    setLinkOpen(true)
  }

  const applyLink = (e: Editor) => {
    const raw = linkValue.trim()
    if (!raw) e.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const href = /^(https?:|mailto:|tel:)/i.test(raw) ? raw : raw.includes('@') && !raw.includes('/') ? `mailto:${raw}` : `https://${raw}`
      e.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setLinkOpen(false)
  }

  if (!editor) return <div className="min-h-[268px] animate-pulse rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10" />
  const chain = () => editor.chain().focus()

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white focus-within:ring-2 focus-within:ring-rh-lime/40 dark:border-white/10 dark:bg-rh-ink-3">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-black/[0.06] bg-rh-canvas/60 px-1.5 py-1 dark:border-white/10 dark:bg-white/[0.03]">
        <Tool label="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Underline" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Link" active={s.link} onClick={() => openLink(editor)}>
          <LinkIcon className="h-3.5 w-3.5" />
        </Tool>
        <Sep />
        <Tool label="Heading" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          H1
        </Tool>
        <Tool label="Subheading" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          H2
        </Tool>
        <Sep />
        <Tool label="Bullet list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <BulletList className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <NumberedList className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </Tool>
        <Tool label="Divider" onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </Tool>
        <span className="ml-auto flex">
          <Tool label="Undo" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
            <Undo2 className="h-3.5 w-3.5" />
          </Tool>
          <Tool label="Redo" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
            <Redo2 className="h-3.5 w-3.5" />
          </Tool>
        </span>
      </div>

      {linkOpen ? (
        <div className="flex items-center gap-1.5 border-b border-black/[0.06] px-2 py-1.5 dark:border-white/10">
          <input
            autoFocus
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink(editor)
              }
              if (e.key === 'Escape') setLinkOpen(false)
            }}
            placeholder="https://physioaroundme.com/… or an email address"
            className="h-8 min-w-0 flex-1 rounded-lg bg-black/[0.04] px-2.5 text-[13px] outline-none dark:bg-white/10 dark:text-white"
          />
          <button type="button" onClick={() => applyLink(editor)} className="h-8 rounded-lg bg-rh-lime px-3 text-[12px] font-semibold text-rh-ink hover:bg-rh-lime-deep">
            Save
          </button>
          {s.link ? (
            <Tool label="Remove link" onClick={() => (editor.chain().focus().extendMarkRange('link').unsetLink().run(), setLinkOpen(false))}>
              <Unlink className="h-3.5 w-3.5" />
            </Tool>
          ) : null}
          <button type="button" onClick={() => setLinkOpen(false)} className="h-8 rounded-lg px-2 text-[12px] text-neutral-500">
            Cancel
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  )
}
