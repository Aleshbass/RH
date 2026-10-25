import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Pay Later with MediLoan',
  description:
    'Get physiotherapy now and pay over time: apply for MediLoan, healthcare financing by MyItura (an independent company), subject to approval and the lender\'s terms.',
  path: '/pay-later',
});

export default function PayLaterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
