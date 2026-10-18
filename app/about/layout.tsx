import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'About Rehabify Health',
  description:
    'Rehabify Health (Physio Around Me) was founded by two Ibadan-trained physiotherapists to connect patients, physiotherapists and doctors in Nigeria. Our story, values and quality standards.',
  path: '/about',
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
