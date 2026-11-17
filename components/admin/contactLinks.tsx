'use client'

/** Call, WhatsApp and email buttons for a person or clinic (admin pages). */

import { Mail, MessageCircle, Phone } from '@/components/icons'
import { cn } from '@/lib/utils'

/** wa.me wants the full international number: Nigerian 080… becomes 23480… */
export function whatsappHref(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`
  return `https://wa.me/${digits}`
}

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rh-canvas text-rh-ink transition-colors hover:bg-rh-honeydew dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.12]'

export function ContactLinks({ phone, email, name, className }: { phone: string | null; email: string | null; name: string; className?: string }) {
  if (!phone && !email) return <span className={cn('text-xs text-neutral-400', className)}>No contact details</span>
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {phone && (
        <a href={`tel:${phone}`} className={iconButton} aria-label={`Call ${name}`} title={`Call ${phone}`}>
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {phone && (
        <a href={whatsappHref(phone)} target="_blank" rel="noreferrer" className={iconButton} aria-label={`WhatsApp ${name}`} title="WhatsApp">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={iconButton} aria-label={`Email ${name}`} title={email}>
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  )
}
