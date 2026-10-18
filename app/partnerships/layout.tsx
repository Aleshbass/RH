import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Partner with Rehabify Health',
  description:
    'Referral partnerships for doctors, hospitals, HMOs, employers and health platforms: refer patients to verified physiotherapists in Nigeria by link, partner portal or REST API with webhooks.',
  path: '/partnerships',
});

export default function PartnershipsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
