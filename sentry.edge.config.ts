import * as Sentry from '@sentry/nextjs'
import { scrubBreadcrumb, scrubEvent } from './lib/sentryScrub'

Sentry.init({
  // Falls back to the public DSN: only NEXT_PUBLIC_SENTRY_DSN is set in Vercel
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Enable experimental features
  _experiments: {
    enableLogs: true,
  },

  // Edge runtime integrations
  integrations: [
    // Errors and warnings only: ordinary logs can carry personal data
    Sentry.consoleLoggingIntegration({ levels: ["error", "warn"] }),
  ],

  // No request bodies, cookies, auth headers, URL secrets (tokens, invite codes) or user emails/IPs
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
})
