'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Prints only its children from inside the dashboard: they're placed straight under <body>,
 * hidden on screen, and when printing everything else under <body> (the shell, drawers, toasts)
 * is hidden instead. The page itself shows its own on-screen copy.
 */
export function ReportPrintPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <div className="rh-report-portal">
      <style>{`
.rh-report-portal { display: none; }
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body > *:not(.rh-report-portal) { display: none !important; }
  .rh-report-portal { display: block !important; }
}
`}</style>
      {children}
    </div>,
    document.body
  )
}
