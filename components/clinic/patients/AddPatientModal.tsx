'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { UserPlus, Loader2 } from 'lucide-react'
import { primaryButtonClass } from '@/components/clinic/ui'
import { friendlyError, useClinicianOptions } from './patient-record-shared'

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
        assignedClinicianId: formData.assignedClinicianId ? (formData.assignedClinicianId as any) : undefined,
      })

      toast.success('Patient added', {
        description: result?.emailSent
          ? `We've emailed ${formData.email.trim()} a link to see their appointments and exercises.`
          : undefined,
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 space-y-5">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Add patient
          </DialogTitle>
          <DialogDescription className="text-sm text-neutral-500">
            Creates a record for this patient at your clinic and emails them a link to their Rehabify account.
            Only name and email are required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Name Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                First name *
              </Label>
              <Input
                required
                placeholder="e.g. Chinedu"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Last name *
              </Label>
              <Input
                required
                placeholder="e.g. Okafor"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
              />
            </div>
          </div>

          {/* Contact Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Email *
              </Label>
              <Input
                type="email"
                required
                placeholder="patient@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Phone number
              </Label>
              <Input
                placeholder="+234 801 234 5678"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
              />
            </div>
          </div>

          {/* Demographics Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Date of birth
              </Label>
              <Input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Gender
              </Label>
              <Select
                value={formData.gender}
                onValueChange={(val: any) => setFormData({ ...formData, gender: val })}
              >
                <SelectTrigger className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800">
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

          {/* Assign Clinician */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Clinician
            </Label>
            <Select
              value={formData.assignedClinicianId}
              onValueChange={(val) => setFormData({ ...formData, assignedClinicianId: val })}
            >
              <SelectTrigger className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800">
                <SelectValue placeholder="Choose a clinician (optional)" />
              </SelectTrigger>
              <SelectContent>
                {/* Owner and active clinicians only: suspended clinicians would be rejected */}
                {clinicianOptions.options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clinical Impression / Presenting Condition */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Main complaint
            </Label>
            <Input
              placeholder="e.g. Low back pain going down the left leg"
              value={formData.initialDiagnosis}
              onChange={(e) => setFormData({ ...formData, initialDiagnosis: e.target.value })}
              className="h-9 text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
            />
          </div>

          {/* Medical History Summary */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Medical history
            </Label>
            <Textarea
              placeholder="Past surgeries, other conditions (e.g. diabetes, hypertension), allergies, medicines"
              value={formData.medicalHistorySummary}
              onChange={(e) => setFormData({ ...formData, medicalHistorySummary: e.target.value })}
              rows={3}
              className="text-sm bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
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
