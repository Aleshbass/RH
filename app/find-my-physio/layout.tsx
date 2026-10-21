import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// The page redirects to /get-care (the service-first booking flow).
export const metadata: Metadata = NOINDEX_METADATA;

export default function FindMyPhysioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
