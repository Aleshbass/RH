/**
 * Keeping patients unidentifiable in Community posts. Plain TypeScript: the composer warns as
 * the physio types, and convex/community.ts refuses the clear identifiers (phone numbers, email
 * addresses, a title before a name) whatever the browser sent.
 */

export type PrivacyIssue = 'phone' | 'email' | 'name' | 'date' | 'id_number'

const CHECKS: { issue: PrivacyIssue; pattern: RegExp; blocking: boolean }[] = [
  { issue: 'email', pattern: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, blocking: true },
  // Nigerian mobiles (080…, +234 80…) and any long run of digits
  { issue: 'phone', pattern: /(?:\+?234[\s-]?|\b0)[789][01](?:[\s-]?\d){8}\b|\b\d{10,11}\b/, blocking: true },
  { issue: 'name', pattern: /\b(?:Mr|Mrs|Miss|Ms|Mx|Master|Chief|Alhaji|Alhaja|Pastor|Prof|Engr|Barr)\.?\s+[A-Z][a-z]+/, blocking: true },
  { issue: 'id_number', pattern: /\b(?:NIN|BVN|hospital no|hosp no|MRN|folder no)\b/i, blocking: true },
  {
    issue: 'date',
    pattern: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i,
    blocking: false,
  },
]

export const PRIVACY_MESSAGE: Record<PrivacyIssue, string> = {
  email: 'Remove the email address.',
  phone: 'Remove the phone number.',
  name: 'Remove the name. Use “the patient” or an age and job instead.',
  id_number: 'Remove any ID or hospital number.',
  date: 'Exact dates can identify a patient. Say “6 weeks ago” instead.',
}

export function privacyIssues(text: string) {
  return CHECKS.filter((c) => c.pattern.test(text)).map((c) => ({ issue: c.issue, blocking: c.blocking, message: PRIVACY_MESSAGE[c.issue] }))
}

/** The first issue that stops a post being saved, or null. */
export function blockingPrivacyIssue(text: string) {
  return privacyIssues(text).find((i) => i.blocking) ?? null
}

export const ANONYMISED_TEXT = 'I’ve removed names, faces, exact dates and anything else that could identify the patient.'
