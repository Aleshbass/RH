import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Pay Later with MediLoan',
  description:
    'Get physiotherapy now and pay over time: apply for MediLoan, healthcare financing by MyItura (an independent company), directly from the Rehabify Health booking page.',
  path: '/payment',
});

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
