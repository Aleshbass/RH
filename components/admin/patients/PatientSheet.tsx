'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { AlertTriangle, ArrowUpRight, Pencil, SearchX } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, StatusBadge, cardClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { PhysioSheet } from '@/components/admin/physios/PhysioSheet'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { cn } from '@/lib/utils'
import { ContactButtons, SourceTags } from './PatientBits'
import { EditDetails } from './EditDetails'
import { SuggestedPhysios } from './SuggestedPhysios'
import { FORMAT_LABEL, MISSING_LABEL, patientApi, placeText, type PatientRecord } from './patientApi'

const sectionTitle = 'text-sm font-semibold text-rh-ink dark:text-white'
const muted = 'text-xs text-neutral-500 dark:text-neutral-400'

const RELATION_SOURCE: Record<string, string> = {
  joy_whatsapp: 'Booked through Joy',
  marketplace: 'Rehabify Care (Find a Physio or paired by the team)',
  booking_link: 'Booked from the physio’s link',
  existing_patient: 'Added by the physio (their own patient)',
  invite: 'Invited by the physio',
  referred: 'Referred',
  clinic_direct: 'Clinic’s own patient',
  rehabify_referral: 'Sent to the clinic by Rehabify',
}

const STAGE_LABEL: Record<string, string> = {
  conversation_started: 'Started chatting with Joy',
  referral_linked: 'Linked to a referral',
  triage_completed: 'Finished triage',
  eligibility_passed: 'Can be booked',
  eligibility_blocked: 'Couldn’t be matched',
  matches_shown: 'Shown physios',
  booking_held: 'Held a time',
  payment_link_sent: 'Sent a payment link',
  payment_completed: 'Paid',
  payment_failed: 'Payment failed',
  provider_requested: 'Physio asked to accept',
  provider_accepted: 'Physio accepted',
  provider_rejected: 'Physio declined',
  provider_timeout: 'Physio didn’t answer in time',
  awaiting_admin_schedule: 'Waiting for the team to schedule',
  admin_scheduled: 'Scheduled by the team',
  rescheduled: 'Rescheduled',
  meeting_link_sent: 'Sent the video link',
  reminder_sent: 'Reminder sent',
  call_joined: 'Joined the call',
  session_completed: 'Session done',
  hold_expired: 'Held time expired',
  abandoned: 'Stopped replying',
  cancelled: 'Cancelled',
  handed_to_human: 'Handed to the care team',
}

const SIGNAL_LABEL: Record<string, string> = {
  awaiting_physio: 'Paid, waiting on physio',
  unpaid_checkout: 'Started booking, not paid',
  joy_matching: 'Joy, needs a physio',
  browsing: 'Browsing Find a Physio',
  no_physio: 'No physio yet',
}

const when = (t: number) => format(t, 'd MMM yyyy, h:mmaaa')

/**
 * Right-hand drawer for one patient: who they are, what they need, where they came from, who
 * they're with, and physios they could be paired with. Opens from every list that names a
 * patient, so the record is the same wherever the team starts.
 */
export function PatientSheet({ patientId, onClose }: { patientId: string | null; onClose: () => void }) {
  // Keep the last patient while the drawer slides closed
  const [shownId, setShownId] = useState(patientId)
  if (patientId && patientId !== shownId) setShownId(patientId)
  const record = useQuery(patientApi.record, shownId ? { patientId: shownId } : 'skip')
  const [physioId, setPhysioId] = useState<string | null>(null)

  return (
    <>
      <Sheet open={Boolean(patientId)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto border-black/[0.06] bg-rh-canvas p-0 dark:border-white/[0.08] dark:bg-rh-ink sm:max-w-2xl"
        >
          {record === null ? (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>Patient not found</SheetTitle>
                <SheetDescription>The account may have been deleted or isn&apos;t a patient.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState icon={<SearchX />} title="We couldn't find this patient" description="The account may have been deleted or isn't a patient." />
              </div>
            </>
          ) : record === undefined ? (
            <div className="space-y-3 p-5">
              <SheetHeader className="sr-only">
                <SheetTitle>Loading patient</SheetTitle>
                <SheetDescription>Loading the patient record.</SheetDescription>
              </SheetHeader>
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <Body record={record} onOpenPhysio={setPhysioId} />
          )}
        </SheetContent>
      </Sheet>
      <PhysioSheet physioId={physioId} preview={null} onClose={() => setPhysioId(null)} />
    </>
  )
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className={muted}>{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium text-rh-ink dark:text-white">{children}</dd>
    </div>
  )
}

const notGiven = <span className="font-normal text-[#b4690e] dark:text-amber-300">Not given</span>

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn(cardClass, 'space-y-3 p-4')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={sectionTitle}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Body({ record, onOpenPhysio }: { record: PatientRecord; onOpenPhysio: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const intake = record.intake
  const flagged = intake?.redFlags.filter((f) => f.flagged) ?? []
  const openSignals = record.signals.filter((s) => s.status === 'open')

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="gap-2.5 border-b border-black/[0.05] bg-white px-5 pb-5 pt-5 text-left dark:border-white/[0.06] dark:bg-rh-ink-2">
        <div className="pr-8">
          <SheetTitle className="break-words text-lg font-semibold leading-tight text-rh-ink dark:text-white">{record.name}</SheetTitle>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {record.rehabifyId && <RehabifyId value={record.rehabifyId} />}
            <SourceTags sources={record.sources} />
            {openSignals.map((s) => (
              <StatusBadge key={s.id} tone="red">
                {SIGNAL_LABEL[s.kind] ?? s.kind}
              </StatusBadge>
            ))}
          </div>
        </div>
        <SheetDescription className="text-sm text-neutral-600 dark:text-neutral-300">
          {[record.age !== null ? `${record.age} years` : null, placeText(record) || null, record.complaint, record.format ? FORMAT_LABEL[record.format] : null]
            .filter(Boolean)
            .join(' · ') || 'We know very little about this patient yet.'}
        </SheetDescription>
        <div className="flex flex-wrap gap-1.5">
          <ContactButtons phone={record.phone} email={record.email} />
          <Button asChild size="sm" variant="outline" className={cn(softButtonClass, 'h-8')}>
            <Link href={`/dashboard/admin/users/${record.userId}`}>
              Account
              <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-4 p-4 sm:p-5">
        {(flagged.length > 0 || intake?.triageLevel === 'red') && (
          <div className="flex gap-2 rounded-2xl bg-rh-blush p-3 text-sm text-[#be123c] dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Red flag: urgent care, not a routine booking</p>
              {flagged.length > 0 && <p className="mt-0.5">{flagged.map((f) => `${f.question}: ${f.answer}`).join(' · ')}</p>}
            </div>
          </div>
        )}

        {record.missing.length > 0 && !editing && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rh-peach p-3 text-sm text-[#b4690e] dark:bg-amber-400/10 dark:text-amber-300">
            <span>
              Needed to match them: <strong>{record.missing.map((m) => MISSING_LABEL[m] ?? m).join(', ')}</strong>
            </span>
            <Button size="sm" onClick={() => setEditing(true)} className={cn(primaryButtonClass, 'h-8')}>
              Add details
            </Button>
          </div>
        )}

        <Section
          title="Who they are"
          action={
            !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className={cn(softButtonClass, 'h-8')}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            )
          }
        >
          {editing ? (
            <EditDetails record={record} onDone={() => setEditing(false)} />
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Age">{record.age !== null ? `${record.age}${record.dateOfBirth ? ` (born ${record.dateOfBirth.slice(0, 10)})` : ''}` : notGiven}</Fact>
              <Fact label="Gender">{record.gender ? record.gender.replace(/_/g, ' ') : notGiven}</Fact>
              <Fact label="State">{record.state ?? notGiven}</Fact>
              <Fact label="City / area">{[record.area, record.city].filter(Boolean).join(', ') || notGiven}</Fact>
              <Fact label="Language">{record.language ?? 'English'}</Fact>
              <Fact label="Phone">{record.phone ?? notGiven}</Fact>
              {record.address && <Fact label="Address" wide>{record.address}</Fact>}
              {record.emergencyContact && (
                <Fact label="Emergency contact" wide>
                  {record.emergencyContact.name} ({record.emergencyContact.relationship}) · {record.emergencyContact.phone}
                </Fact>
              )}
              <Fact label="Joined">{format(record.joinedAt, 'd MMM yyyy')}</Fact>
              {record.clinicName && <Fact label="Clinic">{record.clinicName}</Fact>}
              {record.careTeamNotes && <Fact label="Care team notes" wide>{record.careTeamNotes}</Fact>}
              {record.careDetailsUpdatedAt && (
                <p className={cn(muted, 'col-span-2')}>
                  Updated by {record.careDetailsUpdatedBy ?? 'the care team'} {formatDistanceToNowStrict(record.careDetailsUpdatedAt, { addSuffix: true })}
                </p>
              )}
            </dl>
          )}
        </Section>

        <Section title="What they need">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Fact label="Main complaint" wide>{record.complaint ?? notGiven}</Fact>
            <Fact label="Video or home visit">{record.format ? FORMAT_LABEL[record.format] : notGiven}</Fact>
            {intake?.painScore !== null && intake?.painScore !== undefined && <Fact label="Pain">{intake.painScore}/10</Fact>}
            {(intake?.bodyAreas.length ?? 0) > 0 && <Fact label="Where">{intake!.bodyAreas.join(', ')}</Fact>}
            {intake?.triageLevel && (
              <Fact label="Joy triage">
                <StatusBadge tone={intake.triageLevel === 'red' ? 'red' : intake.triageLevel === 'amber' ? 'amber' : 'green'}>
                  {intake.triageLevel === 'red' ? 'Urgent care' : intake.triageLevel === 'amber' ? 'Clinician review soon' : 'Routine'}
                </StatusBadge>
              </Fact>
            )}
            {(intake?.duration || intake?.onset) && <Fact label="How long">{[intake.duration, intake.onset].filter(Boolean).join(' · ')}</Fact>}
            {intake?.preferredTimes && <Fact label="Best times">{intake.preferredTimes}</Fact>}
            {intake?.goals && <Fact label="Goals" wide>{intake.goals}</Fact>}
            {(intake?.medicalHistory || record.medicalHistory) && <Fact label="Medical history" wide>{intake?.medicalHistory ?? record.medicalHistory}</Fact>}
            {intake?.medications && <Fact label="Medicines" wide>{intake.medications}</Fact>}
            {intake?.clinicianSummary && <Fact label="Joy's summary for the physio" wide>{intake.clinicianSummary}</Fact>}
          </dl>
          {intake && intake.answers.length > 0 && (
            <details className="rounded-xl bg-rh-canvas p-3 text-sm dark:bg-white/[0.04]">
              <summary className="cursor-pointer font-medium text-rh-ink dark:text-white">All {intake.answers.length} answers to Joy</summary>
              <dl className="mt-2 space-y-1.5">
                {intake.answers.map((a, i) => (
                  <div key={i}>
                    <dt className={muted}>{a.question}</dt>
                    <dd className="text-rh-ink dark:text-white">{a.answer}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {intake && (
            <p className={muted}>
              From Joy, {formatDistanceToNowStrict(intake.receivedAt, { addSuffix: true })}
              {intake.consentGiven === false ? ' · the patient hasn’t agreed to share this with their physio' : ''}
            </p>
          )}
        </Section>

        <Section title="Their physio">
          {record.physios.length === 0 ? (
            <p className="text-sm font-medium text-[#b4690e] dark:text-amber-300">No physio yet. Pair them below.</p>
          ) : (
            <ul className="space-y-2">
              {record.physios.map((p) => (
                <li key={p.physioId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rh-canvas px-3 py-2.5 dark:bg-white/[0.04]">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onOpenPhysio(p.physioId)} className="text-sm font-semibold text-rh-ink underline-offset-2 hover:underline dark:text-white">
                      {p.name}
                    </button>
                    <p className={muted}>
                      {[p.source ? RELATION_SOURCE[p.source] ?? p.source : 'Linked', p.referredBy ? `referred by ${p.referredBy}` : null, p.clinicName, `since ${format(p.since, 'd MMM yyyy')}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {p.primary && <StatusBadge tone="green">Main physio</StatusBadge>}
                </li>
              ))}
            </ul>
          )}
          {record.pastPhysios.length > 0 && (
            <p className={muted}>
              Before: {record.pastPhysios.map((p) => `${p.name}${p.endedAt ? ` (until ${format(p.endedAt, 'd MMM')})` : ''}`).join(', ')}
            </p>
          )}
          <div className="border-t border-black/[0.05] pt-3 dark:border-white/[0.06]">
            <p className="mb-2 text-sm font-semibold text-rh-ink dark:text-white">{record.physios.length ? 'Pair with another physio' : 'Suggested physios'}</p>
            <SuggestedPhysios record={record} onOpenPhysio={onOpenPhysio} />
          </div>
        </Section>

        {record.referrals.length > 0 && (
          <Section title="Referrals">
            <ul className="space-y-2">
              {record.referrals.map((r) => (
                <li key={r.id} className="rounded-xl bg-rh-canvas px-3 py-2.5 text-sm dark:bg-white/[0.04]">
                  <p className="font-semibold text-rh-ink dark:text-white">
                    {r.from} <span className="font-normal text-neutral-500">· {format(r.createdAt, 'd MMM yyyy')} · {r.status.replace(/_/g, ' ')}</span>
                  </p>
                  <p className="text-rh-ink/80 dark:text-white/80">
                    {[r.condition, r.reason, r.careSetting ? `wants ${r.careSetting.replace(/_/g, ' ')}` : null, r.priority && r.priority !== 'standard' ? `${r.priority} priority` : null, r.recommendedSessions ? `${r.recommendedSessions} sessions advised` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {r.clinicalNotes && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-300">{r.clinicalNotes}</p>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Bookings and sessions">
          {record.bookings.length === 0 && record.upcoming.length === 0 && record.past.length === 0 ? (
            <p className={muted}>No bookings or sessions yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {record.bookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-rh-ink dark:text-white">{b.line}</span>
                  {b.physioName && <span className={muted}>with {b.physioName}</span>}
                  <StatusBadge tone={b.awaitingPhysio ? 'red' : b.paid ? 'green' : 'neutral'}>
                    {b.awaitingPhysio ? 'Waiting on physio' : b.paid ? b.status.replace(/_/g, ' ') : 'Not paid'}
                  </StatusBadge>
                  {b.test && <StatusBadge tone="amber">Test payment</StatusBadge>}
                </li>
              ))}
              {record.upcoming.map((a) => (
                <li key={a.id} className="text-rh-ink dark:text-white">
                  Next: {when(a.startTime)} · {a.online ? 'video' : 'in person'}
                  {a.physioName ? ` with ${a.physioName}` : ''}
                </li>
              ))}
              {record.past.map((a) => (
                <li key={a.id} className={muted}>
                  {when(a.startTime)} · {a.status.replace(/_/g, ' ')}
                  {a.physioName ? ` with ${a.physioName}` : ''}
                </li>
              ))}
            </ul>
          )}
          <Link href="/dashboard/admin/marketplace-bookings" className="text-xs font-semibold text-rh-ink underline-offset-2 hover:underline dark:text-white">
            All bookings
          </Link>
        </Section>

        {record.journey.length > 0 && (
          <Section title="On Joy">
            <ol className="space-y-1 text-sm">
              {record.journey.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{format(e.occurredAt, 'd MMM, h:mmaaa')}</span>
                  <span className="text-rh-ink dark:text-white">
                    {STAGE_LABEL[e.stage] ?? e.stage.replace(/_/g, ' ')}
                    {e.note ? <span className="text-neutral-500"> · {e.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {record.signals.length > 0 && (
          <Section title="Looking for care">
            <ul className="space-y-1 text-sm">
              {record.signals.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={s.status === 'open' ? 'red' : 'neutral'}>{s.status === 'open' ? 'Open' : 'Handled'}</StatusBadge>
                  <span className="text-rh-ink dark:text-white">{SIGNAL_LABEL[s.kind] ?? s.kind}</span>
                  <span className={muted}>
                    {format(s.createdAt, 'd MMM, h:mmaaa')}
                    {s.handledNote ? ` · ${s.handledNote}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  )
}
