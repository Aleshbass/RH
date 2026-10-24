'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCcw } from '@/components/icons';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { reportClientError } from '@/lib/monitoring/reportClientError';

/** Any page that throws (a failed query, a bad response) lands here instead of a blank screen. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-white px-4 py-16 dark:bg-neutral-950">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-3xl leading-tight text-neutral-900 dark:text-white">Something went wrong</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-300">
          This page didn&apos;t load properly. Your details are safe. Try again, and if it keeps happening, let us know.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-900"
          >
            <Home className="h-4 w-4" />
            Go to the homepage
          </Link>
        </div>
        <p className="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
          Email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-neutral-900 underline underline-offset-2 dark:text-white">
            {SUPPORT_EMAIL}
          </a>
          {error.digest ? ` and quote ${error.digest}` : null}
        </p>
      </div>
    </main>
  );
}
