'use client'

/**
 * @mentions in the Learn community (Mary 2026-11-17: "@Tijjani, @Paul"). Typing @ opens a list of
 * people (this conversation's people first, then the group, then anyone on Learn); picking one
 * writes "@Full Name" and remembers who it is, so the server can notify them. Bodies show the
 * tagged names highlighted.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useQuery } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { mentionSearchRef, type MentionPerson } from '@/lib/learnAdminsApi'
import type { Id } from '@/convex/_generated/dataModel'
import { Avatar } from './ui'
import { GroupChip } from './GroupPicker'

export type Mention = { id: Id<'users'>; name: string }

/** The mentions still written in the text (people can delete a name after picking it). */
export function activeMentions(text: string, mentions: Mention[]): Id<'users'>[] {
  const lower = text.toLowerCase()
  return [...new Set(mentions.filter((m) => lower.includes(`@${m.name.toLowerCase()}`)).map((m) => m.id))]
}

/** The "@query" being typed just before the caret, or null. */
function tokenAt(text: string, caret: number) {
  const before = text.slice(0, caret)
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(before)
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null
}

export type MentionTextareaHandle = { focus: () => void; mention: (person: Mention) => void }

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
  mentions: Mention[]
  onMentionsChange: (mentions: Mention[]) => void
  /** Where the people list comes from: a post's thread, or a room when writing a new post. */
  postId?: string
  roomSlug?: string
  /** Grows with its text up to this height (px). */
  autoGrowMax?: number
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { value, onValueChange, mentions, onMentionsChange, postId, roomSlug, autoGrowMax, onKeyDown, className, ...rest },
  ref
) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [token, setToken] = useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = useState(0)
  const people = useQuery(mentionSearchRef, token ? { q: token.query, ...(postId ? { postId } : {}), ...(roomSlug ? { roomSlug } : {}) } : 'skip')
  const list = useMemo(() => (token ? (people ?? []) : []), [people, token])
  const open = Boolean(token) && list.length > 0

  useEffect(() => setActive(0), [token?.query])

  const grow = (el: HTMLTextAreaElement) => {
    if (!autoGrowMax) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, autoGrowMax)}px`
  }

  const write = (next: string, caret: number) => {
    onValueChange(next)
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
      grow(el)
    })
  }

  const pick = (person: Mention, at = token) => {
    const el = area.current
    const caret = el?.selectionStart ?? value.length
    const start = at ? at.start : caret
    const end = at ? caret : caret
    const insert = `@${person.name} `
    const needsSpace = start > 0 && !/\s/.test(value[start - 1] ?? ' ') && !at
    const next = `${value.slice(0, start)}${needsSpace ? ' ' : ''}${insert}${value.slice(end)}`
    if (!mentions.some((m) => m.id === person.id)) onMentionsChange([...mentions, { id: person.id, name: person.name }])
    setToken(null)
    write(next, start + (needsSpace ? 1 : 0) + insert.length)
  }

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    // "Reply" on someone's reply: tag them at the start (or where the caret is)
    mention: (person: Mention) => {
      const el = area.current
      if (!el) return
      const already = value.toLowerCase().includes(`@${person.name.toLowerCase()}`)
      if (already) {
        el.focus()
        return
      }
      if (!mentions.some((m) => m.id === person.id)) onMentionsChange([...mentions, person])
      const lead = value.trim() ? `${value.replace(/\s+$/, '')}\n@${person.name} ` : `@${person.name} `
      write(lead, lead.length)
    },
  }))

  const sync = (el: HTMLTextAreaElement) => setToken(tokenAt(el.value, el.selectionStart ?? el.value.length))

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => (i + 1) % list.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => (i - 1 + list.length) % list.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const person = list[active]
        if (person) pick(person)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setToken(null)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={area}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
          sync(e.target)
          grow(e.target)
        }}
        onKeyDown={handleKey}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) sync(e.currentTarget)
        }}
        onClick={(e) => sync(e.currentTarget)}
        onBlur={() => setTimeout(() => setToken(null), 150)}
        aria-autocomplete="list"
        className={className}
      />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="People to mention"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-full left-0 z-30 mb-2 max-h-72 w-full max-w-sm overflow-y-auto rounded-2xl border border-rh-ink/[0.08] bg-white p-1.5 shadow-[0_18px_48px_-20px_rgba(10,20,18,0.45)]"
          >
            {list.map((p: MentionPerson, i) => (
              <li key={p.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(p)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition', i === active ? 'bg-rh-cream' : 'hover:bg-rh-cream/60')}
                >
                  <Avatar name={p.name} imageUrl={p.imageUrl} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-rh-ink">{p.name}</span>
                    <span className="flex items-center gap-1.5 truncate text-xs text-rh-ink/50">
                      {p.tag}
                      {p.group && <GroupChip group={p.group} className="max-w-[8rem] px-1.5 py-0 text-[10px]" />}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
})

/** A post or reply body with its @mentions highlighted. */
export function MentionText({ text, mentions }: { text: string; mentions?: { id: string; name: string }[] }): ReactNode {
  const names = (mentions ?? []).map((m) => m.name).filter(Boolean)
  if (names.length === 0) return text
  const escaped = [...new Set(names)].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(@(?:${escaped.join('|')}))`, 'gi')
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="rounded-md bg-rh-lime/25 px-1 font-semibold text-rh-ink">
        {part}
      </span>
    ) : (
      part
    )
  )
}
