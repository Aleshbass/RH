'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from 'convex/react'
import { format } from 'date-fns'
import {
  ArrowRight,
  Calendar,
  CalendarPlus,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Languages,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  Star,
  Stethoscope,
  Video,
} from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { appointmentStatusLabel, type AppointmentStatusFields } from '@/convex/helpers/appointmentStatus'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  InfoTip,
  LoadingBlocks,
  PageContainer,
  PageHeader,
  Panel,
  StatusBadge,
  listRowClass,
  primaryButtonClass,
  secondaryButtonClass,
  type Tone,
} from '@/components/patient/ui'
import { PhysioPhoto } from '@/components/patient/PhysioPhoto'
import { messageHref, physioName, type CareTeamMember } from '@/components/patient/careTeam'
import { PatientAppointmentBookingModal } from '@/components/patient/PatientAppointmentBookingModal'
import { formatKobo } from '@/lib/rehabify-services'
import { cn } from '@/lib/utils'

/** api.appointments.getPatientAppointments (the fields used here) */
type PatientAppointment = AppointmentStatusFields & {
  _id: string
  physiotherapistId: string
  startTime: number
  endTime: number
  serviceType?: string
  appointmentType?: string
  isOnline?: boolean
}

/** api.billing.getPatientInvoices (the fields used here) */
type PatientInvoice = {
  _id: string
  invoiceNumber: string
  clinicName?: string
  totalAmount: number
  payableAmount: number
  status: string
  issueDate: number
  isOverdue: boolean
  canPay: boolean
}

/** api.treatmentPlans.getPatientTreatmentPlans (the fields used here) */
type PlanSummary = {
  _id: string
  physiotherapistId: string
  title: string
  description?: string
  status: string
  startDate: number
  endDate?: number
}

/** api.files.getPatientDocuments */
type PatientDocument = {
  _id: string
  documentType: string
  fileName: string
  fileSize: number
  uploadedAt: number
  sharedWithPhysiotherapist?: boolean
  downloadUrl: string
}

const PLAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'Finished', tone: 'neutral' },
  on_hold: { label: 'Paused', tone: 'amber' },
  draft: { label: 'Being prepared', tone: 'neutral' },
  cancelled: { label: 'Stopped', tone: 'neutral' },
}

const DOCUMENT_TYPES: Record<string, string> = {
  referralLetter: 'Referral letter',
  medicalRecord: 'Medical record',
  insuranceCard: 'Insurance card',
  otherDocument: 'Document',
}

function appointmentTone(status: string): Tone {
  if (status === 'confirmed') return 'green'
  if (status === 'completed') return 'neutral'
  if (status.startsWith('cancelled') || status === 'no_show') return 'rose'
  return 'amber'
}

function invoiceBadge(invoice: PatientInvoice): { label: string; tone: Tone } {
  if (invoice.status === 'paid') return { label: 'Paid', tone: 'green' }
  if (invoice.status === 'void') return { label: 'Cancelled', tone: 'neutral' }
  if (invoice.isOverdue) return { label: 'Overdue', tone: 'rose' }
  return { label: 'To pay', tone: 'amber' }
}

function isOnlineVisit(a: PatientAppointment) {
  return a.appointmentType === 'telehealth' || a.isOnline === true
}

export default function DynamicMyPhysiotherapistPage() {
  const params = useParams()
  const physiotherapistId = params.physiotherapistId as Id<'users'>
  const [bookingOpen, setBookingOpen] = useState(false)
  const [showFullBio, setShowFullBio] = useState(false)

  const careTeam = useQuery(api.patients.getPatientCareTeam) as CareTeamMember[] | undefined
  const member = careTeam?.find((m) => m.physiotherapist._id === physiotherapistId)
  const user = useQuery(api.users.getMyUser) as { _id: Id<'users'>; patientProfileId?: Id<'patientProfiles'> } | null | undefined

  const appointments = useQuery(api.appointments.getPatientAppointments, {}) as PatientAppointment[] | undefined
  const invoices = useQuery(api.billing.getPatientInvoices, {}) as PatientInvoice[] | undefined
  const plans = useQuery(api.treatmentPlans.getPatientTreatmentPlans, user ? { patientId: user._id } : 'skip') as
    | PlanSummary[]
    | undefined
  const documents = useQuery(
    api.files.getPatientDocuments,
    user?.patientProfileId ? { patientProfileId: user.patientProfileId } : 'skip'
  ) as PatientDocument[] | undefined

  if (careTeam === undefined) {
    return (
      <PageContainer>
        <LoadingBlocks rows={4} />
      </PageContainer>
    )
  }

  const backLink = { href: '/dashboard/patient/my-physiotherapist', label: 'My physiotherapists' }

  if (!member) {
    return (
      <PageContainer>
        <PageHeader title="Physiotherapist" back={backLink} />
        <Panel>
          <EmptyState
            icon={Stethoscope}
            title="Not in your care team"
            description="This physiotherapist isn't looking after you at the moment, or the link is out of date."
            action={
              <Button asChild className={primaryButtonClass}>
                <Link href={backLink.href}>See my physiotherapists</Link>
              </Button>
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  const name = physioName(member)
  const firstName = member.physiotherapist.firstName || 'your physio'
  const profile = member.profile
  const now = Date.now()

  const withThisPhysio = (appointments ?? []).filter((a) => a.physiotherapistId === physiotherapistId)
  const upcoming = withThisPhysio
    .filter((a) => a.endTime > now && !a.status.startsWith('cancelled') && a.status !== 'no_show')
    .sort((a, b) => a.startTime - b.startTime)
  const physioPlans = (plans ?? []).filter((p) => p.physiotherapistId === physiotherapistId)
  const sharedDocuments = (documents ?? []).filter((d) => d.sharedWithPhysiotherapist)
  const recentInvoices = (invoices ?? []).slice(0, 3)

  const modes = [
    profile?.offersOnlineSessions && 'Video calls',
    profile?.offersInPersonSessions && 'In person',
  ].filter(Boolean) as string[]
  const bio = profile?.bio?.trim()
  const longBio = (bio?.length ?? 0) > 220

  return (
    <PageContainer>
      <PageHeader
        title="My physiotherapist"
        back={careTeam.length > 1 ? backLink : undefined}
        info="Everything with this physiotherapist in one place: your visits, your plan, and the documents you've shared with them."
      />

      {/* Profile */}
      <section className="rounded-3xl border border-pt-line bg-pt-surface p-5 shadow-pt dark:shadow-none sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <PhysioPhoto name={name} imageUrl={member.physiotherapist.imageUrl} size={88} className="rounded-3xl" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-pt-ink sm:text-2xl">{name}</h2>
                {member.relationship.isPrimary && (
                  <span className="inline-flex items-center gap-1">
                    <StatusBadge tone="green">Main physio</StatusBadge>
                    <InfoTip>Your main physio leads your treatment and writes your plan. Others in your care team can still see you.</InfoTip>
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-pt-muted">
                {member.clinic?.name ?? 'Independent physiotherapist'}
                {member.relationship.startDate ? ` · Seeing you since ${format(member.relationship.startDate, 'MMM yyyy')}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-pt-muted">
              {typeof profile?.averageRating === 'number' && (profile.reviewCount ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-pt-amber-fg" />
                  <span className="font-medium text-pt-ink">{profile.averageRating.toFixed(1)}</span>
                  ({profile.reviewCount} review{profile.reviewCount === 1 ? '' : 's'})
                </span>
              )}
              {profile?.yearsOfExperience ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {profile.yearsOfExperience} years’ experience
                </span>
              ) : null}
              {(profile?.location || member.clinic?.city) && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {profile?.location || member.clinic?.city}
                </span>
              )}
              {(profile?.languagesSpoken?.length ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="h-3.5 w-3.5" />
                  {profile?.languagesSpoken?.join(', ')}
                </span>
              )}
              {modes.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />
                  {modes.join(' · ')}
                </span>
              )}
            </div>

            {(profile?.specializations?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile?.specializations?.map((s) => (
                  <StatusBadge key={s} tone="violet">
                    {s}
                  </StatusBadge>
                ))}
              </div>
            )}

            {bio && (
              <div>
                <p className={cn('whitespace-pre-line text-sm leading-relaxed text-pt-muted', !showFullBio && longBio && 'line-clamp-3')}>{bio}</p>
                {longBio && (
                  <button
                    type="button"
                    onClick={() => setShowFullBio((v) => !v)}
                    className="mt-1 text-sm font-medium text-pt-ink underline-offset-4 hover:underline"
                  >
                    {showFullBio ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 border-t border-pt-line pt-5 sm:flex sm:flex-wrap">
          <Button className={cn(primaryButtonClass, 'h-11')} onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Book a session
          </Button>
          <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
            <Link href={messageHref(physiotherapistId)}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Message {firstName}
            </Link>
          </Button>
          {member.clinic?.contactPhone && (
            <Button asChild className={cn(secondaryButtonClass, 'h-11')}>
              <a href={`tel:${member.clinic.contactPhone.replace(/\s+/g, '')}`}>
                <Phone className="mr-2 h-4 w-4" />
                Call the clinic
              </a>
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Visits */}
        <Panel
          title="Upcoming visits"
          info={`Sessions booked with ${firstName}. Open Appointments to reschedule, cancel or join a video call.`}
          actions={
            <Link href="/dashboard/patient/appointments" className="text-sm font-medium text-pt-muted hover:text-pt-ink">
              All visits
            </Link>
          }
          bodyClassName="px-3 pb-3 pt-2"
        >
          {appointments === undefined ? (
            <LoadingBlocks rows={2} className="px-2" />
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="Nothing booked"
              description={`Book your next session with ${firstName} when you're ready.`}
              className="py-8"
            />
          ) : (
            <ul>
              {upcoming.slice(0, 4).map((a) => (
                <li key={a._id}>
                  <Link href="/dashboard/patient/appointments" className={listRowClass}>
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-pt-sunken leading-none">
                      <span className="text-[10px] font-semibold uppercase text-pt-faint">{format(a.startTime, 'MMM')}</span>
                      <span className="text-base font-semibold tabular-nums text-pt-ink">{format(a.startTime, 'd')}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-pt-ink">{a.serviceType || 'Physiotherapy session'}</span>
                      <span className="block text-xs text-pt-muted">
                        {format(a.startTime, 'EEE, h:mm a')} · {isOnlineVisit(a) ? 'Video call' : 'In person'}
                      </span>
                    </span>
                    <StatusBadge tone={appointmentTone(a.status)}>{appointmentStatusLabel(a, 'patient')}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Treatment plans */}
        <Panel
          title="Treatment plans"
          info={`Plans ${firstName} wrote for you: your goals, the stages of your recovery and your home exercises.`}
          actions={
            <Link href="/dashboard/patient/treatment-plans" className="text-sm font-medium text-pt-muted hover:text-pt-ink">
              Open my plan
            </Link>
          }
          bodyClassName="px-3 pb-3 pt-2"
        >
          {plans === undefined ? (
            <LoadingBlocks rows={2} className="px-2" />
          ) : physioPlans.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No plan yet"
              description={`${firstName} will add your plan after your assessment.`}
              className="py-8"
            />
          ) : (
            <ul>
              {physioPlans.map((plan) => {
                const status = PLAN_STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as Tone }
                return (
                  <li key={plan._id}>
                    <Link href={`/dashboard/patient/treatment-plans/${plan._id}`} className={listRowClass}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pt-green-bg text-pt-green-fg">
                        <ClipboardList className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-pt-ink">{plan.title}</span>
                        <span className="block text-xs text-pt-muted">
                          From {format(plan.startDate, 'd MMM yyyy')}
                          {plan.endDate ? ` to ${format(plan.endDate, 'd MMM yyyy')}` : ''}
                        </span>
                      </span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* Shared documents */}
        <Panel
          title="Shared documents"
          info="Documents you've chosen to share with your physiotherapists. Only shared files are visible to them; the rest stay private to you."
          actions={
            <Link href="/dashboard/patient/records" className="text-sm font-medium text-pt-muted hover:text-pt-ink">
              Manage records
            </Link>
          }
          bodyClassName="px-3 pb-3 pt-2"
        >
          {user?.patientProfileId && documents === undefined ? (
            <LoadingBlocks rows={2} className="px-2" />
          ) : sharedDocuments.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nothing shared yet"
              description="Share scans, reports or referral letters from Records so your physio can see them."
              className="py-8"
            />
          ) : (
            <ul>
              {sharedDocuments.map((doc) => (
                <li key={doc._id} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pt-blue-bg text-pt-blue-fg">
                    <FileText className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-pt-ink">{doc.fileName}</span>
                    <span className="block text-xs text-pt-muted">
                      {DOCUMENT_TYPES[doc.documentType] ?? 'Document'} · {format(doc.uploadedAt, 'd MMM yyyy')}
                    </span>
                  </span>
                  {doc.downloadUrl && (
                    <a
                      href={doc.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${doc.fileName}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Invoices */}
        <Panel
          title="Recent invoices"
          info="Your latest bills across all your care, newest first. Open Invoices to pay or download a receipt."
          actions={
            <Link href="/dashboard/patient/invoices" className="text-sm font-medium text-pt-muted hover:text-pt-ink">
              All invoices
            </Link>
          }
          bodyClassName="px-3 pb-3 pt-2"
        >
          {invoices === undefined ? (
            <LoadingBlocks rows={2} className="px-2" />
          ) : recentInvoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No invoices" description="Bills for your sessions will show here." className="py-8" />
          ) : (
            <ul>
              {recentInvoices.map((invoice) => {
                const badge = invoiceBadge(invoice)
                return (
                  <li key={invoice._id}>
                    <Link href={`/dashboard/patient/invoices/${invoice._id}`} className={listRowClass}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pt-amber-bg text-pt-amber-fg">
                        <Receipt className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-pt-ink">
                          {formatKobo(invoice.canPay ? invoice.payableAmount : invoice.totalAmount)}
                        </span>
                        <span className="block truncate text-xs text-pt-muted">
                          #{invoice.invoiceNumber} · {format(invoice.issueDate, 'd MMM yyyy')}
                        </span>
                      </span>
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Link
        href="/dashboard/patient/video-calls"
        className="flex items-center justify-between gap-3 rounded-3xl bg-pt-sunken px-5 py-4 text-sm text-pt-muted transition-colors hover:bg-pt-hover hover:text-pt-ink"
      >
        <span className="flex items-center gap-3">
          <Video className="h-4 w-4" />
          Looking for a video session with {firstName}? Your calls are under Video calls.
        </span>
        <ArrowRight className="h-4 w-4 shrink-0" />
      </Link>

      <PatientAppointmentBookingModal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        preselectedPhysiotherapistId={physiotherapistId}
        onAppointmentBooked={() => setBookingOpen(false)}
      />
    </PageContainer>
  )
}
