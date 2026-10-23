'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { motion } from 'framer-motion'
import { ArrowRight, CornerDownLeft, Search, UserRound } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ADMIN_HOME, visibleAdminNav, type AdminNavItem } from './adminNav'

export const OPEN_ADMIN_PALETTE_EVENT = 'rehabify:admin-palette'

type Result =
  | { kind: 'page'; key: string; title: string; subtitle: string; href: string; icon: AdminNavItem['icon'] }
  | { kind: 'person'; key: string; title: string; subtitle: string; href: string }

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/** Ctrl/⌘ K: jump to any admin page or person. */
export function AdminCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const debounced = useDebounced(term, 200)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_ADMIN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_ADMIN_PALETTE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) setTerm('')
  }, [open])

  const people = useQuery(
    api.adminConsole.searchPeople,
    open && debounced.trim().length >= 2 ? { term: debounced } : 'skip'
  )

  const pages = useMemo<Result[]>(() => {
    const q = term.trim().toLowerCase()
    const all = visibleAdminNav().flatMap((section) =>
      section.items.map((item) => ({ section, item }))
    )
    return all
      .filter(({ section, item }) => {
        if (!q) return true
        const haystack = [item.title, section.label, ...(item.keywords ?? [])].join(' ').toLowerCase()
        return q.split(/\s+/).every((word) => haystack.includes(word))
      })
      .slice(0, q ? 12 : 40)
      .map(({ section, item }) => ({
        kind: 'page' as const,
        key: item.href,
        title: item.title,
        subtitle: section.label,
        href: item.href,
        icon: item.icon,
      }))
  }, [term])

  const results: Result[] = useMemo(() => {
    type Person = { _id: string; name: string; email: string; role: string; rehabifyId?: string }
    const peopleResults: Result[] = ((people ?? []) as Person[]).map((p) => ({
      kind: 'person' as const,
      key: p._id,
      title: p.name,
      subtitle: [p.rehabifyId, p.email, p.role.replace(/_/g, ' ')].filter(Boolean).join(' · '),
      href: `${ADMIN_HOME}/users/${p._id}`,
    }))
    return [...pages, ...peopleResults]
  }, [pages, people])

  useEffect(() => setIndex(0), [term])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const go = (result?: Result) => {
    if (!result) return
    setOpen(false)
    router.push(result.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[index])
    }
  }

  const firstPerson = results.findIndex((r) => r.kind === 'person')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-2xl border-black/5 p-0 dark:border-white/10 dark:bg-rh-ink-2 [&>button]:hidden">
        <DialogTitle className="sr-only">Search the admin console</DialogTitle>
        <div className="flex items-center gap-3 border-b border-black/5 px-4 dark:border-white/10">
          <Search className="h-4 w-4 shrink-0 text-neutral-400" />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, or search people by name, email or ID…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-neutral-400 dark:text-white"
          />
          <kbd className="hidden rounded-md border border-black/10 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:border-white/15 sm:block">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-neutral-500">
              {term.trim().length >= 2 && people === undefined ? 'Searching…' : 'Nothing matches that.'}
            </p>
          )}
          {results.map((result, i) => {
            const Icon = result.kind === 'page' ? result.icon : UserRound
            const selected = i === index
            return (
              <div key={`${result.kind}-${result.key}`}>
                {(i === 0 && result.kind === 'page') || i === firstPerson ? (
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    {result.kind === 'page' ? 'Pages' : 'People'}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => go(result)}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm',
                    selected ? 'text-rh-night dark:text-white' : 'text-neutral-600 dark:text-neutral-300'
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId="admin-palette-highlight"
                      transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                      className="absolute inset-0 rounded-xl bg-rh-mist dark:bg-white/[0.07]"
                    />
                  )}
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-rh-teal shadow-sm dark:bg-rh-ink-3 dark:text-rh-aqua">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate font-medium">{result.title}</span>
                    <span className="block truncate text-xs text-neutral-500">{result.subtitle}</span>
                  </span>
                  {selected && <ArrowRight className="relative h-4 w-4 text-neutral-400" />}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-black/5 px-4 py-2 text-[11px] text-neutral-500 dark:border-white/10">
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
          <span>↑ ↓ move</span>
          <span className="ml-auto">Ctrl / ⌘ K</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
