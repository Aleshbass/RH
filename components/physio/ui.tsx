'use client'

import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { ArrowLeft } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  InfoTip,
  cardClass as ptCardClass,
  primaryButtonClass as ptPrimaryButtonClass,
  softButtonClass as ptSoftButtonClass,
  toneClass,
  type Tone as PtTone,
} from '@/components/patient/ui'

/**
 * Building blocks for the physiotherapist dashboard, on the same design system as the patient
 * portal (components/patient/ui.tsx, colours in app/patient-portal.css): warm off-white canvas,
 * white cards with soft neutral shadows, ink for text and the one main action, Rehabify green
 * only where it moves care forward (join, pay, live), and soft tints to tell things apart.
 * Flat: no teal, no gradients, no glows. The pt-* colours switch on their own in dark mode.
 */

export {
  accentButtonClass,
  DetailRow,
  fieldClass,
  InfoTip,
  LoadingBlocks,
  PageContainer,
  PageSkeleton,
  PatientDrawer as PhysioDrawer,
  secondaryButtonClass,
  SectionLabel,
  tabsListClass,
  tabsTriggerClass,
  useIsPhone,
} from '@/components/patient/ui'

export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

/** The one main action on a screen (ink). */
export const primaryButtonClass = ptPrimaryButtonClass

/** Quiet action next to a primary one. */
export const softButtonClass = ptSoftButtonClass

export const cardClass = ptCardClass

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  info,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  /** Short explanation behind an "i" next to the title. */
  info?: ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <div className="space-y-3">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-pt-muted transition-colors hover:text-pt-ink">
          <ArrowLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{eyebrow}</p>}
          <h1 className="flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight text-pt-ink sm:text-[30px]">
            <span className="min-w-0">{title}</span>
            {info && <InfoTip label="About this page">{info}</InfoTip>}
          </h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-pt-muted sm:text-[15px]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/** A white card with an optional title row. The body has no padding unless you give it some. */
export function Panel({
  title,
  description,
  info,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  info?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn(cardClass, 'overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-pt-ink">
                {title}
                {info && <InfoTip>{info}</InfoTip>}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[13px] text-pt-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  )
}

/** The physio dashboard's tone names, mapped onto the patient portal's tints. */
const TONES = {
  teal: 'neutral',
  mint: 'green',
  peach: 'amber',
  rose: 'rose',
  neutral: 'neutral',
  green: 'green',
  amber: 'amber',
  red: 'rose',
  blue: 'blue',
  violet: 'violet',
  sun: 'sun',
  ink: 'ink',
} as const satisfies Record<string, PtTone>

export type Tone = keyof typeof TONES

/** Small rounded square with an icon in a soft tint. Flat: no glow, no gradient. */
export function IconChip({ icon: Icon, tone = 'teal', className }: { icon: ComponentType<{ className?: string }>; tone?: Tone; className?: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', toneClass(TONES[tone]), className)}>
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
  info,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  href?: string
  icon?: ComponentType<{ className?: string }>
  tone?: Tone | 'attention' | 'default'
  info?: ReactNode
}) {
  const chipTone: Tone = tone === 'attention' ? 'amber' : tone === 'default' ? 'teal' : tone
  const body = (
    <div
      className={cn(
        cardClass,
        'h-full p-4 transition-all sm:p-5',
        href && 'hover:-translate-y-0.5 hover:shadow-pt-lift',
        tone === 'attention' && 'ring-1 ring-inset ring-pt-amber-fg/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1 text-[13px] font-medium text-pt-muted">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </p>
        {icon && <IconChip icon={icon} tone={chipTone} className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" />}
      </div>
      <p className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight text-pt-ink sm:text-[28px]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-pt-muted">{hint}</p>}
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50">
      {body}
    </Link>
  ) : (
    body
  )
}

export function StatusBadge({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: {
  tone?: Tone
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5',
        // Teal badges were informational (Scheduled, Up next, Sent): blue, as in the patient portal
        toneClass(tone === 'teal' ? 'blue' : TONES[tone]),
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
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
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken text-pt-muted [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold text-pt-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-pt-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** A row of a list inside a Panel; pass `href` to make it a link. */
export const listRowClass = 'flex items-center gap-3 px-5 py-3 transition-colors hover:bg-pt-hover sm:px-6'
