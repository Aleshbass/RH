'use client'

import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  EmptyState as PtEmptyState,
  PageHeader,
  Panel as PtPanel,
  StatTile as PtStatTile,
  StatusBadge as PtStatusBadge,
  primaryButtonClass as ptPrimaryButtonClass,
} from '@/components/physio/ui'
import { PageContainer } from '@/components/patient/ui'

/**
 * Building blocks for the clinic portal, on the same design system as the physio and patient
 * portals (components/physio/ui.tsx, colours in app/patient-portal.css): warm canvas, white
 * rounded cards, ink for text and the one main action, Rehabify green for live and money-in
 * moments, soft tints for status. Flat: no teal, no gradients, no glows.
 * Plain-language labels: say what something is ("Unpaid invoices"), not marketing copy.
 */

export {
  accentButtonClass,
  cardClass,
  DetailRow,
  fieldClass,
  IconChip,
  InfoTip,
  listRowClass,
  LoadingBlocks,
  PageContainer,
  PhysioDrawer as ClinicDrawer,
  secondaryButtonClass,
  SectionLabel,
  softButtonClass,
  tabsListClass,
  tabsTriggerClass,
  useIsPhone,
} from '@/components/physio/ui'

export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

/** The one main action on a screen (ink). */
export const primaryButtonClass = ptPrimaryButtonClass

/** A page: title row (with an optional "i"), actions on the right, then the content. */
export function PageShell({
  title,
  description,
  info,
  actions,
  back,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Short explanation behind an "i" next to the title. */
  info?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
  children: ReactNode
  className?: string
}) {
  return (
    <PageContainer className={className}>
      <PageHeader title={title} description={description} info={info} actions={actions} back={back} />
      {children}
    </PageContainer>
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
    <PtPanel
      title={title}
      description={description}
      info={info}
      actions={actions}
      className={className}
      // Lists sit under the title with a little room, like the physio portal's
      bodyClassName={cn((title || actions) && 'pt-2', bodyClassName)}
    >
      {children}
    </PtPanel>
  )
}

export function StatTile({
  label,
  value,
  hint,
  href,
  icon,
  info,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  href?: string
  icon?: ComponentType<{ className?: string }>
  info?: ReactNode
  /** "attention": something waits on the clinic (shown in ink, never amber) */
  tone?: 'default' | 'attention' | 'green' | 'blue' | 'violet' | 'rose'
}) {
  return <PtStatTile label={label} value={value} hint={hint} href={href} icon={icon} info={info} tone={tone} />
}

const BADGE_TONES = {
  neutral: 'neutral',
  // Informational (Referred, Accepted, Editing): blue, as in the physio and patient portals
  teal: 'teal',
  green: 'green',
  amber: 'amber',
  red: 'red',
  blue: 'blue',
  violet: 'violet',
  ink: 'ink',
} as const

export function StatusBadge({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONES
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <PtStatusBadge tone={BADGE_TONES[tone]} dot={dot} className={className}>
      {children}
    </PtStatusBadge>
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
  return <PtEmptyState icon={icon} title={title} description={description} action={action} />
}
