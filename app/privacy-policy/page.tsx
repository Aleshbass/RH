import type { Metadata } from 'next';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';
import { PolicyPage } from '@/components/legal/PolicyPage';
import { PRIVACY_POLICY } from '@/lib/legal/privacyPolicy';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  description:
    'How Rehabify collects, uses and protects your personal and health data under the Nigeria Data Protection Act 2023 and the GAID 2025.',
  path: '/privacy-policy',
});

export default function PrivacyPolicyPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Privacy Policy - Rehabify Health"
        description="Our privacy notice under the Nigeria Data Protection Act 2023."
        url="https://physioaroundme.com/privacy-policy"
      />
      <PolicyPage doc={PRIVACY_POLICY} related={['cookie_policy', 'terms', 'payment_policy', 'booking_policy']} />
    </>
  );
}
