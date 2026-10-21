/**
 * Keeps credentials and personal data out of Sentry (shared by the client, server and edge configs).
 * Several links carry their secret in the URL: exercise share links (/x/<token>), Joy join links
 * (/v/<code>), invitations (/patient-invite/<code>, /staff-invite/<code>, /clinic-invite/<code>)
 * and webhook tokens (?token=...).
 */
const PATH_SECRETS = /\/(x|v|patient-invite|staff-invite|clinic-invite)\/[^/?#\s]+/g
const QUERY_SECRETS = /([?&](?:token|code|pin|key|secret|signature)=)[^&#\s]*/gi
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'x-paystack-signature', 'x-webhook-token', 'x-api-key', 'x-convex-server-secret'])

export function scrubUrl(value?: string): string | undefined {
  return value?.replace(PATH_SECRETS, '/$1/[redacted]').replace(QUERY_SECRETS, '$1[redacted]')
}

type ScrubbableEvent = {
  transaction?: string
  request?: {
    url?: string
    query_string?: unknown
    cookies?: unknown
    data?: unknown
    headers?: Record<string, string>
  }
  user?: { email?: string; ip_address?: string | null; [key: string]: unknown }
}

/** Removes request bodies, cookies, auth headers, URL secrets and the user's email/IP from an event. */
export function scrubEvent<T>(event: T): T {
  const e = event as unknown as ScrubbableEvent
  if (e.transaction) e.transaction = scrubUrl(e.transaction)
  const request = e.request
  if (request) {
    if (request.url) request.url = scrubUrl(request.url)
    if (typeof request.query_string === 'string') request.query_string = scrubUrl(`?${request.query_string}`)?.slice(1)
    else if (request.query_string) request.query_string = '[redacted]'
    delete request.cookies
    delete request.data
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (SECRET_HEADERS.has(name.toLowerCase())) delete request.headers[name]
        else if (name.toLowerCase() === 'referer') request.headers[name] = scrubUrl(request.headers[name]) ?? ''
      }
    }
  }
  if (e.user) {
    delete e.user.email
    delete e.user.ip_address
  }
  return event
}

/** Breadcrumbs: scrub URLs and drop request/response bodies and headers. */
export function scrubBreadcrumb<T>(breadcrumb: T): T {
  const b = breadcrumb as unknown as { message?: string; data?: Record<string, unknown> }
  if (b.message) b.message = scrubUrl(b.message)
  if (b.data) {
    for (const key of ['url', 'to', 'from']) {
      if (typeof b.data[key] === 'string') b.data[key] = scrubUrl(b.data[key] as string)
    }
    delete b.data.headers
    delete b.data.body
    delete b.data.request_body_size
  }
  return breadcrumb
}
