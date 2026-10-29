'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
// Split out: still server-rendered on marketing pages, but dashboards (which never show them)
// don't download the marketing header and footer code
const Header = dynamic(() => import('@/components/common/Header'))
const Footer = dynamic(() => import('@/components/landing/Footer'))
import { LearnAnnouncementSpacer } from '@/components/learn/LearnAnnouncementBar'

import { useState, useEffect } from 'react'

interface ConditionalLayoutProps {
  children: React.ReactNode
  isSubdomainHost?: boolean
}

export default function ConditionalLayout({ children, isSubdomainHost = false }: ConditionalLayoutProps) {
  const pathname = usePathname()
  const [clientIsSubdomain, setClientIsSubdomain] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname.toLowerCase()
      if (h.startsWith('docs.') || h.startsWith('api.') || h.startsWith('partners.')) {
        setClientIsSubdomain(true)
      }
    }
  }, [])

  // Check if current route is a dashboard route
  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  // Hide global header/footer for onboarding routes to avoid overlap and clutter
  const isOnboardingRoute =
    pathname.startsWith('/physiotherapist') ||
    pathname.startsWith('/clinic-owner') ||
    pathname.startsWith('/patient') ||
    pathname.startsWith('/care-invite') ||
    pathname.startsWith('/onboarding-complete')
  // Hide global header/footer on payment routes (e.g., /payment/callback)
  const isPaymentRoute = pathname.startsWith('/payment') || pathname.startsWith('/receipt/') || pathname.startsWith('/report/')
  // Hide header/footer on booking confirmation page to prevent overlap
  const isBookingConfirmationRoute = pathname.startsWith('/marketplace/booking-confirmation')
  // Hide header/footer on Cal.com-style booking pages for clean embedded experience
  const isBookingRoute = pathname.startsWith('/book')
  // Patient onboarding flow — has its own header
  const isStartTreatmentRoute = pathname === '/start-treatment'
  // Patient matching/physio profile pages — clean experience, no footer
  const isPatientMatchingRoute = pathname.startsWith('/find-my-physio')
  // Individual physio profile page — clean focused experience
  const isPhysioProfileRoute = /^\/find-a-physio\/.+/.test(pathname)
  // Sign-in/up (main site and partner portal) and the OAuth callback: full-screen pages with
  // their own logo and legal links, sized to the viewport so they never scroll
  const isAuthRoute =
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/sso-callback') ||
    pathname.startsWith('/partners/sign-in') ||
    pathname.startsWith('/partners/sign-up')

  // B2B, Partner Hub, API, Documentation, and Patient Care Tracker routes
  // MUST NEVER display the consumer marketplace header or footer
  const isB2BOrDocsRoute =
    // Not a bare startsWith: that would also catch the public /partnerships page
    pathname === '/partners' ||
    pathname.startsWith('/partners/') ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/v/') ||
    pathname.startsWith('/go/') ||
    pathname.startsWith('/video-call') ||
    pathname.startsWith('/track') ||
    // Rehabify Learn course and its one-tap links have their own top bar (/course on the learn host)
    /^\/(?:learn\/)?(?:course|start|verify)(?:\/|$)/.test(pathname) ||
    pathname.includes('physioaroundme.com')

  // Check subdomains (docs.physioaroundme.com, api.physioaroundme.com, partners.physioaroundme.com)
  const isB2BSubdomain =
    isSubdomainHost ||
    clientIsSubdomain ||
    (typeof window !== 'undefined' && (
      window.location.hostname.toLowerCase().startsWith('docs.') ||
      window.location.hostname.toLowerCase().startsWith('api.') ||
      window.location.hostname.toLowerCase().startsWith('partners.')
    ))

  const isStandaloneRoute = isB2BOrDocsRoute || Boolean(isB2BSubdomain)

  const showHeader =
    !isAuthRoute &&
    !isStandaloneRoute &&
    !isDashboardRoute &&
    !isPaymentRoute &&
    !isBookingConfirmationRoute &&
    !isBookingRoute &&
    !isStartTreatmentRoute

  const showFooter =
    !isAuthRoute &&
    !isStandaloneRoute &&
    !isDashboardRoute &&
    !isOnboardingRoute &&
    !isPaymentRoute &&
    !isBookingConfirmationRoute &&
    !isBookingRoute &&
    !isStartTreatmentRoute &&
    !isPatientMatchingRoute &&
    !isPhysioProfileRoute

  return (
    <>
      {showHeader && <Header />}
      {/* Auth pages size themselves to 100dvh; min-h-screen (100vh) would add mobile scroll */}
      <main className={isAuthRoute ? undefined : isDashboardRoute || isStandaloneRoute ? "min-h-screen" : "flex-grow"}>
        {showHeader && <LearnAnnouncementSpacer />}
        {children}
      </main>
      {showFooter && <Footer />}
    </>
  )
}