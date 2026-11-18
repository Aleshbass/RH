import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { headers } from 'next/headers'
import { DashboardChrome } from '@/components/dashboard/shared/DashboardChrome'
import { DeliveryReceipts } from '@/components/chat/DeliveryReceipts'
import { SignOutGuard } from '@/components/auth/SignOutGuard'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const headerList = await headers()
  const pathname = headerList.get('x-pathname') || ''

  // /dashboard/clinic is a self-contained clinic portal with its own layout and access rules
  // (middleware.ts already requires sign-in for every /dashboard path)
  if (pathname.startsWith('/dashboard/clinic')) {
    return (
      <SignOutGuard>
        {children}
        <DeliveryReceipts />
      </SignOutGuard>
    )
  }

  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // The clinic and physiotherapist portals bring their own shell; everyone else gets the shared one
  // DeliveryReceipts turns chat ticks from sent to delivered while someone has Rehabify open
  // SignOutGuard: signing out swaps the page for "Signing you out…" so its queries never run logged out
  return (
    <SignOutGuard>
      <DashboardChrome>
        {children}
        <DeliveryReceipts />
      </DashboardChrome>
    </SignOutGuard>
  )
}
