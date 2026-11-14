import type { ReactNode } from 'react'
import type { Viewport } from 'next'
import { LearnShell } from '@/components/learn/platform/LearnChrome'
import { LearnThemeRoot } from '@/components/learn/platform/theme'
import { LEARN_THEME_SCRIPT } from '@/lib/learn/themeScript'

/**
 * On Android the keyboard shrinks the page instead of covering it, so bottom sheets (Start a post,
 * Host a Space) keep their fields and buttons in view while typing.
 */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' }

/** Rehabify Learn's own header and footer (the main site's are hidden on Learn: ConditionalLayout). */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Dark mode before the first paint, so it never flashes white */}
      <script dangerouslySetInnerHTML={{ __html: LEARN_THEME_SCRIPT }} />
      <LearnThemeRoot />
      <LearnShell>{children}</LearnShell>
    </>
  )
}
