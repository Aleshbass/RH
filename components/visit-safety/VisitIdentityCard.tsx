'use client'

/**
 * "Who's at your door": the physio coming to a patient's home, with their photo, licence number,
 * Rehabify ID and the door code. Live: it turns to "Checked in" the moment the physio enters the
 * code, so the patient knows the person at the door is the one Rehabify sent.
 * Used on the patient's dashboard and on /visit/<token> (no sign-in).
 */

import Image from 'next/image'
import { BadgeCheck, CheckCircle2, Clock, MapPin, ShieldCheck, TriangleAlert, UserRound } from '@/components/icons'
import { lagosTime } from '@/convex/helpers/lagosTime'
import { cn } from '@/lib/utils'
import type { VisitIdentity } from './safetyApi'

export function VisitIdentityCard({ visit, className }: { visit: VisitIdentity; className?: string }) {
  const { physio } = visit
  const first = physio.firstName
  const done = visit.stage === 'left'

  const status = done
    ? { icon: CheckCircle2, text: `Visit finished at ${visit.leftAt ? lagosTime(visit.leftAt) : '—'}`, tone: 'bg-pt-neutral-bg text-pt-neutral-fg' }
    : visit.verified
      ? { icon: BadgeCheck, text: `${first} checked in with your code at ${visit.arrivedAt ? lagosTime(visit.arrivedAt) : '—'}`, tone: 'bg-pt-green-bg text-pt-green-fg' }
      : visit.stage === 'arrived'
        ? { icon: ShieldCheck, text: `${first} has arrived`, tone: 'bg-pt-green-bg text-pt-green-fg' }
        : { icon: MapPin, text: `On the way since ${lagosTime(visit.onTheWayAt)}`, tone: 'bg-pt-blue-bg text-pt-blue-fg' }

  return (
    <section className={cn('overflow-hidden rounded-[1.75rem] bg-pt-surface text-pt-ink shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.06)]', className)}>
      <div className="flex items-center gap-4 p-5 sm:p-6">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-pt-sunken">
          {physio.imageUrl ? (
            <Image src={physio.imageUrl} alt={`Photo of ${physio.name}`} fill sizes="80px" className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-pt-muted">
              <UserRound className="h-8 w-8" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-pt-muted">{done ? 'Your physio today' : 'Coming to your home'}</p>
          <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight">{physio.name}</h2>
          <p className="mt-0.5 text-sm text-pt-muted">Licensed physiotherapist · Rehabify</p>
          {(physio.licenseNumber || physio.staffNumber) && (
            <p className="mt-1 text-xs text-pt-muted">
              {physio.licenseNumber && <>Licence {physio.licenseNumber}</>}
              {physio.licenseNumber && physio.staffNumber && ' · '}
              {physio.staffNumber && <>ID {physio.staffNumber}</>}
            </p>
          )}
        </div>
      </div>

      <div className={cn('mx-5 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold sm:mx-6', status.tone)} aria-live="polite">
        <status.icon className="h-4 w-4 shrink-0" />
        {status.text}
      </div>

      {!done && !visit.verified && visit.doorCode && (
        <div className="p-5 sm:p-6">
          <p className="text-sm text-pt-muted">When {first} arrives, check their face matches this photo. Then give them your code:</p>
          <p className="mt-3 text-center font-mono text-5xl font-semibold tracking-[0.35em] text-pt-ink" aria-label={`Door code ${visit.doorCode.split('').join(' ')}`}>
            {visit.doorCode}
          </p>
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-pt-amber-bg p-3 text-sm text-pt-amber-fg">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Only give the code to the person in the photo. If someone else comes, don’t let them in. Message Joy on WhatsApp or call us.
          </p>
        </div>
      )}

      {!done && visit.verified && visit.endTime && (
        <p className="flex items-center gap-2 p-5 text-sm text-pt-muted sm:p-6">
          <Clock className="h-4 w-4" />
          Your visit runs until about {lagosTime(visit.endTime)}.
        </p>
      )}
      {done && <div className="h-5" />}
    </section>
  )
}
