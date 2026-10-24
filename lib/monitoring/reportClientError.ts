/**
 * Sends a crash caught by an error page to Sentry. The SDK (and its scrubbed config) loads only
 * when something actually breaks, so ordinary pages don't carry it.
 */
export function reportClientError(error: unknown): void {
  import('../../sentry.client.config')
    .then(() => import('@sentry/nextjs'))
    .then((Sentry) => {
      Sentry.captureException(error);
    })
    .catch(() => {
      // Reporting is best effort
    });
}
