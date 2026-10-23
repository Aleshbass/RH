import React from 'react'
import { ClinicThemeProvider } from '@/components/clinic/ClinicTheme'
import { PatientShell } from '@/components/patient/shell/PatientShell'

/**
 * The patient portal: its own shell and light/dark theme. The saved theme is shared with the
 * other portals on this browser, so people who switch between them see the same mode.
 */
export default function PatientDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicThemeProvider>
      <PatientShell>{children}</PatientShell>
    </ClinicThemeProvider>
  )
}
