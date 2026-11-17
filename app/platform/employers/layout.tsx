import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'For Employers: Keep Your People Healthy and at Work',
  description:
    'Rehabify for Work catches back, neck and joint pain early, gets workers to a licensed physiotherapist within 48 hours and supports them back to work after an injury, all on WhatsApp.',
  path: '/platform/employers',
});

export default function PlatformEmployersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
