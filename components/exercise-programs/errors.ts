import { ConvexError } from 'convex/values'

/**
 * A readable message for a failed exercise-programme request. Messages the server wrote for
 * people (ConvexError) are shown as they are; anything else gets the fallback.
 */
export function programError(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data
    if (typeof data === 'string' && data.trim()) return data
    if (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string') {
      return (data as { message: string }).message
    }
  }
  const message = error instanceof Error ? error.message : ''
  const match = message.match(/ConvexError:\s*(.+?)(?:\n|\s+at\s|$)/)
  return match?.[1]?.trim() || fallback
}
