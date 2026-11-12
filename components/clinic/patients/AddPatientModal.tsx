'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAction, useMutation } from 'convex/react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/clinic/drawerDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ChevronDown, UserPlus, Loader2 } from '@/components/icons'
import { primaryButtonClass } from '@/components/clinic/ui'
import { friendlyError, useClinicianOptions } from './patient-record-shared'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { InviteStep } from '@/components/patient-join/InviteStep'
import { StepDots, StepSlide } from '@/components/patient-join/StepDrawerBody'
import { DuplicateHint, formatLocalPhone, useDuplicateCheck } from '@/components/patient-join/useDuplicateCheck'
import { getInviteLink } from '@/components/patient-join/inviteLinkCache'
import { joinRefs } from '@/components/patient-join/refs'

interface AddPatientModalProps {
  isOpen: boolean
  onClose: () => void
  /** The patient just added (e.g. so a booking form can choose them straight away) */
  onSuccess?: (added: { patientId: string; clinicianId: string; name: string }) => void
}

const EMPTY = {
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
}

const field = 'h-10 text-sm bg-pt-surface border-pt-line'

/**
 * Add a clinic patient in two quick steps: WhatsApp number (checked against the clinic's patients
 * as it's typed), name and clinician; then their link on WhatsApp or a QR code at reception, with
 * live progress. Everything else is optional, under "More details". From a booking form the
 * patient is handed straight back to the booking instead.
 */
export default function AddPatientModal({ isOpen, onClose, onSuccess }: AddPatientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [invite, setInvite] = useState<{ patientId: string; name: string } | null>(null)
  const [more, setMore] = useState(false)
  const [formData, setFormData] = useState(EMPTY)
  const addPatient = useMutation(api.clinicTools.addClinicPatient)
  const createLink = useAction(joinRefs.createInviteLink)
  const clinicianOptions = useClinicianOptions()
  const duplicate = useDuplicateCheck(formData.phoneNumber)

  const reset = () => {
    setFormData(EMPTY)
    setMore(false)
    setInvite(null)
  }
  const close = () => {
    onClose()
    window.setTimeout(reset, 250)
  }
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((d) => ({ ...d, [key]: e.target.value }))

  const goToInvite = (patient: { patientId: string; name: string }) => {
    void getInviteLink(createLink, patient.patientId).catch(() => undefined)
    setInvite(patient)
  }

  const useExisting = () => {
    if (!duplicate) return
    playSound('success')
    if (onSuccess) {
      onClose()
      onSuccess({ patientId: duplicate.patientId, clinicianId: '', name: duplicate.name })
      window.setTimeout(reset, 250)
      return
    }
    goToInvite({ patientId: duplicate.patientId, name: duplicate.name })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.phoneNumber.replace(/\D/g, '').length < 10) {
      toast.error('Enter their WhatsApp number. They join and sign in with it.')
      return
    }
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      toast.error('Enter the first name and last name')
      return
    }
    const email = formData.email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setMore(true)
      toast.error('That email address doesn’t look right. Check it, or leave it empty.')
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
        email: email || undefined,
        phoneNumber: formData.phoneNumber.trim(),
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        medicalHistorySummary: formData.medicalHistorySummary.trim() || undefined,
        initialDiagnosis: formData.initialDiagnosis.trim() || undefined,
        assignedClinicianId: clinicianId as Id<'users'>,
      })
      const added = {
        patientId: String(result?.patientId ?? ''),
        clinicianId: String(result?.clinicianId ?? clinicianId),
        name: `${formData.firstName.trim()} ${formData.lastName.trim()}`,
      }
      playSound('success')
      if (result?.existingAccount) {
        toast.success('Already on Rehabify', { description: 'Their existing record was linked instead of making a duplicate.' })
      }
      if (!onSuccess && added.patientId) {
        goToInvite({ patientId: added.patientId, name: added.name })
        return
      }
      onClose()
      if (added.patientId) onSuccess?.(added)
      window.setTimeout(reset, 250)
    } catch (err: any) {
      // Show the backend's reason (e.g. the email belongs to a staff account)
      toast.error(friendlyError(err, 'Could not add the patient. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const first = invite?.name.split(' ')[0] || 'them'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl max-h-[90vh] overflow-y-auto bg-pt-surface border-pt-line p-4 sm:p-6 space-y-4">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight text-pt-ink">
            {invite ? `Send ${first} their link` : 'Add patient'}
          </DialogTitle>
          <DialogDescription className="text-sm text-pt-muted">
            {invite ? `${invite.name} is on your clinic’s list.` : 'Their WhatsApp number, name and clinician. That’s all you need.'}
          </DialogDescription>
        </DialogHeader>

        {!onSuccess && <StepDots step={invite ? 2 : 1} />}

        <StepSlide stepKey={invite ? `invite-${invite.patientId}` : 'details'} direction={invite ? 1 : -1}>
          {invite ? (
            <InviteStep
              patientId={invite.patientId}
              firstName={first}
              onDone={close}
              onAddAnother={reset}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-pt-ink">WhatsApp number *</Label>
                <Input
                  required
                  autoFocus
                  type="tel"
                  inputMode="tel"
                  placeholder="0803 123 4567"
                  value={formData.phoneNumber}
                  onChange={set('phoneNumber')}
                  onBlur={() => setFormData((d) => ({ ...d, phoneNumber: formatLocalPhone(d.phoneNumber) }))}
                  className={cn(field, 'h-11 text-[15px]')}
                />
                <DuplicateHint duplicate={duplicate} onUse={useExisting} actionLabel={onSuccess ? 'Use this patient' : 'Send their link'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-pt-ink">First name *</Label>
                  <Input required placeholder="e.g. Chinedu" value={formData.firstName} onChange={set('firstName')} className={field} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-pt-ink">Last name *</Label>
                  <Input required placeholder="e.g. Okafor" value={formData.lastName} onChange={set('lastName')} className={field} />
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
                    onValueChange={(val) => setFormData((d) => ({ ...d, assignedClinicianId: val }))}
                  >
                    <SelectTrigger className={field}>
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

              <div className="rounded-2xl border border-pt-line">
                <button
                  type="button"
                  onClick={() => setMore((open) => !open)}
                  aria-expanded={more}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-pt-ink"
                >
                  <span>
                    More details <span className="font-normal text-pt-muted">(optional)</span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 text-pt-faint transition-transform duration-200', more && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {more && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 px-4 pb-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-pt-ink">
                            Email <span className="font-normal text-pt-muted">(if they have one)</span>
                          </Label>
                          <Input type="email" placeholder="patient@example.com" value={formData.email} onChange={set('email')} className={field} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-pt-ink">Date of birth</Label>
                            <Input type="date" value={formData.dateOfBirth} onChange={set('dateOfBirth')} className={field} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-pt-ink">Gender</Label>
                            <Select value={formData.gender} onValueChange={(val: any) => setFormData((d) => ({ ...d, gender: val }))}>
                              <SelectTrigger className={field}>
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
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-pt-ink">Main complaint</Label>
                          <Input placeholder="e.g. Low back pain going down the left leg" value={formData.initialDiagnosis} onChange={set('initialDiagnosis')} className={field} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-pt-ink">Medical history</Label>
                          <Textarea
                            placeholder="Past surgeries, other conditions (e.g. diabetes, hypertension), allergies, medicines"
                            value={formData.medicalHistorySummary}
                            onChange={set('medicalHistorySummary')}
                            rows={3}
                            className="text-sm bg-pt-surface border-pt-line"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={close} disabled={isSubmitting} className="h-10 text-sm font-medium">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className={cn('h-10 px-4 text-sm font-medium sm:min-w-[170px]', primaryButtonClass)}>
                  {isSubmitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
                  {onSuccess ? 'Add patient' : 'Add and continue'}
                </Button>
              </div>
            </form>
          )}
        </StepSlide>
      </DialogContent>
    </Dialog>
  )
}
