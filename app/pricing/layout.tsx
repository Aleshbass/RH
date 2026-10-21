import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Physiotherapy Prices',
  description:
    'Standard, all-inclusive physiotherapy prices in Nigeria: a ₦6,000 Recovery Consultation, video and home assessments, and treatment sessions. The same price whichever physiotherapist you see, pay per session, with assisted care through Rehabify Access and MediLoan financing.',
  path: '/pricing',
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
