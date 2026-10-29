import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Refer Patients for Physiotherapy',
  description:
    'Refer patients to verified physiotherapists in Nigeria in a minute. Follow every referral from first contact to discharge, get progress reports back, and earn a commission on their care.',
  path: '/platform/doctors',
});

export default function PlatformDoctorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
