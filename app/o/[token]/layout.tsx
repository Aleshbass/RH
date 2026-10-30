import type { Metadata } from 'next'

// Sent by email, phone notification and WhatsApp, which fetches link previews: nothing here may
// name the patient, their physio or their condition, and the page is never indexed.
export const metadata: Metadata = {
  title: 'How are you? · Rehabify',
  description: 'A quick question from your physiotherapist.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
  openGraph: {
    title: 'How are you today?',
    description: 'One quick question from your physiotherapist. No sign-in needed.',
    siteName: 'Rehabify',
  },
}

export default function OutcomeCheckLayout({ children }: { children: React.ReactNode }) {
  return children
}
