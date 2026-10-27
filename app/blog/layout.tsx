import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// /blog is a placeholder; keep it out of search results until it has articles.
export const metadata: Metadata = NOINDEX_METADATA;

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
