import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Physiotherapy Session Prices',
  description:
    'How Rehabify Health prices physiotherapy sessions in Nigeria: a base rate adjusted for your location, condition and the physiotherapist’s experience, with up to 15% off treatment packages.',
  path: '/pricing',
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
