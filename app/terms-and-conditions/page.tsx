import type { Metadata } from 'next';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';
import { PolicyPage } from '@/components/legal/PolicyPage';
import { TERMS_OF_SERVICE } from '@/lib/legal/termsOfService';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service',
  description:
    'The Terms of Service for Rehabify Care, Digital Recovery Services, the professional workspace and clinic software, issued by Rehabify Limited.',
  path: '/terms-and-conditions',
});

export default function TermsOfServicePage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Terms of Service - Rehabify Health"
        description="The agreement between you and Rehabify Limited for using the Rehabify platform."
        url="https://physioaroundme.com/terms-and-conditions"
      />
      <PolicyPage doc={TERMS_OF_SERVICE} related={['privacy', 'payment_policy', 'booking_policy', 'payout_policy', 'cookie_policy']} />
    </>
  );
}
