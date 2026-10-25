import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Support a Family Member’s Recovery',
  description:
    'Arrange physiotherapy for someone you love: message Joy on WhatsApp, get matched with a licensed physiotherapist within 24 hours, and follow their care with their consent.',
  path: '/platform/family',
});

export default function PlatformFamilyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
