import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Software for Physiotherapists',
  description:
    'Get matched with patients in Nigeria and treat them in one workspace: SOAP notes, care plan templates, a 3D exercise library, video calls and messages, and a fixed payout per completed session.',
  path: '/platform/physiotherapists',
});

export default function PlatformPhysiotherapistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
