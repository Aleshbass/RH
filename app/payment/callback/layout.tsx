import type { Metadata } from 'next';

// Paystack return page: its own tab title (not the /payment page's), never indexed.
export const metadata: Metadata = {
  title: 'Payment status',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
};

export default function PaymentCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
