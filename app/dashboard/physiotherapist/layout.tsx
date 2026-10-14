import React from 'react'
import { ClinicThemeProvider } from '@/components/clinic/ClinicTheme'
import { PhysioShell } from '@/components/physio/PhysioShell'

/**
 * The physiotherapist portal: its own shell, approval gate and light/dark theme. The theme
 * (with its switch sound) and saved preference are shared with the clinic portal, so a
 * clinician who uses both sees the same mode.
 */
export default function PhysiotherapistLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicThemeProvider>
      <PhysioShell>{children}</PhysioShell>
    </ClinicThemeProvider>
  )
}
