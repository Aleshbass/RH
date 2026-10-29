'use client'

import Link from 'next/link'
import { MapPin, MessageSquare, Phone } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials, secondaryButtonClass } from '@/components/patient/ui'
import { NAV } from '@/components/patient/shell/navItems'
import { useCareHome } from '@/components/patient/careHome'
import { cn } from '@/lib/utils'

/**
 * Clinic mode, on Home: the clinic looking after them, their clinicians, and one tap to call or
 * message. Renders nothing for patients who aren't with a clinic.
 */
export function YourClinicCard() {
  const { clinic, clinicians } = useCareHome()
  if (!clinic) return null
  const place = [clinic.address, clinic.city].filter(Boolean).join(', ')

  return (
    <section className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clinic.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pt-primary text-sm font-bold text-pt-on-primary">
              {initials(clinic.name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium text-pt-faint">Your clinic</p>
            <p className="truncate text-base font-semibold tracking-tight text-pt-ink">{clinic.name}</p>
            {place && (
              <p className="flex items-center gap-1 truncate text-xs text-pt-muted">
                <MapPin className="h-3 w-3 shrink-0" />
                {place}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {clinic.phone && (
            <Button asChild className={cn(secondaryButtonClass, 'h-10 flex-1 px-4 sm:flex-none')}>
              <a href={`tel:${clinic.phone.replace(/\s+/g, '')}`}>
                <Phone className="mr-2 h-4 w-4" />
                Call
              </a>
            </Button>
          )}
          <Button asChild className={cn(secondaryButtonClass, 'h-10 flex-1 px-4 sm:flex-none')}>
            <Link href={NAV.messages.href}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Message
            </Link>
          </Button>
        </div>
      </div>

      {clinicians.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-pt-line pt-4">
          {clinicians.map((person) => (
            <span key={person._id} className="flex items-center gap-2 rounded-full bg-pt-sunken py-1 pl-1 pr-3">
              <Avatar className="h-7 w-7">
                <AvatarImage src={person.imageUrl ?? undefined} alt="" />
                <AvatarFallback className="bg-pt-green-bg text-[10px] font-semibold text-pt-green-fg">{initials(person.name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-pt-ink">{person.name}</span>
              <span className="text-xs text-pt-faint">Your physio</span>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
