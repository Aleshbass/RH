import type { Metadata } from 'next';

// One-tap dashboard links from Joy carry a personal sign-in code: never index or follow them.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function GoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
