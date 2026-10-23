'use client'

import Link from 'next/link'
import { useClerk, useUser } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import { ArrowRight, MessageCircle } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { getMyJoyJourney } from '@/convex/joyHandoff'
import type { QueryResult } from '@/lib/convexUntyped'
import { IconChip, Panel, SectionLabel, StatusBadge, type Tone } from '@/components/patient/ui'
import { BOOKING_STATE, SERVICE_MODE, stageLabel } from '@/lib/joyJourney'
import { usableEmail } from '@/lib/auth/joyLoginEmail'
import { cn } from '@/lib/utils'

/** lib/joyJourney tones in the patient palette. */
const TONE: Record<string, Tone> = {
  amber: 'amber',
  red: 'rose',
  neutral: 'neutral',
  green: 'green',
  teal: 'blue',
}

/**
 * For patients who booked through Joy on WhatsApp: their bookings, where things stand, and what
 * they told Joy. Renders nothing for everyone else.
 */
export function JoyJourneyCard() {
  // The generated `api` type degrades to `any` in the full app build, so the result is typed from the query itself
  const journey = useQuery(api.joyHandoff.getMyJoyJourney) as QueryResult<typeof getMyJoyJourney> | undefined
  const { user } = useUser()
  const { openUserProfile } = useClerk()
  if (!journey) return null
  // Joy patients' logins start with a placeholder address; their own email lets them sign in without a link
  const needsEmail = !!user && !usableEmail(user)

  const { bookings, timeline, intake } = journey
  const latest = bookings[0]

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Your bookings with Joy
          <StatusBadge tone="green">WhatsApp</StatusBadge>
        </span>
      }
      info="Joy is Rehabify’s assistant on WhatsApp. Anything you book with Joy shows up here too, so you can follow it in one place."
      description="Everything you arranged with Joy on WhatsApp"
    >
      {needsEmail && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pt-sun-bg px-4 py-3">
          <p className="text-sm text-pt-sun-fg">Add an email so you can sign in any time, without waiting for a link from Joy.</p>
          <button
            type="button"
            onClick={() => openUserProfile()}
            className="rounded-xl bg-pt-primary px-4 py-2 text-sm font-semibold text-pt-on-primary transition hover:bg-pt-primary-hover active:scale-[0.98]"
          >
            Add email
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-4">
          {latest ? (
            <div className="space-y-2 rounded-2xl bg-pt-sunken p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={TONE[BOOKING_STATE[latest.state].tone] ?? 'neutral'} dot>
                  {BOOKING_STATE[latest.state].label}
                </StatusBadge>
                <StatusBadge>{SERVICE_MODE[latest.mode]}</StatusBadge>
              </div>
              {latest.startTime && (
                <p className="text-[15px] font-semibold text-pt-ink">{format(latest.startTime, 'EEEE d MMMM · h:mm a')}</p>
              )}
              <p className="text-sm text-pt-muted">
                {latest.physioName ? `With ${latest.physioName}` : 'Your physio will be confirmed soon'} · {latest.durationMinutes} min
              </p>
              {latest.bookingCode && (
                <Link
                  href={`/v/${latest.bookingCode}`}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-pt-ink hover:underline"
                >
                  {latest.mode === 'online' && latest.state === 'confirmed' ? 'Open your video link' : 'Track this booking'}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl bg-pt-sunken p-4">
              <IconChip icon={MessageCircle} tone="green" />
              <p className="text-sm text-pt-muted">You haven&apos;t booked through Joy yet.</p>
            </div>
          )}

          {intake && (intake.summary || intake.chiefComplaint) && (
            <div className="space-y-1.5">
              <SectionLabel>What you told Joy</SectionLabel>
              <p className="text-sm leading-relaxed text-pt-ink">{intake.summary ?? intake.chiefComplaint}</p>
              {(intake.bodyAreas.length > 0 || intake.painScore !== null) && (
                <p className="text-xs text-pt-muted">
                  {intake.bodyAreas.join(', ')}
                  {intake.bodyAreas.length > 0 && intake.painScore !== null ? ' · ' : ''}
                  {intake.painScore !== null ? `pain ${intake.painScore}/10` : ''}
                </p>
              )}
              <p className="text-xs text-pt-faint">
                {intake.sharedWithClinician
                  ? 'Your physiotherapist can see this, so you don’t have to repeat yourself.'
                  : 'You chose not to share this with your physiotherapist.'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <SectionLabel>Where things stand</SectionLabel>
          {timeline.length === 0 ? (
            <p className="text-sm text-pt-muted">Nothing yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-pt-line-strong pl-4">
              {timeline.slice(0, 6).map((event, i) => (
                <li key={event._id} className="relative">
                  <span
                    className={cn(
                      'absolute rounded-full',
                      i === 0 ? '-left-[21.5px] top-1 h-3 w-3 bg-pt-accent ring-[3px] ring-pt-surface' : '-left-[20px] top-1.5 h-2 w-2 bg-pt-line-strong'
                    )}
                  />
                  <p className={i === 0 ? 'text-sm font-semibold text-pt-ink' : 'text-sm text-pt-muted'}>{stageLabel(event.stage, 'patient')}</p>
                  <p className="text-xs text-pt-faint">{format(event.occurredAt, 'd MMM, h:mm a')}</p>
                </li>
              ))}
            </ol>
          )}
          {bookings.length > 1 && (
            <p className="pt-1 text-xs text-pt-muted">
              {bookings.length - 1} earlier booking{bookings.length > 2 ? 's' : ''} with Joy
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}
