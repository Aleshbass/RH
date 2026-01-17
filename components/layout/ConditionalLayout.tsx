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

  const showHeader = !isDashboardRoute && !isPaymentRoute && !isBookingConfirmationRoute && !isBookingRoute
  const showFooter = !isDashboardRoute && !isOnboardingRoute && !isPaymentRoute && !isBookingConfirmationRoute && !isBookingRoute

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