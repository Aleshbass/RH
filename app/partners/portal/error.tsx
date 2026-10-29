"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "@/components/icons";
import { reportClientError } from "@/lib/monitoring/reportClientError";

const SUPPORT_EMAIL = "partners@physioaroundme.com";

/** The partner and referring-doctor portal failed to load: say so plainly and offer a retry. */
export default function PartnerPortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-pt-canvas px-4 py-16 text-pt-ink">
      <div className="w-full max-w-md rounded-3xl border border-pt-line bg-pt-surface p-8 text-center shadow-pt">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-neutral-bg text-pt-neutral-fg">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Your portal didn&apos;t load</h1>
        <p className="mt-2 text-[15px] text-pt-muted">Your referrals and earnings are safe. Try again, and if it keeps happening, let us know.</p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-pt-primary px-5 text-sm font-semibold text-pt-on-primary transition hover:bg-pt-primary-hover active:scale-[0.98]"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-pt-line-strong bg-pt-surface px-5 text-sm font-semibold text-pt-ink transition hover:bg-pt-hover"
          >
            <Home className="h-4 w-4" />
            Go to the homepage
          </Link>
        </div>
        <p className="mt-6 text-sm text-pt-muted">
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-pt-ink underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>
          {error.digest ? ` and quote ${error.digest}` : null}
        </p>
      </div>
    </main>
  );
}
