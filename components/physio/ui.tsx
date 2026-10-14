'use client'

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Building blocks for the physiotherapist dashboard.
 *
 * Visual language: warm cream canvas, white cards with soft teal-tinted shadows and generous
 * rounding, Rehabify teal for primary actions, and small touches of the secondary brand tints
 * (mint, peach, rose, mist) to tell things apart. Brand tokens live in app/globals.css
 * (`bg-rh-teal`, `bg-rh-mint`, …).
 */

export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

/** The one main action on a screen. */
export const primaryButtonClass =
  'rounded-xl bg-rh-teal text-white shadow-sm hover:bg-rh-teal-deep active:scale-[0.98] transition dark:bg-rh-aqua dark:text-rh-night dark:hover:bg-[#5eead4]'

/** Secondary actions next to a primary one. */
export const softButtonClass =
  'rounded-xl border-0 bg-rh-mist text-rh-teal hover:bg-[#d6e8e6] active:scale-[0.98] transition dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]'

export const cardClass =
  'rounded-2xl border border-black/[0.04] bg-white shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none'

/** Page width and vertical rhythm. The shell provides the outer padding. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl space-y-6', className)}>{children}</div>
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-rh-night dark:text-white sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn(cardClass, 'overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-rh-night dark:text-white">{title}</h2>}
            {description && <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  )
}

const toneChip = {
  teal: 'bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua',
  mint: 'bg-rh-mint text-[#047857] dark:bg-emerald-400/10 dark:text-emerald-300',
  peach: 'bg-rh-peach text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300',
  rose: 'bg-rh-blush text-[#be3a5f] dark:bg-rose-400/10 dark:text-rose-300',
  neutral: 'bg-neutral-100 text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300',
} as const

export type Tone = keyof typeof toneChip

/** Small rounded square with an icon, tinted with one of the brand colours. */
export function IconChip({ icon: Icon, tone = 'teal', className }: { icon: ComponentType<{ className?: string }>; tone?: Tone; className?: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', toneChip[tone], className)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  )
}

export function StatTile({
  label,
  value,
  hint,
  href,
  icon,
  tone = 'teal',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  href?: string
  icon?: ComponentType<{ className?: string }>
  tone?: Tone | 'attention' | 'default'
}) {
  const chipTone: Tone = tone === 'attention' ? 'peach' : tone === 'default' ? 'teal' : tone
  const body = (
    <div
      className={cn(
        cardClass,
        'h-full p-4 transition-all sm:p-5',
        href && 'hover:-translate-y-0.5 hover:shadow-lift',
        tone === 'attention' && 'ring-1 ring-amber-300/70 dark:ring-amber-500/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        {icon && <IconChip icon={icon} tone={chipTone} className="h-8 w-8 rounded-lg" />}
      </div>
      <p className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight text-rh-night dark:text-white sm:text-[28px]">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal">
      {body}
    </Link>
  ) : (
    body
  )
}

const badgeTones = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-white/[0.07] dark:text-neutral-300',
  teal: 'bg-rh-mist text-rh-teal dark:bg-rh-aqua/10 dark:text-rh-aqua',
  green: 'bg-rh-mint text-[#047857] dark:bg-emerald-400/10 dark:text-emerald-300',
  amber: 'bg-rh-peach text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300',
  red: 'bg-rh-blush text-[#be123c] dark:bg-rose-400/10 dark:text-rose-300',
} as const

export function StatusBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: keyof typeof badgeTones
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-cream text-rh-teal dark:bg-white/[0.05] dark:text-rh-aqua [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-rh-night dark:text-white">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** A row of a list inside a Panel; pass `href` to make it a link. */
export const listRowClass =
  'flex items-center gap-3 px-5 py-3 transition-colors hover:bg-rh-canvas dark:hover:bg-white/[0.03]'
