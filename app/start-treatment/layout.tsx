import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Start Treatment: Get Matched with a Physiotherapist',
  description:
    'Tell us where you are and what needs attention, and get matched with a physiotherapist approved by Rehabify Health for online or in-person sessions in Nigeria.',
  path: '/start-treatment',
});

export default function StartTreatmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
