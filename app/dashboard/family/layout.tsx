import type { ReactNode } from 'react'
import { ClinicThemeProvider } from '@/components/clinic/ClinicTheme'
import { FamilyShell } from '@/components/family/FamilyShell'

export const metadata = { title: 'Family · Rehabify' }

/** Family members and caregivers looking after someone's care (convex/careCircle.ts). */
export default function FamilyLayout({ children }: { children: ReactNode }) {
  return (
    <ClinicThemeProvider>
      <FamilyShell>{children}</FamilyShell>
    </ClinicThemeProvider>
  )
}
