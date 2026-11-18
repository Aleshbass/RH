'use client'

/**
 * The bar shown while an admin is viewing Rehabify as someone else (convex/adminViewAs.ts,
 * app/support/view-as). It stays on every page until they press End, which signs out of that
 * person's account. Shown only while the signed-in account is the one the link opened.
 */
import { useEffect, useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import { Eye } from '@/components/icons'
import { safeSignOut } from '@/lib/auth/safeSignOut'

export const VIEW_AS_KEY = 'rh_view_as_v1'

type ViewAs = { name: string; admin: string; clerkUserId: string | null; at: number }

function read(): ViewAs | null {
  try {
    const raw = localStorage.getItem(VIEW_AS_KEY)
    return raw ? (JSON.parse(raw) as ViewAs) : null
  } catch {
    return null
  }
}

function clear() {
  try {
    localStorage.removeItem(VIEW_AS_KEY)
  } catch {
    // Nothing stored
  }
}

export function ViewAsBanner() {
  const { isLoaded, user } = useUser()
  const { signOut } = useClerk()
  const [viewAs, setViewAs] = useState<ViewAs | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    const stored = read()
    // Someone else (or no one) is signed in now: the support view is over
    if (stored && (!user || (stored.clerkUserId && stored.clerkUserId !== user.id))) {
      clear()
      setViewAs(null)
      return
    }
    setViewAs(stored)
  }, [isLoaded, user])

  if (!viewAs || !user) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[200] flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full bg-amber-400 py-1.5 pl-3 pr-1.5 text-xs font-semibold text-black shadow-lg sm:text-sm">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          Viewing as {viewAs.name} · admin support ({viewAs.admin})
        </span>
        <button
          type="button"
          onClick={() => {
            clear()
            void safeSignOut(signOut, '/')
          }}
          className="shrink-0 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white transition hover:bg-black/80"
        >
          End
        </button>
      </div>
    </div>
  )
}
