import type { ReactNode } from 'react'
import { LearnShell } from '@/components/learn/platform/LearnChrome'

/** Rehabify Learn's own header and footer (the main site's are hidden on Learn: ConditionalLayout). */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return <LearnShell>{children}</LearnShell>
}
