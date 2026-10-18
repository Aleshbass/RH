'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { getMyJoyJourney } from '@/convex/joyHandoff'
import type { QueryResult } from '@/lib/convexUntyped'
import { IconChip, Panel, StatusBadge } from '@/components/physio/ui'
import { BOOKING_STATE, SERVICE_MODE, stageLabel } from '@/lib/joyJourney'

/**
 * For patients who booked through Joy on WhatsApp: their bookings, where things stand, and what
 * they told Joy. Renders nothing for everyone else.
 */
export function JoyJourneyCard() {
  // The generated `api` type degrades to `any` in the full app build, so the result is typed from the query itself
  const journey = useQuery(api.joyHandoff.getMyJoyJourney) as QueryResult<typeof getMyJoyJourney> | undefined
  if (!journey) return null

  const { bookings, timeline, intake } = journey
  const latest = bookings[0]

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Your bookings with Joy
          <StatusBadge tone="teal">WhatsApp</StatusBadge>
        </span>
      }
      description="Everything you arranged with Joy on WhatsApp"
    >
      <div className="grid grid-cols-1 gap-5 px-5 pb-5 pt-3 md:grid-cols-2">
        <div className="space-y-4">
          {latest ? (
            <div className="space-y-2 rounded-2xl bg-rh-canvas p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={BOOKING_STATE[latest.state].tone}>{BOOKING_STATE[latest.state].label}</StatusBadge>
                <StatusBadge>{SERVICE_MODE[latest.mode]}</StatusBadge>
              </div>
              {latest.startTime && (
                <p className="text-[15px] font-semibold text-rh-night">
                  {format(latest.startTime, 'EEEE d MMMM · h:mm a')}
                </p>
              )}
              <p className="text-sm text-neutral-600">
                {latest.physioName ? `With ${latest.physioName}` : 'Your physio will be confirmed soon'} · {latest.durationMinutes} min
              </p>
              {latest.bookingCode && (
                <Link
                  href={`/v/${latest.bookingCode}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-rh-teal hover:underline"
                >
                  {latest.mode === 'online' && latest.state === 'confirmed' ? 'Open your video link' : 'Track this booking'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl bg-rh-canvas p-4">
              <IconChip icon={MessageCircle} tone="teal" />
              <p className="text-sm text-neutral-600">You haven&apos;t booked through Joy yet.</p>
            </div>
          )}

          {intake && (intake.summary || intake.chiefComplaint) && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">What you told Joy</p>
              <p className="text-sm leading-relaxed text-neutral-700">{intake.summary ?? intake.chiefComplaint}</p>
              {(intake.bodyAreas.length > 0 || intake.painScore !== null) && (
                <p className="text-xs text-neutral-500">
                  {intake.bodyAreas.join(', ')}
                  {intake.bodyAreas.length > 0 && intake.painScore !== null ? ' · ' : ''}
                  {intake.painScore !== null ? `pain ${intake.painScore}/10` : ''}
                </p>
              )}
              <p className="text-xs text-neutral-400">
                {intake.sharedWithClinician
                  ? 'Your physiotherapist can see this, so you don’t have to repeat yourself.'
                  : 'You chose not to share this with your physiotherapist.'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Where things stand</p>
          {timeline.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-rh-teal/20 pl-4">
              {timeline.slice(0, 6).map((event, i) => (
                <li key={event._id} className="relative">
                  <span
                    className={
                      i === 0
                        ? 'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-rh-teal ring-4 ring-rh-mint'
                        : 'absolute -left-[20px] top-1.5 h-2 w-2 rounded-full bg-neutral-300'
                    }
                  />
                  <p className={i === 0 ? 'text-sm font-semibold text-rh-night' : 'text-sm text-neutral-600'}>
                    {stageLabel(event.stage, 'patient')}
                  </p>
                  <p className="text-xs text-neutral-400">{format(event.occurredAt, 'd MMM, h:mm a')}</p>
                </li>
              ))}
            </ol>
          )}
          {bookings.length > 1 && (
            <p className="pt-1 text-xs text-neutral-500">
              {bookings.length - 1} earlier booking{bookings.length > 2 ? 's' : ''} with Joy
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
