'use client'

import { useEffect, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { HeartPulse, LogOut, MoreVertical, ShieldCheck } from '@/components/icons'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { initials } from '@/components/patient/ui'
import { PatientNotifications, PatientThemeToggle, SoundSwitchRow, topBarButtonClass } from '@/components/patient/shell/PatientControls'
import { FamilyHelp } from '@/components/family/FamilyHelp'
import { AppIconBadge, AppSetupButton, AppSetupPrompt } from '@/components/pwa/AppSetup'
import { cn } from '@/lib/utils'

export const FAMILY_HOME = '/dashboard/family'

function Brand() {
  return (
    <span className="flex items-center">
      <Image src="/logos/Ink%20MainRehabify.svg" alt="Rehabify" width={112} height={24} className="h-6 w-auto dark:hidden" priority unoptimized />
      <Image src="/logos/White%20MainRehabify.svg" alt="Rehabify" width={112} height={24} className="hidden h-6 w-auto dark:block" priority unoptimized />
    </span>
  )
}

function AccountMenu() {
  const { user } = useUser()
  const { openUserProfile, signOut } = useClerk()
  const me = useQuery(api.users.getMyUser) as { role?: string } | null | undefined
  const name = user?.fullName || user?.firstName || 'Your account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(topBarButtonClass, 'w-auto gap-2 px-1.5 pr-2.5')} aria-label="Your account">
          <Avatar className="h-7 w-7 rounded-lg">
            <AvatarImage src={user?.imageUrl} alt="" />
            <AvatarFallback className="rounded-lg bg-pt-green-bg text-[11px] font-semibold text-pt-green-fg">{initials(name)}</AvatarFallback>
          </Avatar>
          <MoreVertical className="h-3.5 w-3.5 text-pt-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 rounded-2xl border-pt-line bg-pt-surface p-1.5 text-pt-ink shadow-pt-lift">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-semibold text-pt-ink">{name}</p>
          <p className="truncate text-xs text-pt-faint">{user?.primaryEmailAddress?.emailAddress}</p>
        </div>
        <DropdownMenuSeparator className="bg-pt-line" />
        {me?.role === 'patient' && (
          <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5 focus:bg-pt-hover">
            <Link href="/dashboard/patient">
              <HeartPulse className="mr-2 h-4 w-4" />
              My own care
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => openUserProfile()}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Login &amp; security
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-pt-line" />
        <PatientThemeToggle withLabel />
        <SoundSwitchRow className="hover:bg-transparent" />
        <DropdownMenuSeparator className="bg-pt-line" />
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5 text-pt-rose-fg focus:bg-pt-rose-bg focus:text-pt-rose-fg"
          onSelect={() => void signOut({ redirectUrl: '/' })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The family and caregiver portal: one calm page per person they look after, on the patient
 * portal's design (pt-* colours, light and dark). A top bar only: everything is on the page.
 */
export function FamilyShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.portal = 'patient'
    return () => {
      if (root.dataset.portal === 'patient') delete root.dataset.portal
    }
  }, [])

  return (
    <div className="min-h-screen bg-pt-canvas text-pt-ink">
      <header className="sticky top-0 z-30 bg-pt-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
          <Link href={FAMILY_HOME} aria-label="Home" className="flex items-center gap-2.5">
            <Brand />
            <span className="hidden rounded-full bg-pt-sunken px-2.5 py-1 text-[11px] font-semibold text-pt-muted sm:inline">Family</span>
          </Link>
          <div className="flex items-center gap-2">
            <AppSetupButton tone="portal" />
            <FamilyHelp />
            <PatientNotifications />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-2 sm:px-6 lg:pt-4">{children}</main>
      <AppSetupPrompt />
      <AppIconBadge />
    </div>
  )
}
