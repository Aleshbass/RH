'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference, type FunctionReturnType } from 'convex/server'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  Eye,
  MessageSquare,
  MoreHorizontal,
  Receipt,
  RotateCcw,
  Stethoscope,
  UserPlus,
  Users,
  WhatsApp,
} from '@/components/icons'
import { joinRefs } from '@/components/patient-join/refs'
import { JoinStatusChip, needsInvite } from '@/components/patient-join/JoinStatusChip'
import { InviteDialog } from '@/components/patient-join/InviteDialog'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorBoundary from '@/components/ui/error-boundary'
import { useClinicAccess } from '@/components/clinic/ClinicAccessContext'
import {
  EmptyState,
  IconChip,
  InfoTip,
  PageContainer,
  PageShell,
  Panel,
  StatusBadge,
  cardClass,
  formatNaira,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/clinic/ui'
import { ClinicDocumentsTab, ClinicFollowUpsTab, type ClinicDocument, type FollowUpCall } from '@/components/clinic/patients/ClinicRecordTabs'
import { CareCircleManager } from '@/components/family/CareCircleManager'
import { PatientDrawer } from '@/components/patient/ui'
import { ClinicianPickerDialog, EditPatientDetailsDialog } from '@/components/clinic/patients/PatientRecordDialogs'
import { friendlyError, useClinicianOptions } from '@/components/clinic/patients/patient-record-shared'
import { OverviewTab } from '@/components/physio/workspace/OverviewTab'
import { CarePlanTab } from '@/components/physio/workspace/CarePlanTab'
import { CheckInsTab, NotesTab } from '@/components/physio/workspace/RecordTabs'
import { SOURCE_LABELS, WorkspaceReadOnly, fullName, type Workspace } from '@/components/physio/workspace/shared'
import { MedicalHistoryLine, PatientFacts } from '@/components/physio/workspace/PatientGlance'
import { RehabifyId } from '@/components/shared/RehabifyId'
import { useConnectToJoy } from '@/components/joy/useConnectToJoy'
import { useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const careApi = (api as unknown as Record<string, Record<string, unknown>>).physioCare

// The care team (clinicTools.addToCareTeam & co.): plain references, as the api type is at TS's depth limit
type CareTeamArgs = { patientId: Id<'users'>; clinicianId: Id<'users'> }
const addToCareTeamRef = makeFunctionReference<'mutation', CareTeamArgs, { success: boolean }>('clinicTools:addToCareTeam')
const removeFromCareTeamRef = makeFunctionReference<'mutation', CareTeamArgs, { success: boolean; upcomingVisits: number }>(
  'clinicTools:removeFromCareTeam'
)
const setCareTeamLeadRef = makeFunctionReference<'mutation', CareTeamArgs, { success: boolean }>('clinicTools:setCareTeamLead')

type PatientRecord = NonNullable<FunctionReturnType<typeof api.clinicTools.getClinicPatientFullRecord>>

const CLINIC = '/dashboard/clinic'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'plan', label: 'Care plan' },
  { id: 'notes', label: 'Clinical notes' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'documents', label: 'Documents' },
  { id: 'followups', label: 'Follow-up calls' },
  { id: 'payments', label: 'Payments' },
] as const
type TabId = (typeof TABS)[number]['id']

const CARE_STATUS = {
  active: { label: 'In care', tone: 'green' },
  paused: { label: 'Care paused', tone: 'neutral' },
  discharged: { label: 'Discharged', tone: 'neutral' },
} as const

/**
 * A clinic patient's record for the owner and front desk: the same workspace their clinician
 * works in (overview, care plan, notes, check-ins), read-only, plus what the clinic runs itself:
 * who treats them, visits, documents, follow-up calls, payments and messages.
 */
export default function ClinicPatientRecordPage() {
  const params = useParams()
  const patientId = params.patientId as Id<'users'>
  return (
    <ErrorBoundary
      key={patientId}
      fallback={
        <PageShell title="Patient record" back={{ href: `${CLINIC}/patients`, label: 'Patients' }}>
          <Panel>
            <EmptyState
              icon={<Users />}
              title="This record couldn't be opened"
              description="The patient may no longer be with your clinic, or the connection dropped. Go back and try again."
            />
          </Panel>
        </PageShell>
      }
    >
      <ClinicPatientRecord patientId={patientId} />
    </ErrorBoundary>
  )
}

function ClinicPatientRecord({ patientId }: { patientId: Id<'users'> }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { canUse, isOwner, requireFullAccess } = useClinicAccess()
  // A fixed "now" (to 5 minutes) keeps the query's arguments stable, so Convex can cache it
  const [workspaceNow] = useState(() => Math.floor(Date.now() / 300_000) * 300_000)
  const workspace = useQueryUntyped(careApi.getPatientWorkspace, { patientId, now: workspaceNow }) as Workspace | null | undefined
  const record = useQuery(api.clinicTools.getClinicPatientFullRecord, { patientId }) as PatientRecord | null | undefined
  const clinicians = useClinicianOptions()
  const reopenCare = useMutation(api.clinicTools.reopenPatientCare)
  const reassignPatient = useMutation(api.patients.reassignPatient)
  // More than one clinician can look after a patient (clinic feedback, 24 Nov 2026)
  const addToCareTeam = useMutation(addToCareTeamRef)
  const removeFromCareTeam = useMutation(removeFromCareTeamRef)
  const setCareTeamLead = useMutation(setCareTeamLeadRef)
  const resendInvite = useMutation(api.clinicTools.resendClinicPatientInvite)

  const initialTab = searchParams.get('tab') as TabId | null
  const [tab, setTab] = useState<TabId>(initialTab && TABS.some((t) => t.id === initialTab) ? initialTab : 'overview')
  const [dialog, setDialog] = useState<'edit' | 'reopen' | 'clinician' | 'addClinician' | 'family' | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  // "Connect to Joy on WhatsApp": exercises, reminders and visits on WhatsApp (convex/joyConnect.ts)
  const joyConnect = useConnectToJoy()
  // Their phone + PIN login: invite on WhatsApp, or a new link for a forgotten PIN (patientJoin.ts)
  const joinStatus = useQuery(joinRefs.getJoinStatus, patientId ? { patientId } : 'skip')
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get('tab') as TabId | null
    if (fromUrl && TABS.some((t) => t.id === fromUrl)) setTab(fromUrl)
  }, [searchParams])

  const go = (next: TabId) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(window.history.state, '', url.toString())
  }

  if (workspace === undefined || record === undefined) {
    return (
      <PageShell title="Patient record" back={{ href: `${CLINIC}/patients`, label: 'Patients' }}>
        <Skeleton className="h-48 rounded-3xl bg-pt-sunken" />
        <Skeleton className="h-11 w-full max-w-2xl rounded-2xl bg-pt-sunken" />
        <div className="grid gap-5 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-60 rounded-3xl bg-pt-sunken" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (workspace === null || record === null) {
    return (
      <PageShell title="Patient record" back={{ href: `${CLINIC}/patients`, label: 'Patients' }}>
        <Panel>
          <EmptyState
            icon={<Users />}
            title="Patient not found"
            description="This patient isn't with your clinic, or the record was removed."
            action={
              <Button asChild className={secondaryButtonClass}>
                <Link href={`${CLINIC}/patients`}>Back to patients</Link>
              </Button>
            }
          />
        </Panel>
      </PageShell>
    )
  }

  const { patient, episode } = workspace
  const name = fullName(patient)
  const initials = `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || 'P'
  const status = CARE_STATUS[record.careStatus as keyof typeof CARE_STATUS] ?? CARE_STATUS.discharged
  const isActive = record.careStatus === 'active'
  const clinicianName = workspace.clinicView?.clinicianName ?? null
  const clinicianFirst = clinicianName?.split(' ')[0] ?? null
  const needsClinician = isActive && !workspace.clinicView?.clinicianId
  const primary = record.primaryClinician
  // Everyone looking after them, the lead first
  const careTeam = workspace.careTeam ?? []
  const shared = careTeam.length > 1
  const onTeam = new Set<string>(careTeam.map((m) => m.id))
  // Changing the lead hands over to someone new; a team member is made lead from their row
  const changeOptions = clinicians.options.filter((o) => o.id !== primary?._id && !onTeam.has(o.id))
  const addOptions = clinicians.options.filter((o) => !onTeam.has(o.id))
  const followUps = (record.sessionLogs as unknown as (FollowUpCall & { noteType?: string })[]).filter((log) => log.noteType === 'follow_up_outreach')

  const bookHref = `${CLINIC}/appointments?book=1&patient=${patientId}`
  const requestHref = `${CLINIC}/billing?request=1&patient=${patientId}`
  // Money they've already paid (transfer, cash, POS): saved as paid, nothing sent to them
  const recordHref = `${CLINIC}/billing?record=1&patient=${patientId}`

  const handleResendInvite = async () => {
    if (!requireFullAccess('Resend invite')) return
    setSendingInvite(true)
    try {
      const result = await resendInvite({ patientId })
      playSound('send')
      toast.success('Invite sent', { description: `We've emailed ${result.email} again.` })
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not send the invite. Please try again.'))
    } finally {
      setSendingInvite(false)
    }
  }

  const handleReopen = async (clinicianId: string) => {
    try {
      await reopenCare({ patientId, clinicianId: clinicianId as Id<'users'> })
      playSound('success')
      toast.success(`${patient.firstName ?? 'The patient'} is back in care`)
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not reopen care. Please try again.'))
      throw err
    }
  }

  const handleAddClinician = async (clinicianId: string) => {
    try {
      await addToCareTeam({ patientId, clinicianId: clinicianId as Id<'users'> })
      playSound('success')
      const chosen = clinicians.options.find((o) => o.id === clinicianId)?.label
      toast.success(`${chosen ?? 'They'} joined ${patient.firstName ?? 'this patient'}’s care team`)
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not add the clinician. Please try again.'))
      throw err
    }
  }

  const handleMakeLead = async (member: { id: Id<'users'>; name: string }) => {
    if (!requireFullAccess('Change the lead clinician')) return
    try {
      await setCareTeamLead({ patientId, clinicianId: member.id })
      playSound('success')
      toast.success(`${member.name} now leads ${patient.firstName ?? 'this patient'}’s care`)
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not change the lead. Please try again.'))
    }
  }

  const handleRemoveFromTeam = async (member: { id: Id<'users'>; name: string }) => {
    if (!requireFullAccess('Change the care team')) return
    if (!window.confirm(`Take ${member.name} off ${name}’s care team? The notes they wrote stay on the record.`)) return
    try {
      const result = await removeFromCareTeam({ patientId, clinicianId: member.id })
      playSound('reject')
      toast.success(`${member.name} is off the care team`, {
        description:
          result.upcomingVisits > 0
            ? `They still have ${result.upcomingVisits} visit${result.upcomingVisits === 1 ? '' : 's'} booked with ${patient.firstName ?? 'this patient'}. Move or cancel ${result.upcomingVisits === 1 ? 'it' : 'them'} from Appointments.`
            : undefined,
      })
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not change the care team. Please try again.'))
    }
  }

  const handleChangeClinician = async (clinicianId: string) => {
    if (!primary) return
    try {
      await reassignPatient({ patientId, currentPhysiotherapistId: primary._id, newPhysiotherapistId: clinicianId as Id<'users'> })
      playSound('success')
      const chosen = clinicians.options.find((o) => o.id === clinicianId)?.label
      toast.success(chosen ? `${chosen} now looks after ${patient.firstName ?? 'this patient'}` : 'Clinician changed')
    } catch (err) {
      playSound('error')
      toast.error(friendlyError(err, 'Could not change the clinician. Please try again.'))
      throw err
    }
  }

  return (
    <WorkspaceReadOnly value={true}>
      <PageContainer>
        <Link href={`${CLINIC}/patients`} className="inline-flex items-center text-sm font-medium text-pt-muted transition-colors hover:text-pt-ink">
          <ChevronLeft className="mr-0.5 h-4 w-4" />
          Patients
        </Link>

        {/* Patient header, as in the clinician's workspace */}
        <section className={cn(cardClass, 'p-5 sm:p-6')}>
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="h-16 w-16 shrink-0 sm:h-[72px] sm:w-[72px]">
                <AvatarImage src={patient.imageUrl} alt="" />
                <AvatarFallback className="bg-pt-sunken text-xl font-semibold text-pt-ink">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-pt-ink sm:text-[28px]">{name}</h1>
                {/* Age, gender, date of birth and town, at first glance */}
                <PatientFacts profile={workspace.profile} onAdd={() => requireFullAccess('Edit patient details') && setDialog('edit')} />
                <p className="truncate text-sm text-pt-muted">{[patient.phoneNumber, patient.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <RehabifyId value={patient.patientNumber} className="rounded-full px-2.5 text-xs" />
                  <StatusBadge tone={status.tone}>
                    {isActive ? status.label : `${status.label}${episode.completedAt ? ` · ${format(episode.completedAt, 'd MMM yyyy')}` : ''}`}
                  </StatusBadge>
                  <StatusBadge>
                    {SOURCE_LABELS[episode.source]}
                    {episode.source === 'referred' && episode.referredBy ? ` by ${episode.referredBy}` : ''}
                  </StatusBadge>
                  <StatusBadge>Since {format(workspace.relationship.startDate, 'MMM yyyy')}</StatusBadge>
                  <JoinStatusChip join={joinStatus} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isActive && needsInvite(joinStatus) && (
                <Button onClick={() => setInviteOpen(true)} className="h-10 rounded-xl bg-pt-accent font-semibold text-[#06210a] hover:opacity-90">
                  <WhatsApp className="mr-2 h-4 w-4" />
                  {joinStatus?.status === 'invited' ? 'Remind on WhatsApp' : 'Send link'}
                </Button>
              )}
              {canUse('patients') && (
                <Button asChild className={cn(secondaryButtonClass, 'h-10')}>
                  <Link href={`${CLINIC}/messages?with=${patientId}`}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Message
                  </Link>
                </Button>
              )}
              {isActive ? (
                canUse('appointments') && (
                  <Button asChild className={cn(primaryButtonClass, 'h-10')}>
                    <Link href={bookHref}>
                      <CalendarPlus className="mr-2 h-4 w-4" />
                      Book a visit
                    </Link>
                  </Button>
                )
              ) : (
                <Button className={cn(primaryButtonClass, 'h-10')} onClick={() => requireFullAccess('Reopen care') && setDialog('reopen')}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reopen care
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" className={cn(secondaryButtonClass, 'h-10 w-10')} aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl border-pt-line bg-pt-surface p-1.5 text-pt-ink shadow-pt-lift">
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => requireFullAccess('Edit patient details') && setDialog('edit')}>
                    Edit patient details
                  </DropdownMenuItem>
                  {!record.patient.hasAccount && patient.email && (
                    <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" disabled={sendingInvite} onSelect={() => void handleResendInvite()}>
                      {sendingInvite ? 'Sending…' : 'Resend their email invite'}
                    </DropdownMenuItem>
                  )}
                  {joinStatus?.canSendLink && !needsInvite(joinStatus) && (
                    <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => setInviteOpen(true)}>
                      Send a new sign-in link (forgot PIN)
                    </DropdownMenuItem>
                  )}
                  {canUse('billing') && (
                    <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5 focus:bg-pt-hover">
                      <Link href={requestHref}>Request a payment</Link>
                    </DropdownMenuItem>
                  )}
                  {canUse('billing') && (
                    <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5 focus:bg-pt-hover">
                      <Link href={recordHref}>Record a payment they made</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="bg-pt-line" />
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => go('followups')}>
                    Log a follow-up call
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => go('documents')}>
                    Upload a document
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-pt-hover" onSelect={() => setDialog('family')}>
                    Family and caregivers
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-xl px-3 py-2.5 focus:bg-pt-hover"
                    disabled={joyConnect.busy}
                    onSelect={() => void joyConnect.connect(patientId, patient.firstName ?? undefined)}
                  >
                    Connect to Joy on WhatsApp
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Past medical history, so it's never more than a glance away */}
          <MedicalHistoryLine
            history={workspace.profile?.medicalHistory}
            from={workspace.profile?.medicalHistoryFrom}
            onAdd={() => requireFullAccess('Edit patient details') && setDialog('edit')}
            className="mt-5 border-t border-pt-line pt-4"
          />

          {/* Who treats them: the owner assigns, the clinicians treat. More than one can look after
              a patient (a care team); one of them leads */}
          <div className="mt-4 flex flex-col gap-3 border-t border-pt-line pt-4 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <IconChip icon={needsClinician ? UserPlus : shared ? Users : Stethoscope} tone={needsClinician ? 'ink' : 'green'} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-pt-faint">{shared ? 'Care team' : 'Clinician'}</p>
                {!shared || !isActive ? (
                  <p className="truncate text-sm font-semibold text-pt-ink">
                    {needsClinician ? 'Needs a clinician' : clinicianName ?? (isActive ? 'Not assigned' : 'Care has ended')}
                  </p>
                ) : (
                  <ul className="mt-0.5 space-y-1">
                    {careTeam.map((member) => (
                      <li key={member.id} className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-pt-ink">{member.name}</span>
                        {member.lead && <StatusBadge tone="green">Lead</StatusBadge>}
                        {!member.lead && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-pt-muted" aria-label={`Options for ${member.name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52 rounded-xl">
                              <DropdownMenuItem onClick={() => void handleMakeLead(member)}>Make lead</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleRemoveFromTeam(member)} className="text-pt-rose-fg">
                                Remove from care team
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {isActive && (
              <div className="flex flex-wrap gap-2">
                {primary && (
                  <Button
                    className={cn(needsClinician ? primaryButtonClass : secondaryButtonClass, 'h-9')}
                    onClick={() => requireFullAccess('Change clinician') && setDialog('clinician')}
                  >
                    {needsClinician ? 'Assign a clinician' : shared ? 'Change lead' : 'Change clinician'}
                  </Button>
                )}
                {/* Another clinician alongside the one(s) looking after them */}
                {!needsClinician && careTeam.length > 0 && (
                  <Button
                    className={cn(secondaryButtonClass, 'h-9')}
                    onClick={() => requireFullAccess('Add a clinician') && setDialog('addClinician')}
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    Add clinician
                  </Button>
                )}
                {isOwner && clinicianFirst && (
                  <Button asChild className={cn(secondaryButtonClass, 'h-9')}>
                    <Link href={`${CLINIC}/messages?team=patient:${patientId}`}>
                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                      Ask {clinicianFirst}
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Read-only, said once and plainly */}
        <div className="flex items-start gap-3 rounded-2xl bg-pt-sunken px-4 py-3 text-sm text-pt-muted">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-pt-ink" />
          <p className="min-w-0 flex-1">
            You see exactly what {clinicianName ?? 'their clinician'} sees. Notes, the care plan and home programmes are written by
            the clinician; you manage visits, documents, follow-ups and payments.
          </p>
          <InfoTip label="Why read-only?">
            The clinic owner manages but doesn&apos;t treat. To ask about this patient&apos;s care, use Ask {clinicianFirst ?? 'the clinician'}: it opens a
            private team thread about them.
          </InfoTip>
        </div>

        {/* Tabs */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex items-center gap-1 rounded-2xl bg-pt-sunken p-1" role="tablist">
            {TABS.filter((t) => t.id !== 'payments' || canUse('billing')).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => go(t.id)}
                className={cn(
                  'whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition',
                  tab === t.id ? 'bg-pt-surface text-pt-ink shadow-pt dark:shadow-none' : 'text-pt-muted hover:text-pt-ink'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' && (
          <OverviewTab
            workspace={workspace}
            onEditEpisode={() => undefined}
            onOpenPlan={() => go('plan')}
            onSchedule={() => router.push(bookHref)}
          />
        )}
        {tab === 'plan' && <CarePlanTab workspace={workspace} onEditPlan={() => undefined} onSaveTemplate={() => undefined} />}
        {tab === 'notes' && <NotesTab workspace={workspace} onWrite={() => undefined} />}
        {tab === 'checkins' && <CheckInsTab workspace={workspace} />}
        {tab === 'documents' && <ClinicDocumentsTab patientId={patientId} documents={record.documents as unknown as ClinicDocument[]} />}
        {tab === 'followups' && (
          <ClinicFollowUpsTab patientId={patientId} calls={followUps} nextCheckInAt={isActive ? record.nextCheckInAt : null} phone={patient.phoneNumber} />
        )}
        {tab === 'payments' && canUse('billing') && (
          <ClinicPatientPayments workspace={workspace} requestHref={requestHref} recordHref={recordHref} />
        )}

        {workspace.pastEpisodes.length > 0 && tab === 'overview' && (
          <Panel title="Earlier courses of care">
            <ul className="px-5 pb-4 sm:px-6">
              {workspace.pastEpisodes.map((e) => (
                <li key={e._id} className="flex items-center justify-between gap-3 border-b border-pt-line py-3 text-sm last:border-b-0">
                  <span className="truncate text-pt-ink">{e.condition || 'Course of care'}</span>
                  <span className="shrink-0 text-pt-muted">
                    {format(e.startedAt, 'MMM yyyy')} – {e.completedAt ? format(e.completedAt, 'MMM yyyy') : 'now'}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <EditPatientDetailsDialog record={record} open={dialog === 'edit'} onOpenChange={(open) => setDialog(open ? 'edit' : null)} />
        <InviteDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          patientId={patientId}
          firstName={patient.firstName || 'your patient'}
          join={joinStatus}
        />
        <PatientDrawer
          open={dialog === 'family'}
          onOpenChange={(open) => setDialog(open ? 'family' : null)}
          title={`${patient.firstName ?? 'Their'} family and caregivers`}
          description="Invite a relative or carer to follow their care, or change what they can do"
          className="sm:max-w-xl"
        >
          <CareCircleManager patientId={patientId} audience="clinic" />
        </PatientDrawer>
        <ClinicianPickerDialog
          open={dialog === 'reopen'}
          onOpenChange={(open) => setDialog(open ? 'reopen' : null)}
          title="Reopen care"
          description={`Bring ${name} back into care. Choose who will look after them.`}
          submitLabel="Reopen care"
          options={clinicians.options}
          defaultId={clinicians.defaultId}
          onConfirm={handleReopen}
        />
        <ClinicianPickerDialog
          open={dialog === 'clinician'}
          onOpenChange={(open) => setDialog(open ? 'clinician' : null)}
          title={needsClinician ? 'Assign a clinician' : shared ? 'Change lead clinician' : 'Change clinician'}
          description={
            shared
              ? `The clinician you choose leads ${name}’s care in place of ${clinicianName ?? 'the current lead'}, who leaves the care team. To make someone already on the team lead, use the menu by their name.`
              : `${name} moves to the clinician you choose, who carries on with the same care plan, notes and programmes.`
          }
          submitLabel={needsClinician ? 'Assign' : shared ? 'Change lead' : 'Change clinician'}
          options={changeOptions}
          defaultId={null}
          onConfirm={handleChangeClinician}
        />
        <ClinicianPickerDialog
          open={dialog === 'addClinician'}
          onOpenChange={(open) => setDialog(open ? 'addClinician' : null)}
          title="Add to the care team"
          description={`For patients who need more visits than one clinician can give. ${clinicianName ?? 'Their clinician'} stays the lead. The clinician you add works on the same record (notes, care plan, programmes), books their own visits and writes their own notes.`}
          submitLabel="Add to care team"
          options={addOptions}
          defaultId={addOptions.length === 1 ? addOptions[0].id : null}
          onConfirm={handleAddClinician}
        />
      </PageContainer>
    </WorkspaceReadOnly>
  )
}

type BillingInvoice = {
  _id: string
  patientId?: string
  invoiceNumber: string
  serviceName: string
  totalAmountNaira: number
  status: string
  createdAt: number
  paidAt?: number | null
}

/** This patient's payments to the clinic (requested or recorded), with shortcuts for both. */
function ClinicPatientPayments({
  workspace,
  requestHref,
  recordHref,
}: {
  workspace: Workspace
  requestHref: string
  recordHref: string
}) {
  const billing = useQuery(api.clinicTools.getClinicBillingSummary) as { invoices: BillingInvoice[] } | undefined
  const invoices = useMemo(
    () => (billing?.invoices ?? []).filter((invoice) => invoice.patientId === workspace.patient._id),
    [billing, workspace.patient._id]
  )
  const badge = (invoice: BillingInvoice) =>
    invoice.status === 'paid' ? (
      <StatusBadge tone="green">Paid</StatusBadge>
    ) : invoice.status === 'void' || invoice.status === 'cancelled' ? (
      <StatusBadge>Cancelled</StatusBadge>
    ) : invoice.status === 'overdue' ? (
      <StatusBadge tone="red">Overdue</StatusBadge>
    ) : (
      <StatusBadge tone="blue">Waiting</StatusBadge>
    )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className={cn(cardClass, 'p-5')}>
          <p className="text-[13px] font-medium text-pt-muted">Waiting for payment</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-pt-ink">{formatNaira(workspace.payments.unpaidKobo / 100)}</p>
          <p className="text-xs text-pt-muted">
            {workspace.payments.unpaidCount} request{workspace.payments.unpaidCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className={cn(cardClass, 'p-5')}>
          <p className="text-[13px] font-medium text-pt-muted">Paid</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-pt-green-fg">{formatNaira(workspace.payments.paidKobo / 100)}</p>
          <p className="text-xs text-pt-muted">to your clinic, for this patient</p>
        </div>
      </div>

      <Panel
        title="Payments"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="h-9">
              <Link href={recordHref}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Record payment
              </Link>
            </Button>
            <Button asChild size="sm" className={cn(primaryButtonClass, 'h-9')}>
              <Link href={requestHref}>
                <Receipt className="mr-1.5 h-4 w-4" />
                Request payment
              </Link>
            </Button>
          </div>
        }
      >
        {billing === undefined ? (
          <div className="px-5 pb-5 sm:px-6">
            <Skeleton className="h-12 rounded-xl bg-pt-sunken" />
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title="No payments yet"
            description="Request a payment they can pay by card, transfer or USSD, or record one they've already made."
          />
        ) : (
          <ul className="px-5 pb-3 sm:px-6">
            {invoices.map((invoice) => (
              <li key={invoice._id} className="flex items-center gap-3 border-b border-pt-line py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold tabular-nums text-pt-ink">{formatNaira(invoice.totalAmountNaira)}</p>
                    {badge(invoice)}
                  </div>
                  <p className="truncate text-xs text-pt-muted">
                    {invoice.serviceName} · #{invoice.invoiceNumber} · {format(invoice.createdAt, 'd MMM yyyy')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <p className="px-1 text-xs text-pt-muted">
        Copy or resend a pay link from{' '}
        <Link href={`${CLINIC}/billing`} className="font-medium text-pt-ink underline-offset-2 hover:underline">
          Billing
        </Link>
        .
      </p>
    </div>
  )
}
