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
    pathname.startsWith('/onboarding-complete')
  const showHeaderFooter = !isDashboardRoute && !isOnboardingRoute
  
  return (
    <>
      {showHeaderFooter && <Header />}
      <main className={isDashboardRoute ? "min-h-screen" : "flex-grow"}>
        {children}
      </main>
      {showHeaderFooter && <Footer />}
    </>
  )
}