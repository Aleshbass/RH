'use client'

import { useConsent } from '@/components/consent/ConsentProvider'

/** The visitor's current choice, with the button that reopens the settings. */
export function CookieChoice() {
  const { consent, ready, openSettings } = useConsent()
  const status = !ready
    ? 'Checking your choice…'
    : !consent
      ? 'You haven’t chosen yet, so only essential cookies are used.'
      : consent.analytics
        ? 'You’ve allowed analytics.'
        : 'Essential cookies only. Analytics is off.'
  return (
    <div className="flex flex-col gap-4 rounded-[2rem] bg-rh-ink p-7 text-white sm:flex-row sm:items-center sm:justify-between sm:p-9">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Your choice</h2>
        <p className="mt-1 text-white/70" aria-live="polite">
          {status}
        </p>
      </div>
      <button
        type="button"
        onClick={openSettings}
        className="h-12 shrink-0 rounded-full bg-rh-lime px-7 text-[15px] font-semibold text-rh-ink transition hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime focus-visible:ring-offset-2 focus-visible:ring-offset-rh-ink"
      >
        Cookie settings
      </button>
    </div>
  )
}
