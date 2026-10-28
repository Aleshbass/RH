import Image from 'next/image'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { REPORT_GOAL_STATUS_LABELS, type ReportSnapshot } from '@/convex/helpers/progressReport'

/**
 * A progress report as the referrer reads it: on the shared link (/report/<token>), in the
 * physio's preview, and on paper. Always light, like paper, and with no hooks, so the shared
 * page can render it on the server. Inside the dashboard, print it through ReportPrintPortal.
 */

const LAGOS = 'Africa/Lagos'
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: LAGOS })
const longDay = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: LAGOS })

/** Date of birth as stored (ISO date or a timestamp), as "4 March 1980" */
function birthDate(value?: string) {
  if (!value) return null
  const asNumber = Number(value)
  const date = Number.isFinite(asNumber) && value.trim() !== '' && !value.includes('-') ? new Date(asNumber) : new Date(value)
  return Number.isNaN(date.getTime()) ? value : longDay(date.getTime())
}

const CARE_STATUS: Record<string, string> = { active: 'Ongoing', completed: 'Discharged', paused: 'Paused' }

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-8 break-inside-avoid-page', className)}>
      <h2 className="border-b border-neutral-200 pb-2 text-[13px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-neutral-900">{children}</dd>
    </div>
  )
}

const Prose = ({ children }: { children: string }) => <p className="whitespace-pre-line text-sm leading-6 text-neutral-800">{children}</p>

const GOAL_TONE: Record<ReportSnapshot['goals'][number]['status'], string> = {
  met: 'bg-[#e6f9e3] text-[#0f6e1a]',
  reached: 'bg-[#e6f9e3] text-[#0f6e1a]',
  in_progress: 'bg-neutral-100 text-neutral-700',
}

export function ProgressReportDocument({
  report,
  sharedAt,
  className,
}: {
  report: ReportSnapshot
  /** When it was shared; absent in the physio's preview */
  sharedAt?: number
  className?: string
}) {
  const { patient, physio, care, plan, goals, measures, sessions } = report
  const dob = birthDate(patient.dateOfBirth)
  const sessionFacts = [
    { label: 'Attended', value: sessions.planned ? `${sessions.attended} of ${sessions.planned} planned` : String(sessions.attended) },
    { label: 'Cancelled', value: String(sessions.cancelled) },
    { label: 'Missed', value: String(sessions.missed) },
    ...(care.status === 'active' ? [{ label: 'Booked ahead', value: String(sessions.upcoming) }] : []),
  ]

  return (
    <article className={cn('rounded-3xl bg-white p-5 text-neutral-900 sm:p-10 print:rounded-none print:p-0', className)}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={132} height={36} className="h-8 w-auto self-start sm:h-9" />
        <div className="sm:text-right">
          <h1 className="text-xl font-bold tracking-tight">Physiotherapy progress report</h1>
          <p className="mt-0.5 text-sm text-neutral-500">{longDay(sharedAt ?? report.generatedAt)}</p>
        </div>
      </header>

      <dl className="mt-8 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Patient">
          {patient.name}
          {patient.rehabifyId && <span className="ml-2 font-mono text-xs font-normal text-neutral-500">{patient.rehabifyId}</span>}
        </Detail>
        {dob && <Detail label="Date of birth">{dob}</Detail>}
        {report.referrer && (
          <Detail label="Referred by">
            {report.referrer.name}
            {report.referrer.organisation && report.referrer.organisation !== report.referrer.name && (
              <span className="block text-xs font-normal text-neutral-500">{report.referrer.organisation}</span>
            )}
          </Detail>
        )}
        {report.preparedFor && report.preparedFor !== report.referrer?.name && <Detail label="Prepared for">{report.preparedFor}</Detail>}
        <Detail label="Physiotherapist">
          {physio.name}
          {(physio.licenceNumber || physio.clinicName) && (
            <span className="block text-xs font-normal text-neutral-500">
              {[physio.licenceNumber && `Licence ${physio.licenceNumber}`, physio.clinicName].filter(Boolean).join(' · ')}
            </span>
          )}
        </Detail>
        <Detail label="Course of care">
          {CARE_STATUS[care.status] ?? care.status}, from {day(care.startedAt)}
          {care.completedAt ? ` to ${day(care.completedAt)}` : ''}
        </Detail>
      </dl>

      {(care.condition || report.impression) && (
        <Section title="Presentation">
          <dl className="space-y-3">
            {care.condition && <Detail label="Presenting problem">{care.condition}</Detail>}
            {report.impression && (
              <div>
                <dt className="text-xs text-neutral-500">Working impression</dt>
                <dd className="mt-0.5">
                  <Prose>{report.impression}</Prose>
                </dd>
              </div>
            )}
          </dl>
        </Section>
      )}

      <Section title="Attendance">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {sessionFacts.map((fact) => (
            <Detail key={fact.label} label={fact.label}>
              <span className="tabular-nums">{fact.value}</span>
            </Detail>
          ))}
        </dl>
        {plan?.sessionFrequency && <p className="mt-3 text-sm text-neutral-600">Planned frequency: {plan.sessionFrequency}</p>}
      </Section>

      {goals.length > 0 && (
        <Section title={plan ? `Goals · ${plan.title}` : 'Goals'}>
          <ul className="divide-y divide-neutral-200">
            {goals.map((goal, index) => (
              <li key={index} className="flex flex-col gap-1.5 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{goal.description}</p>
                  {goal.measure ? (
                    <p className="mt-0.5 text-xs text-neutral-600">
                      {goal.measure.name}: {goal.measure.baseline ? `${goal.measure.baseline} at baseline` : 'no baseline yet'}
                      {goal.measure.latest && goal.measure.latest !== goal.measure.baseline ? `, now ${goal.measure.latest}` : ''}, target {goal.measure.target}
                      {goal.measure.percent !== undefined && goal.status === 'in_progress' ? ` (${goal.measure.percent}% of the way)` : ''}
                    </p>
                  ) : (
                    (goal.targetValue || goal.timeline) && (
                      <p className="mt-0.5 text-xs text-neutral-600">{[goal.targetValue, goal.timeline].filter(Boolean).join(' · ')}</p>
                    )
                  )}
                  {goal.measure && goal.timeline && <p className="text-xs text-neutral-500">By {goal.timeline}</p>}
                </div>
                <span className={cn('inline-flex shrink-0 self-start rounded-full px-2.5 py-0.5 text-[11px] font-semibold', GOAL_TONE[goal.status])}>
                  {REPORT_GOAL_STATUS_LABELS[goal.status]}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {measures.length > 0 && (
        <Section title="Key measures">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-3 pb-2 text-xs text-neutral-500 sm:grid">
            <span>Measure</span>
            <span>First</span>
            <span>Latest</span>
            <span>Change</span>
          </div>
          <ul className="divide-y divide-neutral-200 border-t border-neutral-200 sm:border-t-0">
            {measures.map((m) => (
              <li key={m.seriesKey} className="grid grid-cols-3 gap-x-3 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
                <span className="col-span-3 font-medium sm:col-span-1">{m.name}</span>
                <span className="tabular-nums">
                  {m.baseline}
                  <span className="block text-xs text-neutral-500">{day(m.baselineAt)}</span>
                </span>
                <span className="tabular-nums">
                  {m.visits > 1 ? m.latest : '—'}
                  {m.visits > 1 && <span className="block text-xs text-neutral-500">{day(m.latestAt)}</span>}
                </span>
                <span>
                  <span className={cn('font-medium', m.direction === 'better' && 'text-[#0f6e1a]', m.direction === 'worse' && 'text-[#b42318]')}>
                    {m.change ?? 'Measured once'}
                  </span>
                  {m.beyondMinimal !== undefined && (
                    <span className="block text-xs text-neutral-500">
                      {m.beyondMinimal ? 'Beyond' : 'Within'} measurement error{m.minimal ? ` (${m.minimal})` : ''}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-neutral-500">
            First is the first value recorded in this course of care. A change within measurement error is smaller than the minimal detectable (MDC) or
            clinically important (MCID) change for that measure, so may not be a real change.
          </p>
        </Section>
      )}

      {report.summary && (
        <Section title={care.status === 'completed' ? 'Discharge summary' : 'Progress summary'}>
          <Prose>{report.summary}</Prose>
        </Section>
      )}

      {report.nextSteps && (
        <Section title={care.status === 'completed' ? 'Advice and next steps' : 'Plan and next steps'}>
          <Prose>{report.nextSteps}</Prose>
        </Section>
      )}

      <footer className="mt-10 border-t border-neutral-200 pt-5 text-xs leading-5 text-neutral-500">
        <p>
          Confidential. Prepared by {physio.name} for the patient’s referring clinician
          {sharedAt ? `, and shared with the patient’s agreement on ${longDay(sharedAt)}` : ''}. Please don’t pass it on without the patient’s consent.
        </p>
        <p>Rehabify Limited · RC 6989173 · support@physioaroundme.com</p>
      </footer>
    </article>
  )
}
