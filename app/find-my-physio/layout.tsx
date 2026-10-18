import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// Personal match results built from the start-treatment answers in the URL: not a search landing page.
export const metadata: Metadata = NOINDEX_METADATA;

export default function FindMyPhysioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
