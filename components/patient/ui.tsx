'use client'

import Link from 'next/link'
import { useEffect, useState, type ComponentPropsWithoutRef, type ComponentType, type ReactNode } from 'react'
import { ArrowLeft, Info } from '@/components/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Building blocks for the patient portal.
 *
 * Visual language: warm off-white canvas, white cards with soft neutral shadows, ink for text
 * and the main action, Rehabify lime as the accent, and soft tints to tell things apart.
 * Colours come from app/patient-portal.css (`bg-pt-surface`, `text-pt-ink`, ...) and switch
 * on their own in dark mode. No teal, no gradients, no glowing icons.
 */

export function formatNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`
}

export function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** True below the `md` breakpoint. Drawers slide up from the bottom there. */
export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setIsPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isPhone
}

/* ----------------------------------------------------------------------------------------------
 * Buttons. Use with <Button className={primaryButtonClass}> from components/ui/button.
 * --------------------------------------------------------------------------------------------*/

/** The one main action on a screen. */
export const primaryButtonClass =
  'rounded-xl bg-pt-primary text-pt-on-primary shadow-none hover:bg-pt-primary-hover active:scale-[0.98] transition disabled:opacity-50'

/** Lime: joining a call, paying. Things that move care forward right now. */
export const accentButtonClass =
  'rounded-xl bg-pt-accent text-[#06210a] font-semibold shadow-none hover:bg-[#00b80e] active:scale-[0.98] transition disabled:opacity-50'

/** Outlined, for actions next to a primary one. */
export const secondaryButtonClass =
  'rounded-xl border border-pt-line-strong bg-pt-surface text-pt-ink shadow-none hover:bg-pt-hover active:scale-[0.98] transition'

/** Quiet filled button. */
export const softButtonClass =
  'rounded-xl border-0 bg-pt-sunken text-pt-ink shadow-none hover:bg-pt-hover active:scale-[0.98] transition'

export const dangerButtonClass =
  'rounded-xl border-0 bg-pt-rose-bg text-pt-rose-fg shadow-none hover:brightness-95 active:scale-[0.98] transition'

/** Text inputs, selects and textareas. */
export const fieldClass =
  'rounded-xl border-pt-line-strong bg-pt-surface text-pt-ink placeholder:text-pt-faint focus-visible:ring-2 focus-visible:ring-pt-accent/40'

export const cardClass =
  'rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none'

/** A row inside a card: wrap a Link or button with it. */
export const listRowClass =
  'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-pt-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50'

/** For shadcn <TabsList> / <TabsTrigger>. */
export const tabsListClass =
  'inline-flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-pt-sunken p-1 sm:w-auto'
export const tabsTriggerClass =
  'rounded-xl px-3.5 py-2 text-sm font-medium text-pt-muted shadow-none transition data-[state=active]:bg-pt-surface data-[state=active]:text-pt-ink data-[state=active]:shadow-pt dark:data-[state=active]:shadow-none'

/* ----------------------------------------------------------------------------------------------
 * Colour tones
 * --------------------------------------------------------------------------------------------*/

const toneClasses = {
  green: 'bg-pt-green-bg text-pt-green-fg',
  amber: 'bg-pt-amber-bg text-pt-amber-fg',
  rose: 'bg-pt-rose-bg text-pt-rose-fg',
  blue: 'bg-pt-blue-bg text-pt-blue-fg',
  violet: 'bg-pt-violet-bg text-pt-violet-fg',
  sun: 'bg-pt-sun-bg text-pt-sun-fg',
  neutral: 'bg-pt-neutral-bg text-pt-neutral-fg',
  ink: 'bg-pt-primary text-pt-on-primary',
} as const

export type Tone = keyof typeof toneClasses

export function toneClass(tone: Tone) {
  return toneClasses[tone]
}

type IconType = ComponentType<{ className?: string }>

/** Small rounded square holding an icon, in one of the soft tints. Flat: no glow, no gradient. */
export function IconChip({ icon: Icon, tone = 'neutral', size = 'md', className }: { icon: IconType; tone?: Tone; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'sm' && 'h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4',
        size === 'md' && 'h-10 w-10 rounded-xl [&_svg]:h-[18px] [&_svg]:w-[18px]',
        size === 'lg' && 'h-12 w-12 rounded-2xl [&_svg]:h-5 [&_svg]:w-5',
        toneClasses[tone],
        className
      )}
    >
      <Icon />
    </span>
  )
}

export function StatusBadge({ tone = 'neutral', dot = false, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5',
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------------------------------------------
 * "i" help: a small info button that explains a term or a section. Opens on hover with a mouse
 * and on tap on phones, so it works everywhere.
 * --------------------------------------------------------------------------------------------*/

export function InfoTip({
  children,
  label = 'What does this mean?',
  side = 'top',
  className,
}: {
  children: ReactNode
  label?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerEnter={(event) => event.pointerType === 'mouse' && setOpen(true)}
          onPointerLeave={(event) => event.pointerType === 'mouse' && setOpen(false)}
          onClick={(event) => {
            // Inside a link or a clickable card, the tip shouldn't trigger the parent too
            event.preventDefault()
            event.stopPropagation()
            setOpen((o) => !o)
          }}
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-pt-faint transition-colors hover:text-pt-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/50',
            className
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-auto max-w-[min(18rem,calc(100vw-2rem))] rounded-2xl border-pt-line bg-pt-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-pt-muted shadow-pt-lift"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

/* ----------------------------------------------------------------------------------------------
 * Layout
 * --------------------------------------------------------------------------------------------*/

/** Page width and vertical rhythm. The shell provides the outer padding. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl space-y-6', className)}>{children}</div>
}

export function PageHeader({
  title,
  description,
  info,
  actions,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  /** Short explanation behind an "i" next to the title. */
  info?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <div className="space-y-3">
      {back && (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-pt-muted transition-colors hover:text-pt-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
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

type PanelProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title?: ReactNode
  description?: ReactNode
  info?: ReactNode
  actions?: ReactNode
  bodyClassName?: string
}

/** A white card with an optional title row. */
export function Panel({ title, description, info, actions, children, className, bodyClassName, ...rest }: PanelProps) {
  return (
    <section className={cn(cardClass, 'overflow-hidden', className)} {...rest}>
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
      <div className={cn(bodyClassName ?? 'px-5 pb-5 pt-3 sm:px-6')}>{children}</div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  href,
  info,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: IconType
  tone?: Tone
  href?: string
  info?: ReactNode
}) {
  const body = (
    <div className={cn(cardClass, 'h-full p-4 transition-all sm:p-5', href && 'hover:-translate-y-0.5 hover:shadow-pt-lift')}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1 text-[13px] font-medium text-pt-muted">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </p>
        {icon && <IconChip icon={icon} tone={tone} size="sm" />}
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

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: IconType
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const Icon = icon
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken text-pt-muted">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-[15px] font-semibold text-pt-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-pt-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Label + value line, for drawers and detail cards. */
export function DetailRow({ icon: Icon, label, children }: { icon?: IconType; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon && (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pt-sunken text-pt-muted">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-pt-faint">{label}</p>
        <div className="mt-0.5 break-words text-sm text-pt-ink">{children}</div>
      </div>
    </div>
  )
}

/** Small uppercase label above a group of content. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-semibold uppercase tracking-wider text-pt-faint', className)}>{children}</p>
}

export function LoadingBlocks({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl bg-pt-sunken" />
      ))}
    </div>
  )
}

/** Full-page loading state that matches the page layout. */
export function PageSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="h-9 w-56 rounded-xl bg-pt-sunken" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-3xl bg-pt-sunken" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-3xl bg-pt-sunken" />
    </PageContainer>
  )
}

/* ----------------------------------------------------------------------------------------------
 * Drawer: slides in from the right on larger screens and up from the bottom on phones.
 * Use it for details and short forms so people never lose their place on the page.
 * --------------------------------------------------------------------------------------------*/

export function PatientDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const isPhone = useIsPhone()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isPhone ? 'bottom' : 'right'}
        className={cn(
          'gap-0 border-pt-line bg-pt-surface p-0 text-pt-ink [&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:rounded-full [&>button:last-child]:p-1.5 [&>button:last-child]:hover:bg-pt-hover',
          isPhone ? 'max-h-[92dvh] rounded-t-3xl' : 'w-full sm:max-w-md',
          className
        )}
      >
        {isPhone && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-pt-line-strong" aria-hidden />}
        <SheetHeader className="shrink-0 gap-0.5 border-b border-pt-line px-5 pb-4 pt-4 pr-12 text-left">
          <SheetTitle className="text-[17px] font-semibold leading-snug tracking-tight text-pt-ink">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-sm text-pt-muted">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-pt-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  )
}
