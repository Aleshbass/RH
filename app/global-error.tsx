'use client';

import { useEffect } from 'react';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { reportClientError } from '@/lib/monitoring/reportClientError';

/** Last resort when the root layout itself fails: it replaces the whole document, so styles are inline. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', background: '#fff', color: '#171717' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 16px' }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: 0 }}>Something went wrong</h1>
            <p style={{ marginTop: 12, color: '#525252', lineHeight: 1.6 }}>
              Physio Around Me didn&apos;t load properly. Please try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ marginTop: 24, padding: '10px 20px', borderRadius: 9999, border: 0, background: '#171717', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Try again
            </button>
            <p style={{ marginTop: 24, fontSize: 14, color: '#737373' }}>
              Still not working? Email <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#171717' }}>{SUPPORT_EMAIL}</a>
              {error.digest ? ` and quote ${error.digest}` : null}
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
