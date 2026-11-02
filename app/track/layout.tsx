import type { Metadata } from 'next';
import { privateLinkMetadata } from '@/lib/seo/utils';

// Metadata only: the tracking pages are client components and cannot export it.
// Tracking codes are shared on WhatsApp, so previews stay generic and nothing is indexed.
export const metadata: Metadata = privateLinkMetadata({
  title: 'Track your referral',
  description: 'Enter your tracking code to see where your referral is in the care process.',
  path: '/track',
});

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
