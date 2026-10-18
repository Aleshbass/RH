import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Find a Physiotherapist in Nigeria',
  description:
    'Search physiotherapists approved by Rehabify Health by condition, specialty or name. Compare experience, reviews and session types, then book an online video or in-person session.',
  path: '/find-a-physio',
});

export default function FindAPhysioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
