import * as Sentry from '@sentry/nextjs'

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
    // Send console.log, console.error, and console.warn calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
  ],
  
  beforeSend(event) {
    // Allow all events in development for testing
    // Filter out specific errors you don't want to track
    if (event.exception?.values?.[0]?.value?.includes('ResizeObserver loop limit exceeded')) {
      return null
    }

    return event
  },
  
  beforeBreadcrumb(breadcrumb) {
    // Filter sensitive data from breadcrumbs
    if (breadcrumb.category === 'console' && breadcrumb.level === 'error') {
      return breadcrumb
    }
    if (breadcrumb.category === 'navigation') {
      return breadcrumb
    }
    if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
      // Remove sensitive headers and data
      if (breadcrumb.data) {
        delete breadcrumb.data.headers
        delete breadcrumb.data.body
      }
      return breadcrumb
    }
    return breadcrumb
  }
})
