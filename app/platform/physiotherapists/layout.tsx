import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Software for Physiotherapists',
  description:
    'Treatment plans, remote monitoring, patient messaging, automated documentation and online bookings for physiotherapists in Nigeria, with patient referrals through the Rehabify marketplace.',
  path: '/platform/physiotherapists',
});

export default function PlatformPhysiotherapistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
