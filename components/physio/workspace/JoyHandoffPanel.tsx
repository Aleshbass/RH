'use client'

import { useQuery } from 'convex/react'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, EyeOff, MapPin, MessageCircle, Video } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import type { getJoyHandoffForPhysio } from '@/convex/joyHandoff'
import { IconChip, Panel, StatusBadge } from '@/components/physio/ui'
import type { QueryResult } from '@/lib/convexUntyped'
import { BOOKING_STATE, SERVICE_MODE, stageLabel } from '@/lib/joyJourney'
import { Fact, PainPill } from './shared'

const TRIAGE = {
  green: { label: 'Green triage', tone: 'green' },
  amber: { label: 'Amber triage', tone: 'amber' },
  red: { label: 'Red triage', tone: 'red' },
} as const

function List({ items }: { items: string[] }) {
  return items.length ? <>{items.join(', ')}</> : <span className="text-neutral-400">Not given</span>
}

/**
 * What Joy learned on WhatsApp before this patient was booked with you, their Joy bookings, and
 * where the journey stands. Renders nothing for patients who didn't come through Joy.
 */
export function JoyHandoffPanel({ patientId }: { patientId: Id<'users'> }) {
  // The generated `api` type degrades to `any` in the full app build, so the result is typed from the query itself
  const handoff = useQuery(api.joyHandoff.getJoyHandoffForPhysio, { patientId }) as
    | QueryResult<typeof getJoyHandoffForPhysio>
    | undefined
  if (!handoff) return null

  const { intake, bookings, timeline } = handoff
  const flaggedRedFlags = intake && !intake.withheld ? intake.redFlags.filter((f) => f.flagged) : []

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Joy handoff
          <StatusBadge tone="teal">WhatsApp</StatusBadge>
        </span>
      }
      description="What Joy learned before this patient was booked with you"
    >
      <div className="grid grid-cols-1 gap-5 px-5 pb-5 pt-3 lg:grid-cols-3">
        {/* Intake */}
        <div className="space-y-4 lg:col-span-2">
          {!intake ? (
            <div className="flex items-start gap-3 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.03]">
              <IconChip icon={MessageCircle} tone="teal" />
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Joy hasn&apos;t sent an intake for this patient yet. Ask about their complaint and history at the first session.
              </p>
            </div>
          ) : intake.withheld ? (
            <div className="flex items-start gap-3 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.03]">
              <IconChip icon={EyeOff} tone="neutral" />
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                The patient answered Joy&apos;s questions on {format(intake.receivedAt, 'd MMM')} but chose not to share them with a
                clinician. Take a full history at the first session.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {intake.triageLevel && <StatusBadge tone={TRIAGE[intake.triageLevel].tone}>{TRIAGE[intake.triageLevel].label}</StatusBadge>}
                {intake.painScore !== null && <PainPill score={intake.painScore} />}
                <span className="text-xs text-neutral-400">Received {formatDistanceToNow(intake.receivedAt, { addSuffix: true })}</span>
              </div>

              {intake.chiefComplaint && (
                <p className="text-[15px] font-semibold leading-snug text-rh-ink dark:text-white">{intake.chiefComplaint}</p>
              )}

              {flaggedRedFlags.length > 0 && (
                <div className="space-y-1.5 rounded-2xl bg-rh-blush p-3 text-sm text-[#9f1239] dark:bg-rose-400/10 dark:text-rose-200">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4" /> Red flags to check
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {flaggedRedFlags.map((flag) => (
                      <li key={flag.question}>
                        {flag.question}: <span className="font-medium">{flag.answer}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {intake.clinicianSummary && (
                <div className="rounded-2xl bg-rh-canvas p-4 text-sm leading-relaxed text-neutral-700 dark:bg-white/[0.04] dark:text-neutral-200">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Joy&apos;s summary</p>
                  <p className="whitespace-pre-line">{intake.clinicianSummary}</p>
                </div>
              )}

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Fact label="Where it hurts"><List items={intake.bodyAreas} /></Fact>
                <Fact label="Started">{intake.onset ?? <span className="text-neutral-400">Not given</span>}</Fact>
                <Fact label="How long">{intake.duration ?? <span className="text-neutral-400">Not given</span>}</Fact>
                <Fact label="Goals">{intake.goals ?? <span className="text-neutral-400">Not given</span>}</Fact>
                <Fact label="Makes it worse"><List items={intake.aggravatingFactors} /></Fact>
                <Fact label="Makes it better"><List items={intake.easingFactors} /></Fact>
                <Fact label="Medical history">{intake.medicalHistory ?? <span className="text-neutral-400">Not given</span>}</Fact>
                <Fact label="Medications">{intake.medications ?? <span className="text-neutral-400">Not given</span>}</Fact>
                {intake.preferredTimes && <Fact label="Prefers">{intake.preferredTimes}</Fact>}
                {intake.language && <Fact label="Language">{intake.language}</Fact>}
              </dl>

              {(intake.answers.length > 0 || intake.redFlags.length > flaggedRedFlags.length) && (
                <details className="group rounded-2xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
                  <summary className="cursor-pointer text-sm font-medium text-rh-ink dark:text-rh-lime">
                    Everything the patient told Joy
                  </summary>
                  <dl className="mt-3 space-y-2.5">
                    {[...intake.redFlags, ...intake.answers].map((row, i) => (
                      <div key={`${row.question}-${i}`}>
                        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{row.question}</dt>
                        <dd className="text-sm text-rh-ink dark:text-neutral-100">{row.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </>
          )}
        </div>

        {/* Bookings and journey */}
        <div className="space-y-4">
          {bookings.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Bookings through Joy</p>
              {bookings.map((b) => (
                <div key={b._id} className="space-y-1.5 rounded-2xl bg-rh-canvas p-3 dark:bg-white/[0.03]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={BOOKING_STATE[b.state].tone}>{BOOKING_STATE[b.state].label}</StatusBadge>
                    <StatusBadge>{SERVICE_MODE[b.mode]}</StatusBadge>
                  </div>
                  {b.startTime && (
                    <p className="text-sm font-medium text-rh-ink dark:text-white">
                      {format(b.startTime, 'EEE d MMM · h:mm a')} · {b.durationMinutes} min
                    </p>
                  )}
                  {b.address && b.mode !== 'online' && (
                    <p className="flex items-start gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {b.address}
                    </p>
                  )}
                  {b.mode === 'online' && b.state === 'confirmed' && (
                    <p className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                      <Video className="h-3.5 w-3.5" /> Join from your appointments when it&apos;s time
                    </p>
                  )}
                  {b.providerResponseDueAt && (
                    <p className="text-xs font-medium text-[#b4690e] dark:text-amber-300">
                      Accept on WhatsApp by {format(b.providerResponseDueAt, 'h:mm a, d MMM')}
                    </p>
                  )}
                  {b.bookingCode && <p className="font-mono text-[11px] tracking-wider text-neutral-400">Code {b.bookingCode}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Where Joy left off</p>
            {timeline.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No journey recorded yet.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-rh-lime/20 pl-4 dark:border-white/10">
                {timeline.map((event, i) => (
                  <li key={event._id} className="relative">
                    <span
                      className={
                        i === 0
                          ? 'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-rh-lime ring-2 ring-white dark:ring-rh-ink-2'
                          : 'absolute -left-[20px] top-1.5 h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-600'
                      }
                    />
                    <p className={i === 0 ? 'text-sm font-semibold text-rh-ink dark:text-white' : 'text-sm text-neutral-600 dark:text-neutral-300'}>
                      {stageLabel(event.stage)}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {format(event.occurredAt, 'd MMM, h:mm a')}
                      {event.source === 'joy' ? ' · Joy' : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </Panel>
  )
}
