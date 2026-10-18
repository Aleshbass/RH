import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

// Metadata only: the page is a client component and cannot export it.
export const metadata: Metadata = pageMetadata({
  title: 'Physiotherapy for Patients',
  description:
    'Personalised recovery plans from licensed physiotherapists, guided exercise videos, chat with your physio, easy booking of video or in-person sessions and progress tracking.',
  path: '/platform/patients',
});

export default function PlatformPatientsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
