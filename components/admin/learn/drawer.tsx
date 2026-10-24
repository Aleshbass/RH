'use client'

/** Drawer and form field shared by the admin Learn panels. */

import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsPhone } from '@/components/patient/ui'
import { hintClass, labelClass } from '@/components/admin/partners/shared'
import { cn } from '@/lib/utils'

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  )
}

/** Right-hand drawer on desktop, bottom sheet on phones. */
export function AdminDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const isPhone = useIsPhone()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isPhone ? 'bottom' : 'right'}
        className={cn(
          'gap-0 bg-white p-0 dark:border-white/10 dark:bg-rh-ink-2',
          isPhone ? 'max-h-[94dvh] rounded-t-3xl' : 'w-full sm:max-w-xl'
        )}
      >
        <SheetHeader className="shrink-0 border-b border-black/[0.05] px-5 py-4 pr-12 text-left dark:border-white/[0.06]">
          <SheetTitle className="text-lg font-semibold text-rh-ink dark:text-white">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-sm text-neutral-500 dark:text-neutral-400">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Edit</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-black/[0.05] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 dark:border-white/[0.06]">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
