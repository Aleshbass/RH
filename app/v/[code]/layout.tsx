import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Join your appointment | Rehabify Health',
  robots: { index: false, follow: false },
}

export default function PatientJoinLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-neutral-50">{children}</div>
}
