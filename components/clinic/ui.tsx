'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for the clinic dashboard.
 *
 * Visual rules (keep every clinic page consistent):
 * - Neutral surfaces, 1px borders, rounded-xl panels. No gradients, glows or coloured shadows.
 * - One accent colour (Rehabify green #00cd0f, with ink text), used for the primary
 *   action and the active state only.
 * - Status is shown with small quiet badges, never colour-filled cards.
 * - Plain-language labels: say what something is ("Unpaid invoices"), not marketing copy.
 */

export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

export function PageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    // Extra bottom room so the last card clears mobile browser bars and the home indicator
    <div
      className={cn(
        'mx-auto w-full max-w-6xl px-4 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-16',
        className
      )}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="space-y-6">{children}</div>
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
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900',
        className
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h2>}
            {description && <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  href?: string
  tone?: 'default' | 'attention'
}) {
  const body = (
    <div
      className={cn(
        'h-full rounded-xl border bg-white p-4 transition-colors dark:bg-neutral-900',
        tone === 'attention'
          ? 'border-amber-300 dark:border-amber-700/60'
          : 'border-neutral-200 dark:border-neutral-800',
        href && 'hover:border-neutral-300 dark:hover:border-neutral-700'
      )}
    >
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
  )
  return href ? (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime rounded-xl">
      {body}
    </Link>
  ) : (
    body
  )
}

const badgeTones = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  teal: 'bg-rh-lime/10 text-rh-ink dark:bg-white/[0.06] dark:text-rh-lime',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
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
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
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
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-neutral-300 dark:text-neutral-600">{icon}</div>}
      <p className="text-sm font-medium text-neutral-900 dark:text-white">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Primary button styling for the one main action on a screen. */
export const primaryButtonClass =
  'bg-rh-lime text-rh-ink hover:bg-rh-lime-deep dark:bg-rh-lime dark:text-neutral-950 dark:hover:bg-rh-lime-deep'
