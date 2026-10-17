/** Formatting and error helpers shared by the admin finance pages. */

/** Kobo → "₦12,500" (keeps kobo when there are any, e.g. "₦12,500.50"). */
export function formatKobo(kobo: number | null | undefined) {
  const naira = (kobo ?? 0) / 100
  return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/** Kobo → plain naira number for CSV columns. */
export function koboToNairaNumber(kobo: number | null | undefined) {
  return Math.round(kobo ?? 0) / 100
}

/** A readable message from a Convex/JS error. ConvexError messages arrive in `data`. */
export function errorText(error: unknown, fallback = 'Please try again.') {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data: unknown }).data
    if (typeof data === 'string' && data) return data
  }
  if (error instanceof Error && error.message) {
    const match = error.message.match(/(?:ConvexError|Error):\s*([^\n]+)/)
    return (match?.[1] ?? error.message).replace(/\s+at\s+.*$/, '').trim() || fallback
  }
  return fallback
}

export function personInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}
