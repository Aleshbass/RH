import * as Sentry from '@sentry/nextjs'
import { scrubBreadcrumb, scrubEvent } from './lib/sentryScrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Optionally sample profiling data
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
  
  // Enable experimental features
  _experiments: {
    enableLogs: true,
  },
  
  // Performance monitoring and logging
  integrations: [
    Sentry.browserTracingIntegration(),
    // Errors and warnings only: ordinary logs can carry personal data
    Sentry.consoleLoggingIntegration({ levels: ["error", "warn"] }),
  ],

  beforeSend(event) {
    // Filter out specific errors you don't want to track
    if (event.exception?.values?.[0]?.value?.includes('ResizeObserver loop limit exceeded')) {
      return null
    }
    // No request bodies, cookies, URL secrets (share links, invite codes, tokens) or user emails/IPs
    return scrubEvent(event)
  },
  beforeSendTransaction: (event) => scrubEvent(event),

  beforeBreadcrumb(breadcrumb) {
    // Console breadcrumbs repeat log text, which can hold personal data
    if (breadcrumb.category === 'console' && breadcrumb.level !== 'error') return null
    return scrubBreadcrumb(breadcrumb)
  }
})
