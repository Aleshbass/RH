/**
 * Money and time settings for the signed-in person's screens (lib/practiceCountries.ts).
 * The physio portal sets them from the physio's practice (PhysioShell) and the patient portal from
 * their physio's (PatientShell). Everyone else keeps Nigeria's: ₦ and Lagos time, as before.
 * Shared formatters read them, so a Ghana physio sees GH₵ and Accra time on every screen.
 */
import { practiceSettings, type PracticeSettings } from '@/lib/practiceCountries'
import { setDisplayTimeZone } from '@/convex/helpers/lagosTime'

const NIGERIA = practiceSettings(null)
let current: PracticeSettings = NIGERIA

/** Called while the portal renders, before its pages do; null/undefined goes back to Nigeria. */
export function setPracticeDisplay(next: PracticeSettings | null | undefined) {
  current = next ?? NIGERIA
  // Every shared time formatter (convex/helpers/lagosTime.ts) follows it
  setDisplayTimeZone(current.timeZone)
}

export function practiceDisplay(): PracticeSettings {
  return current
}

/** Changes when the settings do: a key that remounts a portal's pages so they pick them up. */
export function practiceDisplayKey(settings: PracticeSettings | null | undefined) {
  const s = settings ?? NIGERIA
  return `${s.countryCode}|${s.currency}|${s.timeZone}`
}
