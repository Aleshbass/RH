'use client'

import { Component, createContext, useContext, type ReactNode } from 'react'
import { useUser } from '@clerk/nextjs'
import { useConvexAuth, useQuery } from 'convex/react'
import { BadgeCheck, GraduationCap, Building2, Hourglass, Stethoscope, User } from '@/components/icons'
import type { LearnerTagKind } from '@/lib/learn/catalog'
import { cn } from '@/lib/utils'
import { learnPlatformApi, type LearnerIdentity, type SignedInLearner } from './learnApi'

// `null`: no provider above (pages outside the Learn shell query directly)
const IdentityContext = createContext<LearnerIdentity | undefined | null>(null)

function useIdentityQuery(): LearnerIdentity | undefined {
  const { isLoading } = useConvexAuth()
  const identity = useQuery(learnPlatformApi.identity, isLoading ? 'skip' : {})
  return isLoading ? undefined : identity
}

function IdentityQuery({ children }: { children: ReactNode }) {
  return <IdentityContext.Provider value={useIdentityQuery()}>{children}</IdentityContext.Provider>
}

/** Used when the identity query fails (e.g. the site is live before its Convex functions): Clerk still knows who is signed in. */
function ClerkOnlyIdentity({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser()
  const value: LearnerIdentity | undefined = !isLoaded
    ? undefined
    : !isSignedIn
      ? { signedIn: false }
      : {
          signedIn: true,
          firstName: user?.firstName ?? '',
          tag: { kind: 'learner', label: 'Learner', detail: null, verified: false },
          needsWelcome: false,
          profile: null,
          canJoinAsClinician: false,
          hasDashboard: true,
          mskLearner: false,
        }
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
}

class IdentityBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[learn] learner identity unavailable, using the Clerk session only:', error)
  }

  render() {
    return this.state.failed ? <ClerkOnlyIdentity>{this.props.children}</ClerkOnlyIdentity> : <IdentityQuery>{this.props.children}</IdentityQuery>
  }
}

/** One identity query for the whole Learn page (header, home, course pages). */
export function LearnerIdentityProvider({ children }: { children: ReactNode }) {
  return <IdentityBoundary>{children}</IdentityBoundary>
}

/**
 * Who is on Learn. `undefined` while loading. Waits for Convex auth so a signed-in visitor
 * never flashes the signed-out header.
 */
export function useLearnerIdentity(): LearnerIdentity | undefined {
  const provided = useContext(IdentityContext)
  // Hooks run in the same order either way: the direct query is skipped under a provider
  const { isLoading } = useConvexAuth()
  const direct = useQuery(learnPlatformApi.identity, provided !== null || isLoading ? 'skip' : {})
  if (provided !== null) return provided
  return isLoading ? undefined : direct
}

const TAG_STYLE: Record<LearnerTagKind, { className: string; icon: typeof User }> = {
  team: { className: 'bg-rh-ink text-white', icon: BadgeCheck },
  rehabify_physio: { className: 'bg-rh-ink text-white', icon: BadgeCheck },
  clinic_owner: { className: 'bg-rh-ink text-white', icon: Building2 },
  clinic_team: { className: 'bg-rh-ink text-white', icon: Building2 },
  physio_pending: { className: 'bg-rh-bone text-rh-ink', icon: Hourglass },
  student: { className: 'bg-rh-jasmine text-rh-ink', icon: GraduationCap },
  physio: { className: 'bg-rh-honeydew text-rh-ink', icon: Stethoscope },
  doctor: { className: 'bg-rh-honeydew text-rh-ink', icon: Stethoscope },
  learner: { className: 'bg-rh-cream text-rh-ink ring-1 ring-inset ring-rh-ink/10', icon: User },
}

/** "Rehabify physio ✓", "Physio student", "Clinic owner"… */
export function TagBadge({ tag, size = 'sm', className }: { tag: SignedInLearner['tag']; size?: 'xs' | 'sm'; className?: string }) {
  const style = TAG_STYLE[tag.kind]
  const Icon = style.icon
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full font-semibold',
        size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        style.className,
        className
      )}
    >
      <Icon className={cn('shrink-0', size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5', tag.verified && 'text-rh-lime')} />
      <span className="truncate">{tag.label}</span>
    </span>
  )
}
