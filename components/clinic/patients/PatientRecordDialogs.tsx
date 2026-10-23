'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '@/convex/_generated/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { format, isValid } from 'date-fns'
import { cn } from '@/lib/utils'
import { useClinicPreview } from '@/components/clinic/ClinicPreviewContext'
import { primaryButtonClass } from '@/components/clinic/ui'
import {
  fieldClass,
  friendlyError,
  isPreviewId,
  labelClass,
  type ClinicianOption,
} from './patient-record-shared'

type PatientRecord = NonNullable<FunctionReturnType<typeof api.clinicTools.getClinicPatientFullRecord>>
type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say'

const dialogClass =
  'w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6'

function DialogHead({ title, description }: { title: string; description: string }) {
  return (
    <DialogHeader className="space-y-1 text-left">
      <DialogTitle className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{title}</DialogTitle>
      <DialogDescription className="text-sm text-neutral-500 dark:text-neutral-400">{description}</DialogDescription>
    </DialogHeader>
  )
}

function DialogActions({
  onCancel,
  saving,
  submitLabel,
  disabled,
}: {
  onCancel: () => void
  saving: boolean
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving} className="h-9 text-sm">
        Cancel
      </Button>
      <Button
        type="submit"
        size="sm"
        disabled={saving || disabled}
        className={cn(primaryButtonClass, 'h-9 px-4 text-sm font-medium')}
      >
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  )
}

/** Stored dates may be "YYYY-MM-DD", a full ISO string or a timestamp; date inputs need YYYY-MM-DD. */
function toDateInputValue(value: string | undefined) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(/^\d+$/.test(value) ? Number(value) : value)
  return isValid(date) ? format(date, 'yyyy-MM-dd') : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit details
// ─────────────────────────────────────────────────────────────────────────────

export function EditPatientDetailsDialog({
  record,
  open,
  onOpenChange,
}: {
  record: PatientRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(dialogClass, 'max-w-xl space-y-5')}>
        <DialogHead
          title="Edit patient details"
          description="Changes show on the patient's record straight away."
        />
        {/* Mounted only while open, so the form always starts from the latest record */}
        {open && <EditDetailsForm record={record} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function EditDetailsForm({ record, onDone }: { record: PatientRecord; onDone: () => void }) {
  const { requireFullAccess } = useClinicPreview()
  const updateDetails = useMutation(api.clinicTools.updateClinicPatientDetails)
  const resendInvite = useMutation(api.clinicTools.resendClinicPatientInvite)
  const { patient, profile } = record
  // Until the patient creates their account the clinic can fix the email (e.g. a typo)
  const canEditEmail = !patient.hasAccount
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    email: patient.email ?? '',
    firstName: patient.firstName ?? '',
    lastName: patient.lastName ?? '',
    phoneNumber: patient.phoneNumber ?? '',
    dateOfBirth: toDateInputValue(profile?.dateOfBirth),
    gender: (profile?.gender ?? '') as Gender | '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    medicalHistorySummary: profile?.medicalHistorySummary ?? '',
    emergencyName: profile?.emergencyContact?.name ?? '',
    emergencyRelationship: profile?.emergencyContact?.relationship ?? '',
    emergencyPhone: profile?.emergencyContact?.phone ?? '',
  })

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!requireFullAccess('Edit patient details')) return
    if (isPreviewId(patient._id)) return
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error('Enter a first and last name')
      return
    }
    const emergencyName = form.emergencyName.trim()
    const emergencyPhone = form.emergencyPhone.trim()
    if (Boolean(emergencyName) !== Boolean(emergencyPhone)) {
      toast.error('Add both a name and a phone number for the emergency contact, or leave both empty')
      return
    }
    const newEmail = form.email.trim().toLowerCase()
    const emailChanged = canEditEmail && newEmail !== '' && newEmail !== (patient.email ?? '').toLowerCase()
    setSaving(true)
    try {
      await updateDetails({
        patientId: patient._id,
        email: emailChanged ? newEmail : undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phoneNumber: form.phoneNumber.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        medicalHistorySummary: form.medicalHistorySummary.trim() || undefined,
        emergencyContact:
          emergencyName && emergencyPhone
            ? { name: emergencyName, relationship: form.emergencyRelationship.trim(), phone: emergencyPhone }
            : undefined,
      })
      if (emailChanged) {
        // The first invite went to the old address, so send it to the corrected one
        await resendInvite({ patientId: patient._id })
        toast.success('Details saved', { description: `Invite email sent to ${newEmail}.` })
      } else {
        toast.success('Patient details saved')
      }
      onDone()
    } catch (err) {
      toast.error(friendlyError(err, 'Could not save the details. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-first-name" className={labelClass}>
            First name
          </Label>
          <Input
            id="edit-first-name"
            required
            value={form.firstName}
            onChange={set('firstName')}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-last-name" className={labelClass}>
            Last name
          </Label>
          <Input
            id="edit-last-name"
            required
            value={form.lastName}
            onChange={set('lastName')}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-email" className={labelClass}>
            Email
          </Label>
          {canEditEmail ? (
            <>
              <Input
                id="edit-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                className={cn(fieldClass, 'h-9')}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                They haven&apos;t created their account yet. If you change this, we&apos;ll send the invite to the new
                address.
              </p>
            </>
          ) : (
            <>
              <Input
                id="edit-email"
                value={patient.email ?? ''}
                readOnly
                disabled
                className={cn(fieldClass, 'h-9 text-neutral-500 dark:text-neutral-400')}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                The patient signs in with this, so only they can change it.
              </p>
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-phone" className={labelClass}>
            Phone number
          </Label>
          <Input
            id="edit-phone"
            type="tel"
            placeholder="+234 801 234 5678"
            value={form.phoneNumber}
            onChange={set('phoneNumber')}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-dob" className={labelClass}>
            Date of birth
          </Label>
          <Input
            id="edit-dob"
            type="date"
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={labelClass}>Gender</Label>
          <Select
            value={form.gender}
            onValueChange={(val) => setForm((prev) => ({ ...prev, gender: val as Gender }))}
          >
            <SelectTrigger className={cn(fieldClass, 'h-9')} aria-label="Gender">
              <SelectValue placeholder="Not recorded" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-address" className={labelClass}>
            Address
          </Label>
          <Input
            id="edit-address"
            value={form.address}
            onChange={set('address')}
            className={cn(fieldClass, 'h-9')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-city" className={labelClass}>
            City
          </Label>
          <Input id="edit-city" value={form.city} onChange={set('city')} className={cn(fieldClass, 'h-9')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-history" className={labelClass}>
          Medical history
        </Label>
        <Textarea
          id="edit-history"
          rows={3}
          placeholder="Past surgeries, other conditions (e.g. diabetes, hypertension), allergies, medicines"
          value={form.medicalHistorySummary}
          onChange={set('medicalHistorySummary')}
          className={fieldClass}
        />
      </div>

      <fieldset className="space-y-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <legend className="px-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">Emergency contact</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-ec-name" className={labelClass}>
              Name
            </Label>
            <Input
              id="edit-ec-name"
              value={form.emergencyName}
              onChange={set('emergencyName')}
              className={cn(fieldClass, 'h-9')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-ec-relationship" className={labelClass}>
              Relationship
            </Label>
            <Input
              id="edit-ec-relationship"
              placeholder="e.g. Sister"
              value={form.emergencyRelationship}
              onChange={set('emergencyRelationship')}
              className={cn(fieldClass, 'h-9')}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="edit-ec-phone" className={labelClass}>
              Phone number
            </Label>
            <Input
              id="edit-ec-phone"
              type="tel"
              value={form.emergencyPhone}
              onChange={set('emergencyPhone')}
              className={cn(fieldClass, 'h-9')}
            />
          </div>
        </div>
      </fieldset>

      <DialogActions onCancel={onDone} saving={saving} submitLabel="Save details" />
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinician picker (reopen care, change clinician)
// ─────────────────────────────────────────────────────────────────────────────

export function ClinicianPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  options,
  defaultId,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  submitLabel: string
  options: ClinicianOption[]
  defaultId: string | null
  /** Resolves when saved; throws to keep the dialog open. */
  onConfirm: (clinicianId: string) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(dialogClass, 'max-w-md space-y-5')}>
        <DialogHead title={title} description={description} />
        {open && (
          <ClinicianPickerForm
            options={options}
            defaultId={defaultId}
            submitLabel={submitLabel}
            onConfirm={onConfirm}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ClinicianPickerForm({
  options,
  defaultId,
  submitLabel,
  onConfirm,
  onDone,
}: {
  options: ClinicianOption[]
  defaultId: string | null
  submitLabel: string
  onConfirm: (clinicianId: string) => Promise<void>
  onDone: () => void
}) {
  const [picked, setPicked] = useState('')
  const [saving, setSaving] = useState(false)
  const fallback = defaultId && options.some((o) => o.id === defaultId) ? defaultId : (options[0]?.id ?? '')
  const value = picked || fallback

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!value || isPreviewId(value)) return
    setSaving(true)
    try {
      await onConfirm(value)
      onDone()
    } catch {
      // onConfirm shows its own error
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label className={labelClass}>Clinician</Label>
        {options.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No other clinicians are available.</p>
        ) : (
          <Select value={value} onValueChange={setPicked}>
            <SelectTrigger className={cn(fieldClass, 'h-9')} aria-label="Clinician">
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
        )}
      </div>
      <DialogActions onCancel={onDone} saving={saving} submitLabel={submitLabel} disabled={!value} />
    </form>
  )
}
