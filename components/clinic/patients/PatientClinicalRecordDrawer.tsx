'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ErrorBoundary from '@/components/ui/error-boundary'
import { toast } from 'sonner'
import { FileText, Loader2, Plus, Trash2, UserRound } from 'lucide-react'
import { differenceInYears, format, isValid } from 'date-fns'
import { cn } from '@/lib/utils'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { EmptyState, StatusBadge, primaryButtonClass } from '@/components/clinic/ui'
import {
  fieldClass,
  friendlyError,
  isPreviewId,
  labelClass,
  useClinicianOptions,
} from './patient-record-shared'
import { ClinicianPickerDialog, EditPatientDetailsDialog } from './PatientRecordDialogs'
import { samplePatientRecord } from './sample-patient-record'
import { ExerciseProgramsPanel } from '@/components/exercise-programs/ExerciseProgramsPanel'

type PatientRecord = NonNullable<FunctionReturnType<typeof api.clinicTools.getClinicPatientFullRecord>>
type SessionLog = PatientRecord['sessionLogs'][number]
type TreatmentPlan = PatientRecord['treatmentPlans'][number]
type Clinicians = ReturnType<typeof useClinicianOptions>

interface PatientClinicalRecordDrawerProps {
  /** A real patient id, or a preview id such as "prev_p1" (shown as a sample notice). */
  patientId: Id<'users'> | string | null
  isOpen: boolean
  onClose: () => void
}

function formatDate(value: number | string | undefined | null, pattern = 'd MMM yyyy') {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(value)
  return isValid(date) ? format(date, pattern) : null
}

const subtleButtonClass = 'h-8 text-xs'

export default function PatientClinicalRecordDrawer({
  patientId,
  isOpen,
  onClose,
}: PatientClinicalRecordDrawerProps) {
  if (!patientId) return null
  const isSample = String(patientId).startsWith('prev_')

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-neutral-200 bg-white p-0 shadow-none dark:border-neutral-800 dark:bg-neutral-900 sm:max-w-2xl"
      >
        <ErrorBoundary
          key={String(patientId)}
          fallback={
            <NoticeState
              title="This record couldn't be opened"
              description="The patient may no longer be linked to your clinic, or the connection dropped. Close this panel and try again."
            />
          }
        >
          {/* Sample patients show a read-only example record; every action asks to finish setup */}
          <PatientRecord patientId={patientId as Id<'users'>} isSample={isSample} />
        </ErrorBoundary>
      </SheetContent>
    </Sheet>
  )
}

function NoticeState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <SheetDescription className="sr-only">{description}</SheetDescription>
      <EmptyState icon={<UserRound className="h-8 w-8" />} title={title} description={description} />
    </div>
  )
}

function RecordSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6">
      <SheetTitle className="sr-only">Loading patient record</SheetTitle>
      <SheetDescription className="sr-only">Please wait</SheetDescription>
      <div className="flex items-center gap-3 pr-8">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Record body
// ─────────────────────────────────────────────────────────────────────────────

const CARE_STATUS: Record<PatientRecord['careStatus'], { label: string; tone: 'green' | 'amber' | 'neutral' }> = {
  active: { label: 'In care', tone: 'green' },
  paused: { label: 'Care paused', tone: 'amber' },
  discharged: { label: 'Discharged', tone: 'neutral' },
}

const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other' }

function PatientRecord({ patientId, isSample }: { patientId: Id<'users'>; isSample: boolean }) {
  const liveRecord = useQuery(api.clinicTools.getClinicPatientFullRecord, isSample ? 'skip' : { patientId })
  const record = isSample ? samplePatientRecord(String(patientId)) : liveRecord
  const [tab, setTab] = useState('timeline')
  const { requireFullAccess } = useClinicPreview()
  const clinicians = useClinicianOptions()
  const reopenCare = useMutation(api.clinicTools.reopenPatientCare)
  const reassignPatient = useMutation(api.patients.reassignPatient)
  const resendInvite = useMutation(api.clinicTools.resendClinicPatientInvite)
  const [editOpen, setEditOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [sendingInvite, setSendingInvite] = useState(false)

  if (record === undefined) return <RecordSkeleton />
  if (record === null) {
    return (
      <NoticeState
        title="Patient not found"
        description="This patient record no longer exists. Close this panel to go back to your list."
      />
    )
  }

  const { patient, profile } = record

  /** Email the "your clinic added you" link again (patients who haven't created their account) */
  const handleResendInvite = async () => {
    if (!requireFullAccess('Resend invite')) return
    if (isPreviewId(patient._id)) return
    setSendingInvite(true)
    try {
      const result = await resendInvite({ patientId: patientId })
      toast.success('Invite sent', { description: `We've emailed ${result.email} again.` })
    } catch (err) {
      toast.error(friendlyError(err, 'Could not send the invite. Please try again.'))
    } finally {
      setSendingInvite(false)
    }
  }
  const fullName = `${patient.firstName ?? ''} ${patient.lastName ?? ''}`.trim() || 'Patient'
  const initials = `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || 'P'
  const contact = [patient.phoneNumber, patient.email].filter(Boolean).join(' · ')
  const status = CARE_STATUS[record.careStatus] ?? CARE_STATUS.discharged
  const isActive = record.careStatus === 'active'

  const dobDate = profile?.dateOfBirth ? new Date(profile.dateOfBirth) : null
  const dob =
    dobDate && isValid(dobDate)
      ? `${format(dobDate, 'd MMM yyyy')} (${differenceInYears(new Date(), dobDate)} yrs)`
      : null
  const gender = profile?.gender ? GENDER_LABELS[profile.gender] : undefined
  const address = [profile?.address, profile?.city].filter(Boolean).join(', ')
  const emergency = profile?.emergencyContact
  const emergencyText = emergency?.name
    ? [
        emergency.relationship ? `${emergency.name} (${emergency.relationship})` : emergency.name,
        emergency.phone,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const primary = record.primaryClinician
  const clinicianName = primary
    ? primary._id === clinicians.meId
      ? 'You'
      : `${primary.firstName ?? ''} ${primary.lastName ?? ''}`.trim() || primary.email || 'Clinician'
    : null
  const changeOptions = clinicians.options.filter((o) => o.id !== primary?._id)

  const details = [
    { label: 'Date of birth', value: dob },
    { label: 'Gender', value: gender },
    { label: 'Address', value: address },
    { label: 'Emergency contact', value: emergencyText },
    { label: 'Next check-in', value: isActive ? formatDate(record.nextCheckInAt) : null },
  ].filter((d): d is { label: string; value: string } => Boolean(d.value))

  const clinicalNotes = record.sessionLogs.filter((log: any) => log.noteType !== 'follow_up_outreach')
  const checkIns = record.sessionLogs.filter((log: any) => log.noteType === 'follow_up_outreach')

  const handleReopen = async (clinicianId: string) => {
    if (!requireFullAccess('Reopen care')) return
    if (isPreviewId(clinicianId)) return
    try {
      await reopenCare({
        patientId,
        clinicianId: clinicianId === clinicians.ownerId ? undefined : (clinicianId as Id<'users'>),
      })
      toast.success('Care reopened')
    } catch (err) {
      toast.error(friendlyError(err, 'Could not reopen care. Please try again.'))
      throw err
    }
  }

  const handleChangeClinician = async (clinicianId: string) => {
    if (!requireFullAccess('Change clinician')) return
    if (!primary || isPreviewId(clinicianId) || isPreviewId(primary._id)) return
    try {
      await reassignPatient({
        patientId,
        currentPhysiotherapistId: primary._id,
        newPhysiotherapistId: clinicianId as Id<'users'>,
      })
      toast.success('Clinician changed')
    } catch (err) {
      toast.error(friendlyError(err, 'Could not change the clinician. Please try again.'))
      throw err
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="space-y-3 border-b border-neutral-200 p-4 pr-12 dark:border-neutral-800 sm:p-6 sm:pr-12">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-11 w-11 shrink-0 border border-neutral-200 dark:border-neutral-800">
            <AvatarImage src={patient.imageUrl} alt="" />
            <AvatarFallback className="bg-neutral-100 text-sm font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base font-semibold text-neutral-900 dark:text-white">
              {fullName}
            </SheetTitle>
            <SheetDescription className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {contact || 'No contact details'}
            </SheetDescription>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {profile?.referralSource === 'rehabify_referral' && (
            <StatusBadge tone="teal">Referred by Rehabify</StatusBadge>
          )}
          {!patient.hasAccount && <StatusBadge tone="neutral">Hasn&apos;t joined yet</StatusBadge>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!patient.hasAccount && patient.email && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={subtleButtonClass}
                disabled={sendingInvite}
                onClick={handleResendInvite}
              >
                {sendingInvite ? 'Sending…' : 'Resend invite'}
              </Button>
            )}
            {!isActive && (
              <Button
                type="button"
                size="sm"
                className={cn(primaryButtonClass, subtleButtonClass)}
                onClick={() => requireFullAccess('Reopen care') && setReopenOpen(true)}
              >
                Reopen care
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={subtleButtonClass}
              onClick={() => requireFullAccess('Edit patient details') && setEditOpen(true)}
            >
              Edit details
            </Button>
          </div>
        </div>

        {isActive && clinicianName && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="shrink-0 text-neutral-500 dark:text-neutral-400">Clinician</span>
            <span className="min-w-0 truncate text-neutral-900 dark:text-neutral-100">{clinicianName}</span>
            {primary && (
              <button
                type="button"
                className="shrink-0 font-medium text-[#005b57] hover:underline dark:text-[#2dd4bf]"
                onClick={() => requireFullAccess('Change clinician') && setChangeOpen(true)}
              >
                Change
              </button>
            )}
          </div>
        )}

        {details.length > 0 && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.label} className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">{d.label}</dt>
                <dd className="min-w-0 break-words text-neutral-900 dark:text-neutral-100">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto whitespace-nowrap rounded-none bg-transparent p-0 px-2 sm:px-4">
            {[
              ['timeline', 'Timeline'],
              ['notes', 'Notes'],
              ['programme', 'Home programme'],
              ['documents', 'Documents'],
              ['checkins', 'Check-ins'],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="shrink-0 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-sm font-medium text-neutral-500 shadow-none data-[state=active]:border-[#005b57] data-[state=active]:bg-transparent data-[state=active]:text-neutral-900 data-[state=active]:shadow-none dark:text-neutral-400 dark:data-[state=active]:border-[#2dd4bf] dark:data-[state=active]:text-white"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6">
            <TabsContent value="timeline" className="mt-0">
              <TimelineTab record={record} />
            </TabsContent>
            <TabsContent value="notes" className="mt-0">
              <NotesTab
                patientId={patientId}
                notes={clinicalNotes}
                clinicians={clinicians}
                primaryClinicianId={primary?._id ?? null}
              />
            </TabsContent>
            <TabsContent value="programme" className="mt-0 space-y-6">
              {!isSample && (
                <ExerciseProgramsPanel
                  patientId={patientId}
                  patientName={patient.firstName || 'this patient'}
                  hasPhone={Boolean(patient.phoneNumber?.replace(/\D/g, '').length)}
                  canWrite={isActive}
                />
              )}
              <ProgrammeTab patientId={patientId} plans={record.treatmentPlans} />
            </TabsContent>
            <TabsContent value="documents" className="mt-0">
              <DocumentsTab patientId={patientId} documents={record.documents} />
            </TabsContent>
            <TabsContent value="checkins" className="mt-0">
              <CheckInsTab
                patientId={patientId}
                checkIns={checkIns}
                nextCheckInAt={isActive ? record.nextCheckInAt : null}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <EditPatientDetailsDialog record={record} open={editOpen} onOpenChange={setEditOpen} />
      <ClinicianPickerDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="Reopen care"
        description={`Bring ${fullName} back into active care. Choose who will look after them.`}
        submitLabel="Reopen care"
        options={clinicians.options}
        defaultId={clinicians.ownerId}
        onConfirm={handleReopen}
      />
      <ClinicianPickerDialog
        open={changeOpen}
        onOpenChange={setChangeOpen}
        title="Change clinician"
        description={`${fullName} will move to the clinician you choose. Their notes and programmes stay on the record.`}
        submitLabel="Change clinician"
        options={changeOptions}
        defaultId={null}
        onConfirm={handleChangeClinician}
      />
    </div>
  )
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{children}</h3>
}

function FormCard({ children, onSubmit }: { children: ReactNode; onSubmit: (e: FormEvent) => void }) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      {children}
    </form>
  )
}

function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900',
        className
      )}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────────

function TimelineTab({ record }: { record: PatientRecord }) {
  const history = record.profile?.medicalHistorySummary
  return (
    <div className="space-y-6">
      {history && (
        <div className="space-y-1">
          <SectionHeading>Medical history</SectionHeading>
          <p className="whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">{history}</p>
        </div>
      )}

      <div className="space-y-3">
        <SectionHeading>What has happened</SectionHeading>
        {record.timeline.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing recorded yet.</p>
        ) : (
          <ol className="space-y-0">
            {record.timeline.map((item: any) => (
              <li
                key={item.id}
                className="flex min-w-0 gap-3 border-b border-neutral-100 py-3 last:border-0 dark:border-neutral-800"
              >
                <span className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                  {formatDate(item.date)}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {item.title}
                    </span>
                    {item.badge && <StatusBadge>{item.badge}</StatusBadge>}
                  </div>
                  {item.diagnosis && (
                    <p className="text-xs text-neutral-700 dark:text-neutral-300">Diagnosis: {item.diagnosis}</p>
                  )}
                  {item.description && (
                    <p className="line-clamp-2 break-words text-xs text-neutral-500 dark:text-neutral-400">
                      {item.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Notes
// ─────────────────────────────────────────────────────────────────────────────

type NoteType = 'initial_assessment' | 'treatment_note' | 'follow_up' | 'discharge_summary'
type NoteField =
  | 'diagnosis'
  | 'goalsSummary'
  | 'subjectiveAssessment'
  | 'objectiveAssessment'
  | 'treatmentAdministered'
  | 'planForNextSession'

interface FieldConfig {
  key: NoteField
  label: string
  placeholder: string
  multiline?: boolean
}

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'initial_assessment', label: 'Initial assessment' },
  { value: 'treatment_note', label: 'Treatment note' },
  { value: 'follow_up', label: 'Follow-up note' },
  { value: 'discharge_summary', label: 'Discharge summary' },
]

const NOTE_FIELDS: Record<NoteType, FieldConfig[]> = {
  initial_assessment: [
    { key: 'diagnosis', label: 'Diagnosis', placeholder: 'e.g. Right knee osteoarthritis' },
    { key: 'goalsSummary', label: 'Goals', placeholder: 'e.g. Walk to church without pain in 6 weeks' },
    {
      key: 'subjectiveAssessment',
      label: 'History',
      placeholder: 'What the patient tells you: how it started, pain, what makes it better or worse',
      multiline: true,
    },
    {
      key: 'objectiveAssessment',
      label: 'Findings',
      placeholder: 'What you measured or observed: range of motion, strength, walking',
      multiline: true,
    },
    { key: 'planForNextSession', label: 'Plan', placeholder: 'Treatment plan and next steps', multiline: true },
  ],
  treatment_note: [
    {
      key: 'subjectiveAssessment',
      label: 'How the patient is today',
      placeholder: 'e.g. Pain down to 4/10, sleeping better',
      multiline: true,
    },
    {
      key: 'treatmentAdministered',
      label: 'Treatment given',
      placeholder: 'e.g. Knee mobilisation, quad strengthening, ice',
      multiline: true,
    },
    { key: 'planForNextSession', label: 'Plan for next visit', placeholder: 'e.g. Add step-ups, recheck bend', multiline: true },
  ],
  follow_up: [
    {
      key: 'subjectiveAssessment',
      label: 'Progress since last visit',
      placeholder: 'What has changed since the last visit',
      multiline: true,
    },
    { key: 'objectiveAssessment', label: 'Findings', placeholder: 'What you measured or observed today', multiline: true },
    { key: 'planForNextSession', label: 'Plan', placeholder: 'Next steps', multiline: true },
  ],
  discharge_summary: [
    {
      key: 'objectiveAssessment',
      label: 'Outcome',
      placeholder: 'e.g. Goals met, walking without pain, full knee bend',
      multiline: true,
    },
    {
      key: 'planForNextSession',
      label: 'Advice for the patient',
      placeholder: 'e.g. Keep doing the home exercises 3 times a week, come back if pain returns',
      multiline: true,
    },
  ],
}

const NOTE_DISPLAY_LABELS: Record<NoteField, string> = {
  diagnosis: 'Diagnosis',
  goalsSummary: 'Goals',
  subjectiveAssessment: 'Patient report',
  objectiveAssessment: 'Findings',
  treatmentAdministered: 'Treatment given',
  planForNextSession: 'Plan',
}

const EMPTY_NOTE: Record<NoteField, string> = {
  diagnosis: '',
  goalsSummary: '',
  subjectiveAssessment: '',
  objectiveAssessment: '',
  treatmentAdministered: '',
  planForNextSession: '',
}

/** Note values, keyed by the form field they came from. Stored `goals` maps to `goalsSummary`. */
function noteValue(log: SessionLog, key: NoteField): string | undefined {
  const value = key === 'goalsSummary' ? log.goals : log[key as Exclude<NoteField, 'goalsSummary'>]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function NotesTab({
  patientId,
  notes,
  clinicians,
  primaryClinicianId,
}: {
  patientId: Id<'users'>
  notes: SessionLog[]
  clinicians: Clinicians
  primaryClinicianId: string | null
}) {
  const { requireFullAccess } = useClinicPreview()
  const saveClinicalNote = useMutation(api.clinicTools.saveClinicalNote)
  const [noteType, setNoteType] = useState<NoteType>('treatment_note')
  const [values, setValues] = useState<Record<NoteField, string>>(EMPTY_NOTE)
  const [saving, setSaving] = useState(false)
  const [pickedSeenBy, setPickedSeenBy] = useState('')

  const fields = NOTE_FIELDS[noteType]
  const { options, ownerId } = clinicians
  const defaultSeenBy =
    primaryClinicianId && options.some((o) => o.id === primaryClinicianId) ? primaryClinicianId : (ownerId ?? '')
  const seenBy = pickedSeenBy && options.some((o) => o.id === pickedSeenBy) ? pickedSeenBy : defaultSeenBy

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Add note')) return
    const payload: Partial<Record<NoteField, string>> = {}
    for (const field of fields) {
      const value = values[field.key].trim()
      if (value) payload[field.key] = value
    }
    if (Object.keys(payload).length === 0) {
      toast.error('Write something in at least one box before saving')
      return
    }
    setSaving(true)
    try {
      const physiotherapistId =
        seenBy && seenBy !== ownerId && !isPreviewId(seenBy) ? (seenBy as Id<'users'>) : undefined
      await saveClinicalNote({ patientId, noteType, physiotherapistId, ...payload })
      toast.success(noteType === 'discharge_summary' ? 'Discharge summary saved' : 'Note saved')
      setValues(EMPTY_NOTE)
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save the note. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <FormCard onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeading>Add note</SectionHeading>
          <Select value={noteType} onValueChange={(val) => setNoteType(val as NoteType)}>
            <SelectTrigger className={cn(fieldClass, 'h-9 w-full sm:w-52')} aria-label="Type of note">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {noteType === 'discharge_summary' && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Saving a discharge summary ends this patient&apos;s care at your clinic and completes any active home
            programme.
          </p>
        )}

        <div className="space-y-3">
          {options.length > 0 && (
            <div className="space-y-1.5">
              <Label className={labelClass}>Seen by</Label>
              <Select value={seenBy} onValueChange={setPickedSeenBy}>
                <SelectTrigger className={cn(fieldClass, 'h-9 w-full sm:w-64')} aria-label="Seen by">
                  <SelectValue placeholder="Choose a clinician" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {fields.map((field) => {
            const id = `note-${field.key}`
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={id} className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {field.label}
                </Label>
                {field.multiline ? (
                  <Textarea
                    id={id}
                    rows={3}
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className={fieldClass}
                  />
                ) : (
                  <Input
                    id={id}
                    placeholder={field.placeholder}
                    value={values[field.key]}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className={cn(fieldClass, 'h-9')}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={saving} className={cn(primaryButtonClass, 'h-9 w-full sm:w-auto')}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save note
          </Button>
        </div>
      </FormCard>

      <div className="space-y-3">
        <SectionHeading>Past notes</SectionHeading>
        {notes.length === 0 ? (
          <p className="text-sm text-neutral-500">No notes yet. The first note you save will show here.</p>
        ) : (
          notes.map((log) => {
            const type = (log.noteType ?? 'treatment_note') as NoteType
            const typeFields = NOTE_FIELDS[type] ?? NOTE_FIELDS.treatment_note
            const labelFor = (key: NoteField) =>
              typeFields.find((f) => f.key === key)?.label ?? NOTE_DISPLAY_LABELS[key]
            const shown = (Object.keys(NOTE_DISPLAY_LABELS) as NoteField[])
              .filter((key) => key !== 'diagnosis')
              .map((key) => ({ key, label: labelFor(key), value: noteValue(log, key) }))
              .filter((row) => row.value)
            const date = formatDate(log.sessionDate, 'd MMM yyyy, h:mm a')
            return (
              <ListCard key={log._id} className="space-y-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {log.noteTypeLabel ?? 'Note'}
                  </span>
                  <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {[date, log.clinicianName].filter(Boolean).join(' · ')}
                  </span>
                </div>
                {log.diagnosis && (
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    <span className="text-neutral-500 dark:text-neutral-400">Diagnosis: </span>
                    {log.diagnosis}
                  </p>
                )}
                {shown.map((row) => (
                  <div key={row.key} className="text-sm">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.label}</p>
                    <p className="whitespace-pre-line break-words text-neutral-700 dark:text-neutral-300">{row.value}</p>
                  </div>
                ))}
              </ListCard>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Home programme
// ─────────────────────────────────────────────────────────────────────────────

interface ExerciseRow {
  key: string
  name: string
  sets: string
  reps: string
  frequency: string
  instructions: string
}

let rowCounter = 0
function newRow(partial?: Partial<Omit<ExerciseRow, 'key'>>): ExerciseRow {
  rowCounter += 1
  return {
    key: `row-${rowCounter}`,
    name: '',
    sets: '',
    reps: '',
    frequency: '',
    instructions: '',
    ...partial,
  }
}

const PLAN_STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'neutral' }> = {
  active: { label: 'Active', tone: 'green' },
  on_hold: { label: 'Paused', tone: 'amber' },
  completed: { label: 'Completed', tone: 'neutral' },
  draft: { label: 'Draft', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

function planExercises(plan: TreatmentPlan) {
  return plan.phases?.[0]?.exercises ?? []
}

function planGoals(plan: TreatmentPlan) {
  return (plan.goals ?? []).map((goal: { description: string }) => goal.description.trim()).filter(Boolean)
}

const MAX_GOALS = 10

interface GoalRow {
  key: string
  text: string
}

let goalCounter = 0
function newGoal(text = ''): GoalRow {
  goalCounter += 1
  return { key: `goal-${goalCounter}`, text }
}

function GoalsEditor({ goals, onChange }: { goals: GoalRow[]; onChange: (goals: GoalRow[]) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className={labelClass}>Goals</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Optional. The patient sees these in their app.</p>
      </div>
      {goals.map((goal, index) => (
        <div key={goal.key} className="flex min-w-0 items-center gap-2">
          <Input
            aria-label={`Goal ${index + 1}`}
            placeholder="e.g. Climb stairs without holding the rail"
            value={goal.text}
            onChange={(e) =>
              onChange(goals.map((g) => (g.key === goal.key ? { ...g, text: e.target.value } : g)))
            }
            className={cn(fieldClass, 'h-9 min-w-0 flex-1')}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-neutral-500"
            onClick={() => onChange(goals.filter((g) => g.key !== goal.key))}
            aria-label={`Remove goal ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {goals.length < MAX_GOALS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={subtleButtonClass}
          onClick={() => onChange([...goals, newGoal()])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add goal
        </Button>
      )}
    </div>
  )
}

function ProgrammeTab({ patientId, plans }: { patientId: Id<'users'>; plans: TreatmentPlan[] }) {
  const { requireFullAccess } = useClinicPreview()
  const assignProgramme = useMutation(api.clinicTools.assignHomeProgramme)
  const updateProgramme = useMutation(api.clinicTools.updateHomeProgramme)

  const [editingPlanId, setEditingPlanId] = useState<Id<'treatmentPlans'> | null>(null)
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<ExerciseRow[]>(() => [newRow()])
  const [goals, setGoals] = useState<GoalRow[]>([])
  const [saving, setSaving] = useState(false)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const resetForm = () => {
    setEditingPlanId(null)
    setTitle('')
    setRows([newRow()])
    setGoals([])
  }

  const updateRow = (key: string, patch: Partial<Omit<ExerciseRow, 'key'>>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : [newRow()]))

  const startEditing = (plan: TreatmentPlan) => {
    setEditingPlanId(plan._id)
    setTitle(plan.title)
    const loaded = planExercises(plan).map((ex: any) =>
      newRow({
        name: ex.name ?? '',
        sets: String(ex.sets ?? ''),
        reps: String(ex.reps ?? ''),
        frequency: ex.frequency ?? '',
        instructions: ex.instructions ?? ex.notes ?? '',
      })
    )
    setRows(loaded.length > 0 ? loaded : [newRow()])
    setGoals(planGoals(plan).slice(0, MAX_GOALS).map((text: string) => newGoal(text)))
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess(editingPlanId ? 'Edit home programme' : 'Give home programme')) return
    const exercises = rows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        sets: Math.max(1, parseInt(row.sets, 10) || 1),
        reps: Math.max(1, parseInt(row.reps, 10) || 1),
        frequency: row.frequency.trim() || 'Daily',
        instructions: row.instructions.trim(),
      }))
    if (exercises.length === 0) {
      toast.error('Add at least one exercise with a name')
      return
    }
    const goalList = goals.map((g) => g.text.trim()).filter(Boolean).slice(0, MAX_GOALS)
    setSaving(true)
    try {
      if (editingPlanId) {
        // Always sent when editing, so removing every goal clears them
        await updateProgramme({ planId: editingPlanId, title: title.trim() || undefined, exercises, goals: goalList })
        toast.success('Home programme updated')
      } else {
        await assignProgramme({
          patientId,
          title: title.trim() || 'Home exercise programme',
          exercises,
          goals: goalList.length > 0 ? goalList : undefined,
        })
        toast.success('Home programme saved. The patient can now see it in their app.')
      }
      resetForm()
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save the programme. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (plan: TreatmentPlan, status: 'active' | 'on_hold' | 'completed', action: string) => {
    if (!requireFullAccess(action)) return
    setBusyPlanId(plan._id)
    try {
      await updateProgramme({ planId: plan._id, status })
      toast.success(
        status === 'active' ? 'Programme resumed' : status === 'on_hold' ? 'Programme paused' : 'Programme marked complete'
      )
      if (editingPlanId === plan._id && status === 'completed') resetForm()
    } catch (err) {
      toast.error(friendlyError(err, 'Could not update the programme. Please try again.'))
    } finally {
      setBusyPlanId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div ref={formRef} className="scroll-mt-4">
        <FormCard onSubmit={handleSubmit}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading>{editingPlanId ? 'Edit home programme' : 'New home programme'}</SectionHeading>
            {editingPlanId && (
              <Button type="button" variant="ghost" size="sm" className={subtleButtonClass} onClick={resetForm}>
                Cancel editing
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="programme-title" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Name
            </Label>
            <Input
              id="programme-title"
              placeholder="e.g. Knee strengthening"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={cn(fieldClass, 'h-9')}
            />
          </div>

          <GoalsEditor goals={goals} onChange={setGoals} />

          <div className="space-y-3">
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Exercises</p>
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Exercise ${index + 1} name`}
                    placeholder="Exercise name, e.g. Straight leg raise"
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    className={cn(fieldClass, 'h-9 min-w-0 flex-1')}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-neutral-500"
                    onClick={() => removeRow(row.key)}
                    aria-label={`Remove exercise ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Input
                    aria-label="Sets"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="Sets"
                    value={row.sets}
                    onChange={(e) => updateRow(row.key, { sets: e.target.value })}
                    className={cn(fieldClass, 'h-9')}
                  />
                  <Input
                    aria-label="Reps"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="Reps"
                    value={row.reps}
                    onChange={(e) => updateRow(row.key, { reps: e.target.value })}
                    className={cn(fieldClass, 'h-9')}
                  />
                  <Input
                    aria-label="How often"
                    placeholder="How often, e.g. twice a day"
                    value={row.frequency}
                    onChange={(e) => updateRow(row.key, { frequency: e.target.value })}
                    className={cn(fieldClass, 'col-span-2 h-9 sm:col-span-1')}
                  />
                </div>
                <Input
                  aria-label="Instructions for the patient"
                  placeholder="Instructions for the patient (optional)"
                  value={row.instructions}
                  onChange={(e) => updateRow(row.key, { instructions: e.target.value })}
                  className={cn(fieldClass, 'h-9')}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={subtleButtonClass}
              onClick={() => setRows((prev) => [...prev, newRow()])}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add exercise
            </Button>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving} className={cn(primaryButtonClass, 'h-9 w-full sm:w-auto')}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingPlanId ? 'Save changes' : 'Give to patient'}
            </Button>
          </div>
        </FormCard>
      </div>

      <div className="space-y-3">
        <SectionHeading>Programmes</SectionHeading>
        {plans.length === 0 ? (
          <p className="text-sm text-neutral-500">No home programme yet.</p>
        ) : (
          plans.map((plan) => {
            const status = PLAN_STATUS[plan.status] ?? { label: plan.status, tone: 'neutral' as const }
            const exercises = planExercises(plan)
            const planGoalList = planGoals(plan)
            // Only programmes created by this clinic can be changed here
            const canChange = Boolean(plan.clinicId)
            const busy = busyPlanId === plan._id
            return (
              <ListCard key={plan._id} className="space-y-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {plan.title}
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  {editingPlanId === plan._id && <StatusBadge tone="teal">Editing</StatusBadge>}
                </div>
                {formatDate(plan.startDate) && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Started {formatDate(plan.startDate)}</p>
                )}
                {planGoalList.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Goals</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-neutral-700 marker:text-neutral-400 dark:text-neutral-300 dark:marker:text-neutral-600">
                      {planGoalList.map((goal: string, i: number) => (
                        <li key={`${goal}-${i}`} className="break-words">
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {exercises.length > 0 && (
                  <ul className="space-y-1">
                    {exercises.map((ex: any, i: number) => (
                      <li key={`${ex.exerciseId}-${i}`} className="flex min-w-0 flex-wrap gap-x-2 text-sm">
                        <span className="min-w-0 truncate text-neutral-800 dark:text-neutral-200">
                          {ex.name || ex.notes || 'Exercise'}
                        </span>
                        <span className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                          {ex.sets} × {ex.reps}
                          {ex.frequency ? ` · ${ex.frequency}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {canChange && plan.status !== 'cancelled' && (
                  <div className="flex flex-wrap gap-2">
                    {plan.status !== 'completed' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={subtleButtonClass}
                        onClick={() => startEditing(plan)}
                        disabled={busy}
                      >
                        Edit
                      </Button>
                    )}
                    {plan.status === 'active' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={subtleButtonClass}
                        disabled={busy}
                        onClick={() => changeStatus(plan, 'on_hold', 'Pause home programme')}
                      >
                        Pause
                      </Button>
                    )}
                    {(plan.status === 'on_hold' || plan.status === 'draft') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={subtleButtonClass}
                        disabled={busy}
                        onClick={() => changeStatus(plan, 'active', 'Resume home programme')}
                      >
                        Resume
                      </Button>
                    )}
                    {plan.status !== 'completed' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={subtleButtonClass}
                        disabled={busy}
                        onClick={() => changeStatus(plan, 'completed', 'Complete home programme')}
                      >
                        Mark complete
                      </Button>
                    )}
                    {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-neutral-400" />}
                  </div>
                )}
              </ListCard>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

type DocumentType = 'medicalRecord' | 'referralLetter' | 'insuranceCard' | 'otherDocument'

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'medicalRecord', label: 'Medical record or scan' },
  { value: 'referralLetter', label: 'Referral letter' },
  { value: 'insuranceCard', label: 'Insurance / HMO card' },
  { value: 'otherDocument', label: 'Other' },
]

function formatFileSize(bytes: number | undefined) {
  if (!bytes) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function DocumentsTab({ patientId, documents }: { patientId: Id<'users'>; documents: any[] }) {
  const { requireFullAccess } = useClinicPreview()
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const attachDocument = useMutation(api.clinicTools.attachPatientDocument)
  const [docType, setDocType] = useState<DocumentType>('medicalRecord')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Upload document')) return
    if (!selectedFile) {
      toast.error('Choose a file to upload')
      return
    }
    setUploading(true)
    try {
      const uploadUrl = await generateUploadUrl({
        fileType: selectedFile.type || 'application/pdf',
        fileName: selectedFile.name,
      })
      const postRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
        body: selectedFile,
      })
      if (!postRes.ok) throw new Error('The upload did not go through. Please try again.')
      const { storageId } = await postRes.json()
      await attachDocument({
        patientId,
        storageId,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type || 'application/pdf',
        documentType: docType,
      })
      toast.success('Document uploaded')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      toast.error(friendlyError(err, 'Could not upload the document. Please try again.'))
    } finally {
      setUploading(false)
    }
  }

  const typeLabel = (value: string) => DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? 'Document'
  const sorted = [...documents].sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0))

  return (
    <div className="space-y-6">
      <FormCard onSubmit={handleUpload}>
        <SectionHeading>Upload a document</SectionHeading>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Type</Label>
            <Select value={docType} onValueChange={(val) => setDocType(val as DocumentType)}>
              <SelectTrigger className={cn(fieldClass, 'h-9')} aria-label="Document type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="document-file" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              File (PDF or photo)
            </Label>
            <Input
              id="document-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className={cn(fieldClass, 'h-9 cursor-pointer')}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={uploading || !selectedFile}
            className={cn(primaryButtonClass, 'h-9 w-full sm:w-auto')}
          >
            {uploading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </FormCard>

      <div className="space-y-3">
        <SectionHeading>Documents</SectionHeading>
        {sorted.length === 0 ? (
          <p className="text-sm text-neutral-500">No documents yet.</p>
        ) : (
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {sorted.map((doc) => (
              <div key={doc._id} className="flex min-w-0 items-center gap-3 p-3">
                <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-900 dark:text-neutral-100">{doc.fileName}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {[typeLabel(doc.documentType), formatFileSize(doc.fileSize), formatDate(doc.uploadedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {doc.downloadUrl && (
                  <a
                    href={doc.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm font-medium text-[#005b57] hover:underline dark:text-[#2dd4bf]"
                  >
                    Open
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-ins
// ─────────────────────────────────────────────────────────────────────────────

type CheckInOutcome = 'continuing_care' | 'care_paused' | 'discharged' | 'unreachable'

const CHECK_IN_OUTCOMES: { value: CheckInOutcome; label: string; hint?: string }[] = [
  { value: 'continuing_care', label: 'Doing fine, continuing care' },
  { value: 'unreachable', label: "Couldn't reach the patient" },
  {
    value: 'care_paused',
    label: 'Pausing care',
    hint: 'This pauses their active home programme and removes them from your active patients.',
  },
  {
    value: 'discharged',
    label: 'Discharged',
    hint: 'This ends their care at your clinic and completes their active home programme.',
  },
]

/** "YYYY-MM-DD" from a date input → 09:00 local time on that day. */
function checkInTimestamp(value: string): number | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0)
  return isValid(date) ? date.getTime() : undefined
}

function CheckInsTab({
  patientId,
  checkIns,
  nextCheckInAt,
}: {
  patientId: Id<'users'>
  checkIns: SessionLog[]
  nextCheckInAt: number | null
}) {
  const { requireFullAccess } = useClinicPreview()
  const logFollowUp = useMutation(api.clinicTools.logPatientFollowUp)
  const [outcome, setOutcome] = useState<CheckInOutcome>('continuing_care')
  const [notes, setNotes] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [saving, setSaving] = useState(false)

  const hint = CHECK_IN_OUTCOMES.find((o) => o.value === outcome)?.hint
  const canScheduleNext = outcome === 'continuing_care' || outcome === 'unreachable'
  const nextCheckInLabel = formatDate(nextCheckInAt)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Log check-in')) return
    if (!notes.trim()) {
      toast.error('Write a short note about the check-in')
      return
    }
    const nextAt = canScheduleNext && nextDate ? checkInTimestamp(nextDate) : undefined
    if (canScheduleNext && nextDate && nextAt === undefined) {
      toast.error('Pick a valid date for the next check-in')
      return
    }
    setSaving(true)
    try {
      await logFollowUp({ patientId, outcome, notes: notes.trim(), nextCheckInAt: nextAt })
      toast.success('Check-in saved')
      setNotes('')
      setNextDate('')
      setOutcome('continuing_care')
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save the check-in. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <FormCard onSubmit={handleSubmit}>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <SectionHeading>Log a check-in</SectionHeading>
          {nextCheckInLabel && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Next check-in: <span className="text-neutral-900 dark:text-neutral-100">{nextCheckInLabel}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={cn('min-w-0 space-y-1.5', !canScheduleNext && 'sm:col-span-2')}>
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Outcome</Label>
            <Select value={outcome} onValueChange={(val) => setOutcome(val as CheckInOutcome)}>
              <SelectTrigger className={cn(fieldClass, 'h-9')} aria-label="Outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECK_IN_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hint && <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
          </div>
          {canScheduleNext && (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="checkin-next" className={labelClass}>
                Next check-in (optional)
              </Label>
              <Input
                id="checkin-next"
                type="date"
                min={format(new Date(), 'yyyy-MM-dd')}
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className={cn(fieldClass, 'h-9')}
              />
              {outcome === 'unreachable' && !nextDate && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Leave empty to try again tomorrow.</p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkin-notes" className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Note
          </Label>
          <Textarea
            id="checkin-notes"
            rows={3}
            placeholder="e.g. Called on WhatsApp. Knee is better, will book next week."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={saving} className={cn(primaryButtonClass, 'h-9 w-full sm:w-auto')}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save check-in
          </Button>
        </div>
      </FormCard>

      <div className="space-y-3">
        <SectionHeading>Past check-ins</SectionHeading>
        {checkIns.length === 0 ? (
          <p className="text-sm text-neutral-500">No check-ins logged yet.</p>
        ) : (
          checkIns.map((log) => (
            <ListCard key={log._id} className="space-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {log.subjectiveAssessment?.replace(/^Check-in:\s*/, '') || 'Check-in'}
                </span>
                <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {[formatDate(log.sessionDate, 'd MMM yyyy, h:mm a'), log.clinicianName].filter(Boolean).join(' · ')}
                </span>
              </div>
              {log.treatmentAdministered && (
                <p className="whitespace-pre-line break-words text-sm text-neutral-700 dark:text-neutral-300">
                  {log.treatmentAdministered}
                </p>
              )}
            </ListCard>
          ))
        )}
      </div>
    </div>
  )
}
