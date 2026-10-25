'use client'

import Link from 'next/link'
import { Home } from '@/components/icons'
import { cn } from '@/lib/utils'

const TONES = {
  /** Patient and physio portals (pt-* tokens, light and dark) */
  portal: 'bg-pt-surface text-pt-ink ring-1 ring-inset ring-pt-line hover:bg-pt-hover',
  /** Admin and clinic consoles on rh-canvas */
  console: 'bg-white text-rh-ink shadow-soft hover:bg-white/80 dark:bg-rh-ink-2 dark:text-white dark:hover:bg-rh-ink-3',
  /** Dark top bars (the shared dashboard header) */
  dark: 'text-white/85 hover:bg-white/10 hover:text-white',
} as const

/**
 * A way back to the public site (the landing page) from any dashboard. On subdomains where "/" is
 * something else (partners.), pass the main site's full URL as `href`.
 */
export function WebsiteLink({ tone = 'console', href = '/', className }: { tone?: keyof typeof TONES; href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Go to the Rehabify website"
      title="Rehabify website"
      className={cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime',
        TONES[tone],
        className
      )}
    >
      <Home className="h-4 w-4" />
      <span className="hidden xl:inline">Website</span>
    </Link>
  )
}
