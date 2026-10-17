import type { Metadata } from 'next'

// WhatsApp fetches link previews, so nothing here may name the patient, their condition or the
// clinic: the preview stays generic and the page is never indexed.
export const metadata: Metadata = {
  title: 'Your exercises · Rehabify',
  description: 'Your home exercise programme from your physiotherapist.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
  openGraph: {
    title: 'Your home exercises',
    description: 'Open the link and enter your PIN to see your exercises.',
    siteName: 'Rehabify',
  },
}

export default function ShareLinkLayout({ children }: { children: React.ReactNode }) {
  return children
}
