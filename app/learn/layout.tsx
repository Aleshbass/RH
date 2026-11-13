import type { ReactNode } from 'react'
import { LearnShell } from '@/components/learn/platform/LearnChrome'
import { LearnThemeRoot } from '@/components/learn/platform/theme'
import { LEARN_THEME_SCRIPT } from '@/lib/learn/themeScript'

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
