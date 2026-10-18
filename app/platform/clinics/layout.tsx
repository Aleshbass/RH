import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Physiotherapy Clinic Management Software',
  description:
    'Practice management for physiotherapy clinics in Nigeria: bookings, billing with Paystack, patient records, staff scheduling, analytics and telehealth video consultations.',
  path: '/platform/clinics',
});

export default function PlatformClinicsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
