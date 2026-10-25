import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Physiotherapy Clinic Management Software',
  description:
    'Run your physiotherapy clinic on Rehabify: guided setup, staff roles, patient assignment, team appointments, invoices with Paystack and monthly reports.',
  path: '/platform/clinics',
});

export default function PlatformClinicsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
