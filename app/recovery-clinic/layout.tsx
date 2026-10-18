import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Expert Physiotherapy, Matched to You',
  description:
    'Get matched with a verified physiotherapist in about 60 seconds, with transparent pricing and online or in-person sessions in Nigeria. Start your recovery with Rehabify Health.',
  path: '/recovery-clinic',
});

export default function RecoveryClinicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
