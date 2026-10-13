import type { Metadata } from 'next'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'Join your appointment | Rehabify Health',
  robots: { index: false, follow: false },
}

export default function PatientJoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#f5f6f5]">
      {children}
      <Toaster position="top-center" />
    </div>
  )
}
