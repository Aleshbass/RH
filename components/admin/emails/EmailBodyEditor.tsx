'use client'

import './email-editor.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { toast } from 'sonner'
import { ImageIcon, Loader2, Upload } from '@/components/icons'
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
import { EmailImage } from './emailImageNode'
import { EMAIL_IMAGE_ACCEPT, uploadErrorText, useEmailImageUpload } from './useEmailImageUpload'

/**
 * The campaign message editor. Only formatting that every email app shows well: bold, italic,
 * underline, links, a heading and a subheading, lists, a quote, a divider and full-width pictures
 * (uploaded or linked, each optionally opening a link). Saves Tiptap JSON, which
 * lib/email/richText.ts turns into the email's HTML (and the preview beside it).
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
  image: false,
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

const panelInput = 'h-8 min-w-0 flex-1 rounded-lg bg-black/[0.04] px-2.5 text-[13px] outline-none dark:bg-white/10 dark:text-white'
const panelLabel = 'w-[92px] shrink-0 text-[12px] text-neutral-500 dark:text-neutral-400'
const withProtocol = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)

type PictureDraft = { src: string; href: string; alt: string }

export function EmailBodyEditor({ value, onChange, id }: { value: string; onChange: (json: string) => void; id?: string }) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  // The picture panel: null when closed; editing an existing picture when one is selected
  const [picture, setPicture] = useState<(PictureDraft & { editing: boolean }) | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadImage = useEmailImageUpload()

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['mailto', 'tel'] },
      }),
      Placeholder.configure({ placeholder: 'Write your message. Each email already starts with "Hello" and the person\'s first name.' }),
      EmailImage,
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
            image: e.isActive('image'),
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

  const openPicture = (e: Editor) => {
    setLinkOpen(false)
    if (e.isActive('image')) {
      const attrs = e.getAttributes('image')
      setPicture({ src: String(attrs.src ?? ''), href: String(attrs.href ?? ''), alt: String(attrs.alt ?? ''), editing: true })
    } else {
      setPicture({ src: '', href: '', alt: '', editing: false })
    }
  }

  const uploadPicture = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setPicture((p) => (p ? { ...p, src: url } : p))
    } catch (error) {
      toast.error(uploadErrorText(error))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const savePicture = (e: Editor) => {
    if (!picture) return
    const src = picture.src.trim()
    if (!/^https:\/\/\S+$/i.test(src)) {
      toast.message('Upload a picture, or paste a link that starts with https://')
      return
    }
    const href = picture.href.trim() ? withProtocol(picture.href.trim()) : null
    const attrs = { src, href, alt: picture.alt.trim() }
    if (picture.editing && e.isActive('image')) e.chain().focus().updateAttributes('image', attrs).run()
    else e.chain().focus().insertContent({ type: 'image', attrs }).run()
    setPicture(null)
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
        <Tool label={s.image ? 'Edit picture' : 'Add a picture'} active={s.image || Boolean(picture)} onClick={() => openPicture(editor)}>
          <ImageIcon className="h-3.5 w-3.5" />
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

      {picture ? (
        <div className="space-y-1.5 border-b border-black/[0.06] px-2 py-2 dark:border-white/10">
          <div className="flex items-center gap-1.5">
            <span className={panelLabel}>Picture</span>
            <input
              autoFocus={!picture.editing}
              value={picture.src}
              onChange={(e) => setPicture({ ...picture, src: e.target.value })}
              placeholder="Upload one, or paste a link: https://…"
              className={panelInput}
            />
            <input ref={fileInput} type="file" accept={EMAIL_IMAGE_ACCEPT} className="hidden" onChange={(e) => uploadPicture(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-black/[0.06] px-2.5 text-[12px] font-semibold text-rh-ink hover:bg-black/[0.1] disabled:opacity-50 dark:bg-white/10 dark:text-white"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={panelLabel}>Opens <span className="text-neutral-400">(optional)</span></span>
            <input
              value={picture.href}
              onChange={(e) => setPicture({ ...picture, href: e.target.value })}
              placeholder="https://physioaroundme.com/… when someone clicks it"
              className={panelInput}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className={panelLabel}>Describe it <span className="text-neutral-400">(optional)</span></span>
            <input
              value={picture.alt}
              onChange={(e) => setPicture({ ...picture, alt: e.target.value })}
              placeholder="Shown if the picture doesn't load, e.g. Physio helping a patient stretch"
              maxLength={200}
              className={panelInput}
            />
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <p className="mr-auto text-[11px] text-neutral-500">PNG, JPG or GIF, up to 5 MB. It fills the width of the email.</p>
            {picture.editing ? (
              <button
                type="button"
                onClick={() => (editor.chain().focus().deleteSelection().run(), setPicture(null))}
                className="h-8 rounded-lg px-2 text-[12px] font-semibold text-rh-danger-ink"
              >
                Remove picture
              </button>
            ) : null}
            <button type="button" onClick={() => setPicture(null)} className="h-8 rounded-lg px-2 text-[12px] text-neutral-500">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => savePicture(editor)}
              disabled={uploading}
              className="h-8 rounded-lg bg-rh-lime px-3 text-[12px] font-semibold text-rh-ink hover:bg-rh-lime-deep disabled:opacity-50"
            >
              {picture.editing ? 'Save' : 'Add picture'}
            </button>
          </div>
        </div>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  )
}
