import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Book Physiotherapy',
  description:
    'Choose a physiotherapy service at Rehabify’s standard price, then a physiotherapist: video consultations, assessments, treatment and home visits in Nigeria. The price you see is the price you pay.',
  path: '/get-care',
});

export default function GetCareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
