import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { privateLinkMetadata } from '@/lib/seo/utils'

type Props = { params: Promise<{ code: string }> }

// Joy sends this link on WhatsApp, which shows its preview in the chat: generic text only
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return privateLinkMetadata({
    title: 'Join your appointment',
    description: 'Open this link to see your appointment details and join your session with your physiotherapist.',
    path: `/v/${code}`,
  })
}

export default function PatientJoinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#f5f6f5]">
      {children}
      <Toaster position="top-center" />
    </div>
  )
}
