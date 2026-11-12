import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'About Rehabify Health',
  description:
    'Rehabify Health (Physio Around Me) was founded by two Ibadan-trained physiotherapists to connect patients, physiotherapists and doctors in Nigeria. Our story, values and quality standards.',
  path: '/about',
  // The Africa card everywhere (X, WhatsApp, Instagram, LinkedIn), not the site's Joy card
  ogImage: {
    url: '/og/rehabify-africa.jpg',
    width: 1200,
    height: 630,
    alt: 'Rehabify: recovery infrastructure for Africa, starting in Nigeria. Free clinical tools for physiotherapists and licensed care for patients.',
  },
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
