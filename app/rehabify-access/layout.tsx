import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata: Metadata = pageMetadata({
  title: 'Rehabify Access: Assisted Physiotherapy Care',
  description:
    'Need physiotherapy but worried about the cost? Apply for Rehabify Access. Eligible patients in Nigeria may get reduced-fee physiotherapy or a flexible arrangement, with the same clinical standards.',
  path: '/rehabify-access',
});

export default function RehabifyAccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
