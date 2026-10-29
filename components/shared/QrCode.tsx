'use client'

import { useMemo } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'

/**
 * QR codes drawn here, in the browser (the qrcode package): the link never goes to an outside
 * service. Dark modules on a white quiet zone, so any phone camera reads it in light or dark mode.
 */

/** The QR's dark squares as one SVG path, on a grid of `size` modules (plus `margin` each side). */
function qrPath(text: string, margin: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  let d = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) d += `M${col + margin} ${row + margin}h1v1h-1z`
    }
  }
  return { d, total: size + margin * 2 }
}

/** Standalone SVG markup, e.g. for a print window. */
export function qrSvgMarkup(text: string, pixels = 640, margin = 4) {
  const { d, total } = qrPath(text, margin)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${d}" fill="#16181c"/></svg>`
}

export function QrCode({ value, size = 160, margin = 3, label, className }: { value: string; size?: number; margin?: number; label: string; className?: string }) {
  const { d, total } = useMemo(() => qrPath(value, margin), [value, margin])
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('rounded-xl', className)}
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={d} fill="#16181c" />
    </svg>
  )
}
