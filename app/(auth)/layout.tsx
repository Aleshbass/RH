import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// Sign-in and sign-up pages (main site and partners.*) stay out of search results; links are still followed.
export const metadata: Metadata = NOINDEX_METADATA;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
