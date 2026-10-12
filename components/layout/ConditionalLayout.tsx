'use client'

import { usePathname } from 'next/navigation'
import Header from "@/components/common/Header"
import Footer from '@/components/landing/Footer'

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
    pathname.startsWith('/onboarding-complete')
  // Hide global header/footer on payment routes (e.g., /payment/callback)
  const isPaymentRoute = pathname.startsWith('/payment')
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

  // B2B, Partner Hub, API, Documentation, and Patient Care Tracker routes
  // MUST NEVER display the consumer marketplace header or footer
  const isB2BOrDocsRoute =
    pathname.startsWith('/partners') ||
    pathname.startsWith('/docs') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/r/') ||
    pathname.startsWith('/v/') ||
    pathname.startsWith('/track') ||
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
    !isStandaloneRoute &&
    !isDashboardRoute &&
    !isPaymentRoute &&
    !isBookingConfirmationRoute &&
    !isBookingRoute &&
    !isStartTreatmentRoute

  const showFooter =
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
      <main className={isDashboardRoute || isStandaloneRoute ? "min-h-screen" : "flex-grow"}>
        {children}
      </main>
      {showFooter && <Footer />}
    </>
  )
}