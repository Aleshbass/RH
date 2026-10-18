import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// /blog currently redirects to sign-up; keep it out of search results until it has content.
export const metadata: Metadata = NOINDEX_METADATA;

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
