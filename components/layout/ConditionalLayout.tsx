'use client'

import { usePathname } from 'next/navigation'
import Header from "@/components/common/Header"
import Footer from '@/components/landing/Footer'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname()

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

  const showHeader = !isDashboardRoute && !isPaymentRoute && !isBookingConfirmationRoute && !isBookingRoute && !isStartTreatmentRoute
  const showFooter = !isDashboardRoute && !isOnboardingRoute && !isPaymentRoute && !isBookingConfirmationRoute && !isBookingRoute && !isStartTreatmentRoute && !isPatientMatchingRoute && !isPhysioProfileRoute

  return (
    <>
      {showHeader && <Header />}
      <main className={isDashboardRoute ? "min-h-screen" : "flex-grow"}>
        {children}
      </main>
      {showFooter && <Footer />}
    </>
  )
}