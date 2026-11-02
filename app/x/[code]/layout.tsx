import type { Metadata } from 'next'
import { privateLinkMetadata } from '@/lib/seo/utils'

type Props = { params: Promise<{ code: string }> }

// WhatsApp fetches link previews, so nothing here may name the patient, their condition or the
// clinic: the preview stays generic and the page is never indexed.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return {
    ...privateLinkMetadata({
      title: 'Your home exercises',
      description: 'Open the link and enter your PIN to see your exercises.',
      path: `/x/${code}`,
    }),
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  }
}

export default function ShareLinkLayout({ children }: { children: React.ReactNode }) {
  return children
}
