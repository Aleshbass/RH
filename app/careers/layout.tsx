import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the pages are client components and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Careers at Rehabify',
  description:
    'Join Rehabify Health and help people across Nigeria recover at home, online and in clinics. See open roles and apply online.',
  path: '/careers',
});

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
