'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A row of pill choices; the selected one is ink. Tapping the selected pill again clears it when `clearable`. */
export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  clearable = false,
}: {
  options: { value: T; label: string; title?: string }[]
  value: T | null | undefined
  onChange: (value: T | null) => void
  label: string
  size?: 'sm' | 'md'
  clearable?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(selected && clearable ? null : option.value)}
            className={cn(
              'rounded-full border transition active:scale-95',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              selected ? 'border-pt-primary bg-pt-primary text-pt-on-primary' : 'border-pt-line-strong text-pt-ink hover:bg-pt-hover'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** A small outlined chip that does something (insert a prompt, open a section). */
export function ChipButton({ children, onClick, className }: { children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-dashed border-pt-line-strong px-2.5 py-1 text-xs text-pt-muted transition hover:border-pt-ink/40 hover:text-pt-ink active:scale-95',
        className
      )}
    >
      {children}
    </button>
  )
}

/** One part of the note (S, O, A, T or P), with its letter. */
export function NoteSection({
  letter,
  title,
  hint,
  actions,
  children,
}: {
  letter: string
  title: string
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-t border-pt-line pt-5 first:border-t-0 first:pt-0" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-pt-primary text-xs font-bold text-pt-on-primary" aria-hidden>
          {letter}
        </span>
        <h3 className="text-sm font-semibold text-pt-ink">{title}</h3>
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>
      {hint && <p className="mt-1 text-xs text-pt-muted">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

/** A small label above a field inside a measure form. */
export function MiniLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-pt-muted">
      {children}
    </label>
  )
}
