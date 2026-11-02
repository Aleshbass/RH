import type { Metadata } from 'next'
import { privateLinkMetadata } from '@/lib/seo/utils'

type Props = { params: Promise<{ token: string }> }

// Sent by email, phone notification and WhatsApp, which fetches link previews: nothing here may
// name the patient, their physio or their condition, and the page is never indexed.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  return {
    ...privateLinkMetadata({
      title: 'How are you today?',
      description: 'One quick question from your physiotherapist. No sign-in needed.',
      path: `/o/${token}`,
    }),
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  }
}

export default function OutcomeCheckLayout({ children }: { children: React.ReactNode }) {
  return children
}
