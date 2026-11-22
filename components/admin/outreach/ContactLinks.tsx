'use client'

/**
 * Employer outreach: ways to reach someone besides email. In Nigeria a WhatsApp message or a call
 * often works better than a cold email (owner, 22 Nov 2026), so every company and person phone
 * gets Call and WhatsApp buttons (numbers as +234), and LinkedIn opens as a button.
 */

import { Linkedin, Phone, WhatsApp } from '@/components/icons'
import { phoneLinks } from '@/lib/employerOutreach'
import { cn } from '@/lib/utils'

const chip =
  'inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-rh-honeydew px-2 text-xs font-medium text-rh-ink transition-colors hover:bg-[#e2f7d8] focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.1]'

/** The number as +234…, then Call and (for mobiles) WhatsApp. `compact` shows icons only. */
export function PhoneActions({ phone, compact = false, className }: { phone: string; compact?: boolean; className?: string }) {
  const links = phoneLinks(phone)
  if (!links) return <span className="text-xs text-neutral-500">{phone}</span>
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {!compact && <span className="text-xs tabular-nums text-rh-ink dark:text-white">{links.e164}</span>}
      <a href={links.tel} className={chip} aria-label={`Call ${links.e164}`} title={`Call ${links.e164}`}>
        <Phone className="h-3 w-3" />
        {!compact && 'Call'}
      </a>
      {links.mobile && (
        <a
          href={links.whatsapp}
          target="_blank"
          rel="noreferrer"
          className={chip}
          aria-label={`WhatsApp ${links.e164}`}
          title={`WhatsApp ${links.e164}`}
        >
          <WhatsApp className="h-3 w-3" />
          {!compact && 'WhatsApp'}
        </a>
      )}
    </span>
  )
}

export function LinkedInButton({ url, label = 'LinkedIn' }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className={chip}>
      <Linkedin className="h-3 w-3" /> {label}
    </a>
  )
}
