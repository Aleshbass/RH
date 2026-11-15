'use client'

/**
 * Live presence heartbeat (owner 2026-11-15: admins see who is on the platform right now). While
 * the tab is visible it tells Convex every 45 s which area it's in (site, Learn, a dashboard, a
 * call) and the kind of device; the server knows who is signed in. Nothing else is sent.
 *
 * Visitors who allowed analytics get one id per browser (so they count once); everyone else gets an
 * id that lives only for this page view (nothing stored on their device).
 */

import { useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useConvexAuth, useMutation } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { useConsent } from '@/components/consent/ConsentProvider'

const beatRef = makeFunctionReference<'mutation', { sid: string; area: string; device: string }, null>('presence:beat')
const STORE = 'rehabify:presence-id'
const EVERY_MS = 45_000

const randomId = () => {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  }
}

function areaOf(host: string, path: string): string {
  if (host.startsWith('learn.') || path === '/learn' || path.startsWith('/learn/')) return 'learn'
  if (host.startsWith('admin.') || path.startsWith('/dashboard/admin')) return 'admin'
  if (path.startsWith('/video-call') || path.startsWith('/call/')) return 'call'
  if (path.startsWith('/dashboard/physiotherapist') || path.startsWith('/physiotherapist')) return 'physio'
  if (path.startsWith('/dashboard/patient') || path.startsWith('/patient/')) return 'patient'
  if (path.startsWith('/dashboard/clinic') || path.startsWith('/clinic-owner')) return 'clinic'
  if (path.startsWith('/dashboard/family')) return 'family'
  if (path.startsWith('/partners') || host.startsWith('partners.')) return 'partner'
  if (path.startsWith('/blog')) return 'blog'
  return 'site'
}

function deviceOf(): string {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const w = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight)
  if (coarse && w < 600) return 'phone'
  if (coarse && w < 1100) return 'tablet'
  return 'computer'
}

export function PresenceBeat() {
  const beat = useMutation(beatRef)
  const { consent } = useConsent()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const pathname = usePathname() || '/'
  const pageId = useRef<string | null>(null)
  const allowed = Boolean(consent?.analytics)

  const sid = useMemo(() => {
    if (typeof window === 'undefined') return null
    if (allowed) {
      try {
        const saved = localStorage.getItem(STORE)
        if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved
        const next = randomId()
        localStorage.setItem(STORE, next)
        return next
      } catch {
        // storage blocked: fall back to this page view
      }
    }
    if (!pageId.current) pageId.current = randomId()
    return pageId.current
  }, [allowed])

  // Latest values for the timer without restarting it
  const latest = useRef({ pathname, sid })
  latest.current = { pathname, sid }

  useEffect(() => {
    if (!sid || isLoading) return
    const send = () => {
      if (document.visibilityState !== 'visible') return
      const { pathname: path, sid: id } = latest.current
      if (!id) return
      void beat({ sid: id, area: areaOf(window.location.hostname, path), device: deviceOf() }).catch(() => undefined)
    }
    send()
    const timer = window.setInterval(send, EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') send()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // A new page, a sign-in or a new id sends straight away
  }, [beat, sid, isLoading, isAuthenticated, pathname])

  return null
}
