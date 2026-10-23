'use client'

/**
 * Building blocks for admin console pages. Same visual language as the physiotherapist
 * dashboard (components/physio/ui.tsx): cream canvas, white cards, brand teal, with
 * dark-mode variants on every surface. Use these instead of raw shadcn Card/zinc styles
 * so every admin page looks and behaves the same.
 */

import { useId, useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Loader2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { playSound } from '@/lib/sounds'

export {
  cardClass,
  EmptyState,
  formatNaira,
  IconChip,
  listRowClass,
  Panel,
  PageHeader,
  primaryButtonClass,
  softButtonClass,
  StatTile,
  StatusBadge,
  type Tone,
} from '@/components/physio/ui'

/** Admin pages are data-heavy, so they get a wider column than the physio portal. */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-7xl space-y-6', className)}>{children}</div>
}

/** Outline/danger button styles that pair with primaryButtonClass and softButtonClass. */
export const dangerButtonClass =
  'rounded-xl bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] transition dark:bg-rose-500 dark:hover:bg-rose-400'

export const inputClass =
  'rounded-xl border-black/10 bg-white dark:border-white/10 dark:bg-rh-ink-3 dark:text-white dark:placeholder:text-neutral-500'

/** Table look shared by admin lists. Apply to shadcn <Table> wrappers. */
export const tableWrapClass = 'overflow-x-auto [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-neutral-500 dark:[&_th]:text-neutral-400 [&_tr]:border-black/[0.05] dark:[&_tr]:border-white/[0.06] [&_tbody_tr:hover]:bg-rh-canvas dark:[&_tbody_tr:hover]:bg-white/[0.03]'

/** Horizontal, scrollable tab strip (never squashes on phones). Pass to shadcn <TabsList>. */
export const tabsListClass =
  'h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-soft dark:bg-rh-ink-2 [&>button]:shrink-0 [&>button]:rounded-lg [&>button]:px-3 [&>button]:py-1.5 [&>button[data-state=active]]:bg-rh-teal [&>button[data-state=active]]:text-white dark:[&>button[data-state=active]]:bg-rh-aqua dark:[&>button[data-state=active]]:text-rh-night'

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
const child: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}

/** Staggered fade-up for a grid of stat tiles or cards. Children should be <StaggerItem>. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div className={className} variants={container} initial={reduce ? false : 'hidden'} animate="show">
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={child}>
      {children}
    </motion.div>
  )
}

/** A clickable or static row of filter chips. */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
}) {
  // Per-instance id, so two chip rows on one page each keep their own sliding pill
  const pillId = `admin-filter-chip-${useId()}`
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-full px-3 py-1 text-xs font-medium transition-colors',
              active ? 'text-white dark:text-rh-night' : 'bg-white text-neutral-600 shadow-soft hover:text-rh-night dark:bg-rh-ink-2 dark:text-neutral-300 dark:hover:text-white'
            )}
          >
            {active && (
              <motion.span layoutId={pillId} className="absolute inset-0 rounded-full bg-rh-teal dark:bg-rh-aqua" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            <span className="relative">
              {o.label}
              {o.count !== undefined && <span className="ml-1 tabular-nums opacity-70">{o.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Confirmation dialog for destructive or important actions. Replaces window.confirm().
 * `onConfirm` may be async; the dialog shows a spinner and stays open until it settles.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="rounded-2xl dark:border-white/10 dark:bg-rh-ink-2">
        <AlertDialogHeader>
          <AlertDialogTitle className="dark:text-white">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="rounded-xl dark:border-white/10 dark:bg-transparent dark:text-white">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={destructive ? dangerButtonClass : 'rounded-xl bg-rh-teal text-white hover:bg-rh-teal-deep dark:bg-rh-aqua dark:text-rh-night'}
            onClick={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } catch {
                playSound('error')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Download rows as a CSV file. Values are quoted and escaped. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** A link card used for "jump to" sections on the home page and section landing pages. */
export function QuickLink({
  href,
  icon: Icon,
  title,
  description,
  count,
}: {
  href: string
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  count?: number
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-black/[0.04] bg-white p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none dark:hover:bg-rh-ink-3"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-rh-night dark:text-white">{title}</span>
        {description && <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{description}</span>}
      </span>
      {count ? (
        <span className="rounded-full bg-rh-amber px-2 py-0.5 text-xs font-semibold tabular-nums text-rh-night">{count}</span>
      ) : null}
    </Link>
  )
}
