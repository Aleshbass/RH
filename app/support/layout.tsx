import type { Metadata } from 'next';
import { NOINDEX_METADATA } from '@/lib/seo/utils';

// /support currently redirects to sign-up; keep it out of search results until it has content.
export const metadata: Metadata = NOINDEX_METADATA;

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
