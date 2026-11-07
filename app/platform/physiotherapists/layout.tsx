import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'For Physiotherapists: Free Practice Tools and More Patients',
  description:
    'A free practice system built for Nigerian physiotherapists: SOAP notes, care plan templates, 3D exercise programmes, video sessions and invoices. Join our care network and Joy matches patients to your skills and area.',
  path: '/platform/physiotherapists',
});

export default function PlatformPhysiotherapistsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
