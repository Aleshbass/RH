'use client'

import { Printer } from '@/components/icons'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-rh-ink px-4 text-sm font-semibold text-white hover:bg-rh-ink/90"
    >
      <Printer className="h-4 w-4" />
      Print or save as PDF
    </button>
  )
}
