'use client'

import './editor.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { TableKit } from '@tiptap/extension-table'
import Youtube from '@tiptap/extension-youtube'
import { TextSelection } from '@tiptap/pm/state'
import { toast } from 'sonner'
import { parseBody, youtubeId } from '@/lib/blog/content'
import { cn } from '@/lib/utils'
import { useBlogEditorTools } from './context'
import { CalloutBlock, CtaBlock, FaqBlock, GalleryBlock, ImageBlock } from './nodes'
import { createSlashCommand, slashItems, type SlashItem } from './slash'
import {
  Bold,
  BulletList,
  GripVertical,
  ImageIcon,
  Italic,
  Lightbulb,
  Link as LinkIcon,
  NumberedList,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  Unlink,
} from './icons'

type Props = {
  /** Saved Tiptap JSON; read once when the editor starts (use setContent to replace it) */
  initialBody: string
  readOnly: boolean
  /** Every change; read the content with editor.getJSON() when saving */
  onChange: (editor: Editor) => void
  onReady?: (editor: Editor) => void
  /** Pictures pasted or dropped into the text: upload them and return what to insert */
  onFiles: (files: File[]) => Promise<{ url: string; alt: string; width?: number; height?: number }[]>
  /** "Rewrite with AI" on selected text (opens the AI panel) */
  onRewrite?: (text: string) => void
}

const IDLE_TOOLBAR = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  h2: false,
  h3: false,
  bullet: false,
  ordered: false,
  quote: false,
  link: false,
  canUndo: false,
  canRedo: false,
}

const imageFiles = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

function ToolButton({ active, disabled, label, onClick, children }: { active?: boolean; disabled?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
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
        'flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-[13px] font-semibold transition-colors disabled:opacity-35',
        active ? 'bg-rh-ink text-white' : 'text-rh-ink hover:bg-black/[0.06]'
      )}
    >
      {children}
    </button>
  )
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px bg-black/10" />

function LinkEditor({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = String(editor.getAttributes('link').href ?? '')
  const [value, setValue] = useState(current)
  const apply = () => {
    const href = value.trim()
    if (!href) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const withScheme = /^(https?:|mailto:|tel:|\/|#)/i.test(href) ? href : `https://${href}`
      editor.chain().focus().extendMarkRange('link').setLink({ href: withScheme }).run()
    }
    onDone()
  }
  return (
    <div className="flex items-center gap-1 p-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            apply()
          }
          if (e.key === 'Escape') onDone()
        }}
        placeholder="Paste a link, or /pricing for our own pages"
        className="h-8 w-72 rounded-lg bg-black/[0.04] px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-rh-lime/40"
      />
      <button type="button" onClick={apply} className="h-8 rounded-lg bg-rh-lime px-3 text-[12px] font-semibold text-rh-ink hover:bg-rh-lime-deep">
        Save
      </button>
      {current ? (
        <ToolButton label="Remove link" onClick={() => (editor.chain().focus().extendMarkRange('link').unsetLink().run(), onDone())}>
          <Unlink className="h-3.5 w-3.5" />
        </ToolButton>
      ) : null}
    </div>
  )
}

export function BlogEditor({ initialBody, readOnly, onChange, onReady, onFiles, onRewrite }: Props) {
  const tools = useBlogEditorTools()
  const [linkOpen, setLinkOpen] = useState(false)

  // Kept in refs so the editor (created once) always calls the latest version
  const onChangeRef = useRef(onChange)
  const onFilesRef = useRef(onFiles)
  const itemsRef = useRef<SlashItem[]>([])
  const editorRef = useRef<Editor | null>(null)
  onChangeRef.current = onChange
  onFilesRef.current = onFiles

  const insertImages = async (files: File[], at?: number) => {
    const editor = editorRef.current
    if (!editor || files.length === 0) return
    const toastId = toast.loading(files.length === 1 ? 'Uploading the picture…' : `Uploading ${files.length} pictures…`)
    try {
      const uploaded = await onFilesRef.current(files)
      const nodes = uploaded.map((img) => ({ type: 'image', attrs: { src: img.url, alt: img.alt, width: img.width ?? null, height: img.height ?? null } }))
      const chain = editor.chain().focus()
      if (typeof at === 'number') chain.insertContentAt(at, nodes).run()
      else chain.insertContent(nodes).run()
      toast.success('Added. Now describe the picture in its alt text box.', { id: toastId })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upload failed.', { id: toastId })
    }
  }

  itemsRef.current = slashItems({
    pickImage: async () => {
      const [img] = await tools.pickImages({ multiple: false })
      if (img) editorRef.current?.chain().focus().insertContent({ type: 'image', attrs: { src: img.url, alt: img.alt, width: img.width ?? null, height: img.height ?? null } }).run()
    },
    pickGallery: async () => {
      const picked = await tools.pickImages({ multiple: true, title: 'Pictures for the gallery' })
      if (picked.length)
        editorRef.current
          ?.chain()
          .focus()
          .insertContent({ type: 'gallery', attrs: { images: picked.map((p) => ({ src: p.url, alt: p.alt, width: p.width, height: p.height })) } })
          .run()
    },
    addVideo: () => {
      const link = window.prompt('Paste the YouTube link')
      if (!link) return
      if (!youtubeId(link)) {
        toast.error("That doesn't look like a YouTube link.")
        return
      }
      editorRef.current?.chain().focus().setYoutubeVideo({ src: link }).run()
    },
  })

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: null, target: null } },
        dropcursor: { color: '#00cd0f', width: 3 },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : "Write, or type '/' to add a picture, list, FAQ…"),
      }),
      TableKit.configure({ table: { resizable: false } }),
      Youtube.configure({ nocookie: true, modestBranding: true, controls: true }),
      ImageBlock,
      GalleryBlock,
      CalloutBlock,
      FaqBlock,
      CtaBlock,
      createSlashCommand(() => itemsRef.current),
    ],
    []
  )

  const editor = useEditor({
    extensions,
    content: parseBody(initialBody),
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'blog-editor', spellcheck: 'true', 'aria-label': 'Post text' },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files)
        if (files.length === 0) return false
        event.preventDefault()
        void insertImages(files)
        return true
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false
        const files = imageFiles(event.dataTransfer?.files)
        if (files.length === 0) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        void insertImages(files, pos)
        return true
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor),
    onCreate: ({ editor }) => onReady?.(editor),
  })
  editorRef.current = editor

  useEffect(() => {
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly)
  }, [editor, readOnly])

  const selected = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            strike: e.isActive('strike'),
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

  // useEditorState only reports the editor after its first change, so it is null until the
  // writer types. Never wait for it to show the text (that left the body as a grey box no one
  // could type in); the toolbar just starts with nothing active.
  const state = selected ?? IDLE_TOOLBAR

  if (!editor) {
    return <div className="min-h-[360px] animate-pulse rounded-2xl bg-black/[0.03]" />
  }

  const chain = () => editor.chain().focus()

  return (
    <div className="relative">
      {!readOnly ? (
        <div className="sticky top-16 z-20 -mx-2 mb-6 flex flex-wrap items-center gap-0.5 rounded-xl bg-white/90 p-1 shadow-soft ring-1 ring-black/[0.06] backdrop-blur">
          <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
            <Undo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
            <Redo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <Divider />
          <ToolButton label="Heading 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
            H2
          </ToolButton>
          <ToolButton label="Heading 3" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
            H3
          </ToolButton>
          <Divider />
          <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
            <Bold className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Link"
            active={state.link}
            onClick={() => (editor.state.selection.empty && !state.link ? toast.message('Select the words you want to link first.') : setLinkOpen(true))}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <Divider />
          <ToolButton label="Bullet list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
            <BulletList className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
            <NumberedList className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
            <Quote className="h-3.5 w-3.5" />
          </ToolButton>
          <Divider />
          <ToolButton label="Picture" onClick={() => itemsRef.current.find((i) => i.title === 'Picture')?.run(editor)}>
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <Table2 className="h-3.5 w-3.5" />
          </ToolButton>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().insertContent(editor.state.selection.$from.parent.textContent ? ' /' : '/').run()}
            className="ml-auto h-8 rounded-lg bg-rh-honeydew px-3 text-[12px] font-semibold text-rh-ink hover:bg-[#e2f7d8]"
          >
            + Add block <span className="ml-1 rounded bg-white px-1 text-[11px] text-neutral-500">/</span>
          </button>
        </div>
      ) : null}

      {!readOnly ? (
        <DragHandle editor={editor}>
          <div className="blog-drag-handle" title="Drag to move. Click to select.">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        </DragHandle>
      ) : null}

      {!readOnly ? (
        <BubbleMenu
          editor={editor}
          shouldShow={({ editor: e, state: s }) => e.isEditable && !s.selection.empty && s.selection instanceof TextSelection}
          className="flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-xl ring-1 ring-black/10"
        >
          {linkOpen ? (
            <LinkEditor editor={editor} onDone={() => setLinkOpen(false)} />
          ) : (
            <>
              <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
                <Bold className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
                <Italic className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
                <Underline className="h-3.5 w-3.5" />
              </ToolButton>
              <ToolButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
                <Strikethrough className="h-3.5 w-3.5" />
              </ToolButton>
              <Divider />
              <ToolButton label="Heading 2" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
                H2
              </ToolButton>
              <ToolButton label="Heading 3" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
                H3
              </ToolButton>
              <ToolButton label="Link" active={state.link} onClick={() => setLinkOpen(true)}>
                <LinkIcon className="h-3.5 w-3.5" />
              </ToolButton>
              {onRewrite ? (
                <>
                  <Divider />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const { from, to } = editor.state.selection
                      onRewrite(editor.state.doc.textBetween(from, to, '\n\n'))
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold text-rh-ink hover:bg-rh-honeydew"
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> Rewrite
                  </button>
                </>
              ) : null}
            </>
          )}
        </BubbleMenu>
      ) : null}

      {linkOpen && editor.state.selection.empty ? (
        <div className="fixed inset-x-0 top-24 z-50 mx-auto w-fit rounded-xl bg-white shadow-xl ring-1 ring-black/10">
          <LinkEditor editor={editor} onDone={() => setLinkOpen(false)} />
        </div>
      ) : null}

      <EditorContent editor={editor} className="pl-1" />
    </div>
  )
}
