import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Errors thrown while rendering pages, route handlers and middleware (console output is stripped
// in production, so this is where server errors show up). Events are scrubbed by the configs above.
export const onRequestError = Sentry.captureRequestError
