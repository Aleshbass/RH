import type { Metadata } from 'next';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';
import { PolicyPage } from '@/components/legal/PolicyPage';
import { PAYMENT_POLICY } from '@/lib/legal/paymentPolicy';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Payment Policy',
  description:
    'How payment, booking confirmation, cancellations, refunds and Digital Recovery Services work on Rehabify.',
  path: '/payment-policy',
});

export default function PaymentPolicyPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Payment Policy - Rehabify Health"
        description="How payments, booking confirmation and refunds work on Rehabify Health."
        url="https://physioaroundme.com/payment-policy"
      />
      <PolicyPage doc={PAYMENT_POLICY} related={['booking_policy', 'terms', 'privacy']} />
    </>
  );
}
