import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Support a Family Member’s Recovery',
  description:
    'Tools that help family members follow a loved one’s physiotherapy and rehabilitation: progress updates, care coordination, appointment reminders and support resources.',
  path: '/platform/family',
});

export default function PlatformFamilyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
