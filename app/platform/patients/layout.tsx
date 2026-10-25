import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Physiotherapy for Patients',
  description:
    'Physiotherapy from MRTBN-licensed physiotherapists at a clinic, at home or online. Message Joy on WhatsApp and get matched within 24 hours.',
  path: '/platform/patients',
});

export default function PlatformPatientsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
