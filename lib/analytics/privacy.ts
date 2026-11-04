/**
 * What analytics may record, shared by PostHog (lib/analytics/posthog.ts) and Umami
 * (lib/analytics/umami.ts):
 * - nothing from patients' care pages, private links (/v, /go, /x, /r, /track) or video calls;
 * - no query strings or fragments (tokens, codes), and record ids in a path become ":id".
 */

// Patient care, private links (/v, /go, /x, /r, /track) and calls: never sent
export const PRIVATE_PATHS = /^\/(?:dashboard\/patient|v|go|x|r|track|video-call)(?:\/|$)/
// Record ids, codes and tokens in a path (e.g. /patients/<id>) become ":id"
const ID_SEGMENT = /^(?=.*\d)[A-Za-z0-9_-]{12,}$/

export function isPrivatePath(path: string): boolean {
  return PRIVATE_PATHS.test(path.split(/[?#]/)[0] || '/')
}

export function scrubPath(path: string): string {
  return path
    .split(/[?#]/)[0]
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
}

export function scrubUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.origin}${scrubPath(url.pathname)}`
  } catch {
    return scrubPath(value)
  }
}
