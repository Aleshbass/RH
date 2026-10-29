'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/clinic/drawerDialog'
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
import { UserPlus, Loader2 } from '@/components/icons'
import { primaryButtonClass } from '@/components/clinic/ui'
import { friendlyError, useClinicianOptions } from './patient-record-shared'
import { playSound } from '@/lib/sounds'

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddPatientModal({ isOpen, onClose, onSuccess }: AddPatientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    dateOfBirth: '',
    gender: 'prefer_not_to_say' as 'male' | 'female' | 'other' | 'prefer_not_to_say',
    address: '',
    city: '',
    medicalHistorySummary: '',
    initialDiagnosis: '',
    assignedClinicianId: '',
  })

  const addPatient = useMutation(api.clinicTools.addClinicPatient)
  const clinicianOptions = useClinicianOptions()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      toast.error('Enter first name, last name and email')
      return
    }
    const clinicianId = formData.assignedClinicianId || clinicianOptions.defaultId
    if (!clinicianId) {
      toast.error('Choose the clinician who will treat this patient')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await addPatient({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        medicalHistorySummary: formData.medicalHistorySummary.trim() || undefined,
        initialDiagnosis: formData.initialDiagnosis.trim() || undefined,
        assignedClinicianId: clinicianId as Id<'users'>,
      })

      const emailNote = result?.emailSent
        ? `We've emailed ${formData.email.trim()} a link to see their appointments and exercises.`
        : undefined
      playSound('success')
      toast.success(result?.patientNumber ? `Patient added · ${result.patientNumber}` : 'Patient added', {
        description: result?.existingAccount
          ? `Already on Rehabify, so their existing record was linked instead of making a duplicate.${emailNote ? ` ${emailNote}` : ''}`
          : emailNote,
      })
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        dateOfBirth: '',
        gender: 'prefer_not_to_say',
        address: '',
        city: '',
        medicalHistorySummary: '',
        initialDiagnosis: '',
        assignedClinicianId: '',
      })
      onClose()
      onSuccess?.()
    } catch (err: any) {
      // Show the backend's reason (e.g. the email belongs to a staff account)
      toast.error(friendlyError(err, 'Could not add the patient. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto bg-pt-surface border-pt-line p-4 sm:p-6 space-y-5">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-pt-ink">
            Add patient
          </DialogTitle>
          <DialogDescription className="text-sm text-pt-muted">
            Creates a record for this patient at your clinic and emails them a link to their Rehabify account.
            Only name and email are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Name Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-pt-ink">
                First name *
              </Label>
              <Input
                required
                placeholder="e.g. Chinedu"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="h-9 text-sm bg-pt-surface border-pt-line"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-pt-ink">
                Last name *
              </Label>
              <Input
                required
                placeholder="e.g. Okafor"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="h-9 text-sm bg-pt-surface border-pt-line"
              />
            </div>
          </div>

          {/* Contact Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-pt-ink">
                Email *
              </Label>
              <Input
                type="email"
                required
                placeholder="patient@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-9 text-sm bg-pt-surface border-pt-line"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-pt-ink">
                Phone number
              </Label>
              <Input
                placeholder="+234 801 234 5678"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="h-9 text-sm bg-pt-surface border-pt-line"
              />
            </div>
          </div>

          {/* Demographics Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-pt-ink">
                Date of birth
              </Label>
              <Input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="h-9 text-sm bg-pt-surface border-pt-line"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-pt-ink">
                Gender
              </Label>
              <Select
                value={formData.gender}
                onValueChange={(val: any) => setFormData({ ...formData, gender: val })}
              >
                <SelectTrigger className="h-9 text-sm bg-pt-surface border-pt-line">
                  <SelectValue placeholder="Select gender" />
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

          {/* Every clinic patient has a treating clinician; the patient stays the clinic's */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-pt-ink">
              Clinician <span className="text-pt-rose-fg">*</span>
            </Label>
            {!clinicianOptions.loading && clinicianOptions.options.length === 0 ? (
              <p className="rounded-lg bg-pt-amber-bg px-3 py-2 text-xs text-pt-amber-fg">
                Invite a clinician first: every patient is looked after by someone on your team.{' '}
                <Link href="/dashboard/clinic/staff" className="font-medium underline">
                  Go to Team
                </Link>
              </p>
            ) : (
              <Select
                value={formData.assignedClinicianId || clinicianOptions.defaultId || ''}
                onValueChange={(val) => setFormData({ ...formData, assignedClinicianId: val })}
              >
                <SelectTrigger className="h-9 text-sm bg-pt-surface border-pt-line">
                  <SelectValue placeholder="Choose a clinician" />
                </SelectTrigger>
                <SelectContent>
                  {/* Active clinicians only: suspended clinicians would be rejected */}
                  {clinicianOptions.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Clinical Impression / Presenting Condition */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-pt-ink">
              Main complaint
            </Label>
            <Input
              placeholder="e.g. Low back pain going down the left leg"
              value={formData.initialDiagnosis}
              onChange={(e) => setFormData({ ...formData, initialDiagnosis: e.target.value })}
              className="h-9 text-sm bg-pt-surface border-pt-line"
            />
          </div>

          {/* Medical History Summary */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-pt-ink">
              Medical history
            </Label>
            <Textarea
              placeholder="Past surgeries, other conditions (e.g. diabetes, hypertension), allergies, medicines"
              value={formData.medicalHistorySummary}
              onChange={(e) => setFormData({ ...formData, medicalHistorySummary: e.target.value })}
              rows={3}
              className="text-sm bg-pt-surface border-pt-line"
            />
          </div>

          <div className="pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className={`h-9 px-4 text-sm font-medium ${primaryButtonClass}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Add patient
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
