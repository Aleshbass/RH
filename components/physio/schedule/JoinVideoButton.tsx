'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'
import { Clock, Video } from '@/components/icons'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { cn } from '@/lib/utils'
import type { VideoJoin } from './shared'

/** Brand lime fill with ink text: the one colour for "join now". Flat, no glow. */
export const joinButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-rh-lime font-semibold text-rh-ink shadow-none transition hover:bg-rh-lime-deep active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink/40 dark:focus-visible:ring-white/50'

const waitingClass =
  'inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-pt-line-strong bg-pt-sunken font-medium text-pt-muted'

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 w-full px-4 text-sm',
} as const

/**
 * The Join button for an online session (timing rule: lib/videoJoin.ts). Lime and live from 15
 * minutes before the start until the end; before that it's greyed out with the time it opens.
 * Renders nothing for in-person, cancelled or finished visits.
 */
export function JoinVideoButton({
  join,
  size = 'sm',
  label = 'Join',
  showWaiting = true,
  iconOnly = false,
  className,
}: {
  join: VideoJoin
  size?: keyof typeof SIZES
  label?: string
  /** Show the greyed-out "Opens …" state before the window opens */
  showWaiting?: boolean
  /** Just the camera (calendar blocks); `label` becomes its accessible name */
  iconOnly?: boolean
  className?: string
}) {
  // Rows that open a drawer on click shouldn't also open it when Join is tapped
  const stop = (event: MouseEvent) => event.stopPropagation()
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  if (join.kind === 'open') {
    const body = iconOnly ? (
      <Video className="h-3.5 w-3.5" />
    ) : (
      <>
        <Video className={iconClass} />
        {label}
      </>
    )
    const shared = {
      onClick: stop,
      'aria-label': iconOnly ? label : undefined,
      title: iconOnly ? label : undefined,
      className: cn(joinButtonClass, SIZES[size], 'shrink-0', className),
    }
    return join.external ? (
      <a href={join.href} target="_blank" rel="noopener noreferrer" {...shared}>
        {body}
      </a>
    ) : (
      <Link href={join.href} {...shared}>
        {body}
      </Link>
    )
  }

  if (!showWaiting || iconOnly || join.kind === 'none') return null

  // Small buttons sit in list rows: on phones they drop the first word to leave room for the name
  const lead = size === 'sm' ? 'hidden sm:inline' : undefined
  const text =
    join.kind === 'soon' ? (
      <>
        <span className={lead}>Opens</span> {lagosTime(join.opensAt)}
      </>
    ) : size === 'sm' ? (
      <>
        <span className="hidden sm:inline">Link not ready</span>
        <span className="sm:hidden">No link</span>
      </>
    ) : (
      'Link not ready'
    )
  const why =
    join.kind === 'soon'
      ? `Join opens 15 minutes before the start, at ${lagosTime(join.opensAt)}.`
      : 'The video link is made once the session is confirmed.'
  return (
    <button type="button" disabled aria-disabled title={why} aria-label={why} className={cn(waitingClass, SIZES[size], 'shrink-0', className)}>
      <Clock className={iconClass} />
      {text}
    </button>
  )
}
