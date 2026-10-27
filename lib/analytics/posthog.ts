/**
 * PostHog product analytics, loaded only after someone says yes to analytics cookies
 * (components/consent/ConsentProvider.tsx). Set up for a health service:
 * - EU hosting, and no autocapture, session recordings, heatmaps or surveys;
 * - nobody is identified, so no person profiles are created;
 * - nothing is sent from patients' care pages, private links or video calls;
 * - query strings and fragments (tokens, codes) are removed from every URL.
 * In PostHog's project settings, also turn on "Discard client IP data".
 */
import type { CaptureResult, PostHog } from 'posthog-js'

const TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'

// Patient care, private links (/v, /go, /x, /r, /track) and calls: never sent
const PRIVATE_PATHS = /^\/(?:dashboard\/patient|v|go|x|r|track|video-call)(?:\/|$)/
// Record ids, codes and tokens in a path (e.g. /patients/<id>) become ":id"
const ID_SEGMENT = /^(?=.*\d)[A-Za-z0-9_-]{12,}$/
// Page titles can name a patient
const DROPPED_PROPERTIES = ['$title', 'title']

let client: PostHog | null = null
let loading: Promise<PostHog | null> | null = null

function scrubPath(path: string): string {
  return path
    .split(/[?#]/)[0]
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
}

function scrubUrl(value: string): string {
  try {
    const url = new URL(value)
    return `${url.origin}${scrubPath(url.pathname)}`
  } catch {
    return scrubPath(value)
  }
}

/** URLs and paths lose query strings, fragments and ids; titles are dropped. */
function scrubProperties(properties: Record<string, unknown> | undefined) {
  if (!properties) return
  for (const key of Object.keys(properties)) {
    const value = properties[key]
    const name = key.toLowerCase()
    if (DROPPED_PROPERTIES.includes(key)) delete properties[key]
    else if (typeof value !== 'string') continue
    else if (name.endsWith('url') || name.endsWith('referrer')) properties[key] = scrubUrl(value)
    else if (name.endsWith('pathname')) properties[key] = scrubPath(value)
  }
}

function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null
  if (PRIVATE_PATHS.test(window.location.pathname)) return null
  scrubProperties(event.properties)
  // "Initial URL" details PostHog attaches for person properties
  scrubProperties(event.$set as Record<string, unknown> | undefined)
  scrubProperties(event.$set_once as Record<string, unknown> | undefined)
  return event
}

/** Starts PostHog (once per page load). Call only with analytics consent. */
export async function startPosthog(): Promise<PostHog | null> {
  if (!TOKEN || typeof window === 'undefined') return null
  if (client) {
    if (client.has_opted_out_capturing()) client.opt_in_capturing()
    return client
  }
  loading ??= import('posthog-js').then(({ default: posthog }) => {
    posthog.init(TOKEN, {
      api_host: HOST,
      defaults: '2026-05-30',
      autocapture: false,
      capture_pageview: 'history_change',
      capture_pageleave: true,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: 'identified_only',
      mask_all_text: true,
      mask_all_element_attributes: true,
      before_send: beforeSend,
    })
    client = posthog
    return posthog
  })
  return loading
}

/** Analytics withdrawn (or never given): stop sending and forget this browser's PostHog id. */
export function stopPosthog() {
  if (client) {
    client.opt_out_capturing()
    client.reset()
  }
  // A "yes" from an earlier visit may have left PostHog's cookie and storage behind
  if (typeof document === 'undefined') return
  const parent = window.location.hostname.split('.').slice(-2).join('.')
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (!name?.startsWith('ph_') || !name.endsWith('_posthog')) continue
    for (const domain of ['', `; domain=.${parent}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}`
    }
  }
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('ph_') && key.endsWith('_posthog')) window.localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked: nothing was stored there either
  }
}

/** A named event, e.g. track('booking_started'). Does nothing without analytics consent. */
export function track(event: string, properties?: Record<string, string | number | boolean | null>) {
  client?.capture(event, properties)
}
