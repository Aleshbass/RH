'use client'

/**
 * Small pieces shared by the admin Partners, Referrals and finance pages. Builds on
 * components/admin/ui.tsx so every surface has light and dark variants.
 */

import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, Loader2, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNaira, StatusBadge } from '@/components/admin/ui'

export { errorMessage } from '@/components/partners/portal/shared'

/** Money stored in kobo, shown in Naira. */
export function formatKobo(kobo: number | null | undefined) {
  return formatNaira((kobo ?? 0) / 100)
}

export const dialogClass = 'rounded-2xl dark:border-white/10 dark:bg-rh-ink-2'
export const dialogTitleClass = 'flex items-center gap-2 text-lg font-semibold text-rh-night dark:text-white'
export const selectContentClass = 'dark:border-white/10 dark:bg-rh-ink-2'
export const labelClass = 'text-xs font-medium text-neutral-600 dark:text-neutral-300'
export const hintClass = 'text-[11px] text-neutral-500 dark:text-neutral-400'
/** A recessed area inside a card (summaries, quoted text). */
export const insetClass = 'rounded-xl bg-rh-canvas p-3 dark:bg-white/[0.04]'
export const linkClass = 'font-medium text-rh-teal hover:underline dark:text-rh-aqua'
export const textareaClass =
  'w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-rh-night placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-rh-teal/30 dark:border-white/10 dark:bg-rh-ink-3 dark:text-white dark:placeholder:text-neutral-500 dark:focus:ring-rh-aqua/30'

const calloutTones = {
  info: { cls: 'bg-rh-mist text-rh-night dark:bg-rh-aqua/[0.08] dark:text-neutral-200', icon: Info, iconCls: 'text-rh-teal dark:text-rh-aqua' },
  success: { cls: 'bg-rh-mint/70 text-[#065f46] dark:bg-emerald-400/10 dark:text-emerald-200', icon: CheckCircle2, iconCls: 'text-emerald-600 dark:text-emerald-300' },
  warning: { cls: 'bg-rh-peach text-[#8a4b08] dark:bg-amber-400/10 dark:text-amber-200', icon: AlertCircle, iconCls: 'text-amber-600 dark:text-amber-300' },
  danger: { cls: 'bg-rh-blush text-[#9f1239] dark:bg-rose-400/10 dark:text-rose-200', icon: ShieldAlert, iconCls: 'text-rose-600 dark:text-rose-300' },
} as const

export type CalloutTone = keyof typeof calloutTones

/** A tinted note: guidance, warnings and compliance text. */
export function Callout({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: CalloutTone
  title?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const t = calloutTones[tone]
  const Icon = t.icon
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs leading-relaxed', t.cls, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.iconCls)} />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}

export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-32 items-center justify-center', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-rh-teal dark:text-rh-aqua" />
    </div>
  )
}

/** Label / value line used in summaries. */
export function SummaryRow({ label, value, strong, className }: { label: ReactNode; value: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-xs', className)}>
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={cn('tabular-nums text-rh-night dark:text-white', strong ? 'text-sm font-semibold' : 'font-medium')}>{value}</span>
    </div>
  )
}

const PRODUCTION_STATUS: Record<string, { label: string; tone: 'neutral' | 'amber' | 'green' | 'red' }> = {
  not_requested: { label: 'Sandbox only', tone: 'neutral' },
  requested: { label: 'Go-live requested', tone: 'amber' },
  approved: { label: 'Live', tone: 'green' },
  rejected: { label: 'Go-live declined', tone: 'red' },
  suspended: { label: 'Live suspended', tone: 'red' },
}

export function ProductionStatusBadge({ status }: { status?: string }) {
  const style = PRODUCTION_STATUS[status ?? 'not_requested'] ?? PRODUCTION_STATUS.not_requested
  return <StatusBadge tone={style.tone}>{style.label}</StatusBadge>
}

/** Shows a partner's logo, or its initial when there is none. */
export function PartnerAvatar({ name, logo }: { name: string; logo?: ReactNode }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-rh-cream text-base font-semibold text-rh-teal dark:bg-white/[0.06] dark:text-rh-aqua">
      {logo ?? name.charAt(0).toUpperCase()}
    </div>
  )
}
