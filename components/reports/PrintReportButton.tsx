'use client'

import { Printer } from '@/components/icons'
import { cn } from '@/lib/utils'

/** "Print or save as PDF" for a progress report. */
export function PrintReportButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-rh-ink px-5 text-sm font-semibold text-white hover:bg-rh-ink/90',
        className
      )}
    >
      <Printer className="h-4 w-4" />
      Print or save as PDF
    </button>
  )
}
