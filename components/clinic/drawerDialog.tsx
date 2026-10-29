'use client'

import type { ComponentProps } from 'react'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useIsPhone } from '@/components/patient/ui'
import { cn } from '@/lib/utils'

/**
 * Drop-in for components/ui/dialog in the clinic portal: the same parts (Dialog, DialogContent,
 * DialogHeader…) render as a drawer, from the right on larger screens and from the bottom on
 * phones, like the physio and patient portals. Forms keep their place on the page.
 * Short yes/no confirmations stay as AlertDialog.
 */

export const Dialog = Sheet
export const DialogTrigger = SheetTrigger
export const DialogClose = SheetClose

/** Sizes and scrolling belong to the drawer, not to the old centred dialog. */
function drawerClasses(className: string | undefined, isPhone: boolean) {
  return (className ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const base = token.replace(/^(sm|md|lg):/, '')
      if (/^(max-w|w|min-w|max-h|min-h|translate|top|left|rounded)(-|$)/.test(base)) return false
      if (/^overflow(-[xy])?-/.test(base)) return false
      // A fixed height suits a bottom sheet (chat); a side drawer is always full height
      if (/^h-/.test(base)) return isPhone && !token.includes(':')
      return true
    })
    // "No padding" (the content brings its own) must beat the drawer's larger-screen padding too
    .flatMap((token) => (token === 'p-0' ? ['p-0', 'sm:p-0', 'pb-0'] : [token]))
    .join(' ')
}

/** Wide forms (weekly hours, patient lists) keep a wider drawer on larger screens. */
const WIDE: Record<string, string> = { xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl', '3xl': 'sm:max-w-3xl', '4xl': 'sm:max-w-3xl' }
function drawerWidth(className: string | undefined) {
  const wide = (className ?? '').match(/(?:^|\s)(?:sm:)?max-w-(xl|2xl|3xl|4xl)(?:\s|$)/)?.[1]
  return (wide && WIDE[wide]) || 'sm:max-w-lg'
}

export function DialogContent({ className, children, ...props }: ComponentProps<typeof SheetContent> & { showCloseButton?: boolean }) {
  const isPhone = useIsPhone()
  const { showCloseButton: _ignored, ...rest } = props as typeof props & { showCloseButton?: boolean }
  void _ignored
  const own = drawerClasses(className, isPhone)
  const spaced = /(^|\s)space-y-/.test(own)
  return (
    <SheetContent
      side={isPhone ? 'bottom' : 'right'}
      className={cn(
        'overflow-y-auto overscroll-contain border-pt-line bg-pt-surface p-5 text-pt-ink sm:p-6',
        spaced ? 'gap-0' : 'gap-4',
        // The close button: round, in the corner, like the shared drawers
        '[&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:rounded-full [&>button:last-child]:p-1.5 [&>button:last-child]:hover:bg-pt-hover',
        isPhone ? 'max-h-[92dvh] rounded-t-3xl pb-[calc(1.25rem+env(safe-area-inset-bottom))]' : cn('w-full', drawerWidth(className)),
        own
      )}
      {...rest}
    >
      {isPhone && <div className="mx-auto -mt-2 mb-2 h-1.5 w-10 shrink-0 rounded-full bg-pt-line-strong" aria-hidden />}
      {children}
    </SheetContent>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pr-8 text-left', className?.replace(/\b(sm:)?text-center\b/g, ''))} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof SheetTitle>) {
  return <SheetTitle className={cn('text-[17px] font-semibold leading-snug tracking-tight text-pt-ink', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof SheetDescription>) {
  return <SheetDescription className={cn('text-sm text-pt-muted', className)} {...props} />
}

/** Actions stay in reach at the bottom of the drawer while the form scrolls. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'sticky -bottom-5 z-10 -mx-5 mt-auto flex flex-col-reverse gap-2 border-t border-pt-line bg-pt-surface px-5 py-4 sm:-bottom-6 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6',
        className?.replace(/\bsm:gap-0\b/g, '')
      )}
      {...props}
    />
  )
}
