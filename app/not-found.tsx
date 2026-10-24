import type { Metadata } from 'next';
import Link from 'next/link';
import { Home, Search } from '@/components/icons';
import { SUPPORT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-white px-4 py-16 dark:bg-neutral-950">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">404</p>
        <h1 className="mt-2 text-3xl leading-tight text-neutral-900 dark:text-white">We can&apos;t find that page</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-300">
          The link may be old or mistyped. Head back home, or find a physiotherapist near you.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <Home className="h-4 w-4" />
            Go to the homepage
          </Link>
          <Link
            href="/find-a-physio"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-900"
          >
            <Search className="h-4 w-4" />
            Find a physiotherapist
          </Link>
        </div>
        <p className="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
          Still stuck? Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </main>
  );
}
