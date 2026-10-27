'use client'

/**
 * Cookie consent for the whole platform: reads the choice cookie, shows the banner until a
 * choice is made, loads optional tools (analytics) only when allowed, records each choice in
 * Convex, and keeps a signed-in person's choice the same on all their devices.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import {
  CONSENT_EVENT,
  CONSENT_VERSION,
  newConsentId,
  readConsentCookie,
  serializeConsent,
  writeConsentCookie,
  type Consent,
  type ConsentAction,
  type ConsentChoices,
} from '@/lib/consent'
import { startPosthog, stopPosthog } from '@/lib/analytics/posthog'
import { CookieBanner } from './CookieBanner'
import { CookieSettings } from './CookieSettings'

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const recordRef = makeFunctionReference<
  'mutation',
  { consentId: string; version: number; analytics: boolean; action: ConsentAction; decidedAt: number },
  null
>('cookieConsent:record')
const mineRef = makeFunctionReference<
  'query',
  Record<string, never>,
  { consentId: string; version: number; analytics: boolean; action: ConsentAction; decidedAt: number } | null
>('cookieConsent:mine')

const UMAMI_SRC = 'https://yoursiteanalytics.vercel.app/script.js'
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '051e7953-f174-41aa-a2b7-96106c6f3d0d'
// Umami checks this flag before every hit, so a withdrawn "yes" takes effect without a reload
const UMAMI_DISABLED_KEY = 'umami.disabled'

// Full-screen flows where a banner would cover controls; the choice is asked on the next page
const NO_BANNER = /^\/(?:video-call|v|go|r)(?:\/|$)/

type ConsentApi = {
  consent: Consent | null
  /** The browser has been checked (false during the first render). */
  ready: boolean
  allows: (category: keyof ConsentChoices) => boolean
  acceptAll: () => void
  rejectAll: () => void
  save: (choices: ConsentChoices) => void
  openSettings: () => void
}

const ConsentContext = createContext<ConsentApi | null>(null)

const fallback: ConsentApi = {
  consent: null,
  ready: false,
  allows: () => false,
  acceptAll: () => {},
  rejectAll: () => {},
  save: () => {},
  openSettings: () => {},
}

export function useConsent() {
  return useContext(ConsentContext) ?? fallback
}

function setUmamiDisabled(disabled: boolean) {
  try {
    if (disabled) window.localStorage.setItem(UMAMI_DISABLED_KEY, '1')
    else window.localStorage.removeItem(UMAMI_DISABLED_KEY)
  } catch {
    // Storage blocked: the script isn't loaded without consent anyway
  }
}

export function ConsentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated } = useConvexAuth()
  const recordConsent = useMutation(recordRef)
  const mine = useQuery(mineRef, isAuthenticated ? {} : 'skip')

  const [consent, setConsent] = useState<Consent | null>(null)
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const lastSerialized = useRef<string | null>(null)

  const apply = useCallback((next: Consent | null) => {
    const serialized = next ? serializeConsent(next) : null
    if (serialized === lastSerialized.current) return
    lastSerialized.current = serialized
    setConsent(next)
    setUmamiDisabled(!next?.analytics)
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: next }))
  }, [])

  const record = useCallback(
    (c: Consent) => {
      recordConsent({ consentId: c.id, version: c.version, analytics: c.analytics, action: c.action, decidedAt: c.decidedAt }).catch(() => {
        // The cookie is what's enforced; a missed record is retried on the next visit's sync
      })
    },
    [recordConsent]
  )

  // Read the cookie once in the browser; honour Global Privacy Control as a "no" without asking
  useEffect(() => {
    let current = readConsentCookie()
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
    if (!current && gpc) {
      current = { id: newConsentId(), version: CONSENT_VERSION, analytics: false, action: 'gpc', decidedAt: Date.now() }
      writeConsentCookie(current)
      record(current)
    }
    apply(current)
    setReady(true)

    // A choice made in another tab or on another subdomain
    const refresh = () => {
      if (document.visibilityState === 'visible') apply(readConsentCookie())
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [apply, record])

  // Signed in: the newer of this device's choice and the account's choice wins everywhere
  useEffect(() => {
    if (!ready || !isAuthenticated || mine === undefined) return
    const server = mine && mine.version === CONSENT_VERSION ? mine : null
    if (server && (!consent || server.decidedAt > consent.decidedAt)) {
      if (consent && server.consentId === consent.id && server.analytics === consent.analytics) return
      const adopted: Consent = {
        id: server.consentId,
        version: server.version,
        analytics: server.analytics,
        action: server.action,
        decidedAt: server.decidedAt,
      }
      writeConsentCookie(adopted)
      apply(adopted)
      return
    }
    if (consent && (!server || server.consentId !== consent.id || server.analytics !== consent.analytics)) {
      // Links this device's choice to the account (the server ignores exact repeats)
      record(consent)
    }
  }, [ready, isAuthenticated, mine, consent, apply, record])

  const decide = useCallback(
    (analytics: boolean, action: ConsentAction) => {
      const next: Consent = {
        id: consent?.id ?? newConsentId(),
        version: CONSENT_VERSION,
        analytics,
        action,
        decidedAt: Date.now(),
      }
      writeConsentCookie(next)
      apply(next)
      record(next)
      setSettingsOpen(false)
    },
    [consent, apply, record]
  )

  const api = useMemo<ConsentApi>(
    () => ({
      consent,
      ready,
      allows: (category) => Boolean(consent?.[category]),
      acceptAll: () => decide(true, 'accept_all'),
      rejectAll: () => decide(false, 'reject_all'),
      save: (choices) => decide(choices.analytics, 'custom'),
      openSettings: () => setSettingsOpen(true),
    }),
    [consent, ready, decide]
  )

  // PostHog loads only with a yes, and stops (and forgets this browser) when it's withdrawn
  const analyticsAllowed = Boolean(consent?.analytics)
  useEffect(() => {
    if (!ready) return
    if (analyticsAllowed) void startPosthog()
    else stopPosthog()
  }, [ready, analyticsAllowed])

  const showBanner = ready && !consent && !settingsOpen && !NO_BANNER.test(pathname ?? '')

  return (
    <ConsentContext.Provider value={api}>
      {children}
      {showBanner && <CookieBanner onAccept={api.acceptAll} onReject={api.rejectAll} onCustomise={api.openSettings} />}
      <CookieSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initial={consent ?? null}
        onSave={api.save}
        onAcceptAll={api.acceptAll}
      />
      {consent?.analytics && <Script src={UMAMI_SRC} data-website-id={UMAMI_WEBSITE_ID} data-do-not-track="true" strategy="afterInteractive" />}
    </ConsentContext.Provider>
  )
}
