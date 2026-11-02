import type { Metadata } from 'next';
import { privateLinkMetadata } from '@/lib/seo/utils';

type Props = { children: React.ReactNode; params: Promise<{ code: string }> };

// Joy sends this link on WhatsApp, which shows its preview in the chat: generic text only
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { code } = await params;
  return privateLinkMetadata({
    title: 'Open your Rehabify dashboard',
    description: 'Tap to open your dashboard and see your appointments. The link works once.',
    path: `/go/${code}`,
  });
}

export default function DashboardLinkLayout({ children }: Props) {
  return children;
}
