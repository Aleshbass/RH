'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, FileText } from '@/components/icons'
import { toast as sonner } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { NoteMediaControls, useNoteMedia } from '@/components/physio/NoteMedia'
import { playSound } from '@/lib/sounds'
import { format } from 'date-fns'
import { programError } from '@/components/exercise-programs/errors'
import { TemplateSelector } from './TemplateSelector'
// import { useToast } from '@/components/ui/use-toast'

interface SessionLogModalProps {
  /** Whether modal is open */
  isOpen: boolean
  onClose: () => void
  /** Optional patient ID for convenience */
  patientId?: string | Id<'users'>
  appointmentId?: Id<'appointments'>
  appointmentDetails?: {
    patient: {
      firstName: string
      lastName: string
    }
    startTime: number
    serviceType: string
  }
  existingSessionLog?: {
    _id: Id<'sessionLogs'>
    subjectiveAssessment?: string
    objectiveAssessment?: string
    treatmentAdministered?: string
    planForNextSession?: string
    voiceNoteUrl?: string
    attachments?: Id<'_storage'>[]
  }
  onSuccess?: () => void
}

export function SessionLogModal({
  isOpen,
  onClose,
  appointmentId,
  appointmentDetails,
  existingSessionLog,
  onSuccess,
}: SessionLogModalProps) {
  const toast = ({ description, variant }: { title: string; description: string; variant?: string }) => {
    if (variant === 'destructive') sonner.error(description)
    else sonner.success(description)
  }
  const media = useNoteMedia()
  const resetMedia = media.reset
  const [formData, setFormData] = useState({
    subjectiveAssessment: '',
    objectiveAssessment: '',
    treatmentAdministered: '',
    planForNextSession: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mutations
  const createSessionLog = useMutation(api.sessionLogs.createSessionLog)
  const updateSessionLog = useMutation(api.sessionLogs.updateSessionLog)

  // Opened from the calendar with just the visit: load the notes already written for it, so a
  // second save edits them instead of trying to create a duplicate.
  const loadedSessionLog = useQuery(
    api.sessionLogs.getMySessionLogForAppointment,
    isOpen && appointmentId && !existingSessionLog ? { appointmentId } : 'skip'
  ) as SessionLogModalProps['existingSessionLog'] | null | undefined
  const sessionLog = existingSessionLog ?? loadedSessionLog ?? undefined
  const loadingSessionLog = isOpen && Boolean(appointmentId) && !existingSessionLog && loadedSessionLog === undefined

  // Initialize form data when modal opens or existing session log changes
  useEffect(() => {
    if (sessionLog) {
      setFormData({
        subjectiveAssessment: sessionLog.subjectiveAssessment || '',
        objectiveAssessment: sessionLog.objectiveAssessment || '',
        treatmentAdministered: sessionLog.treatmentAdministered || '',
        planForNextSession: sessionLog.planForNextSession || '',
      })
    } else {
      setFormData({
        subjectiveAssessment: '',
        objectiveAssessment: '',
        treatmentAdministered: '',
        planForNextSession: '',
      })
    }
    resetMedia()
  }, [sessionLog, isOpen, resetMedia])

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async () => {
    if (!appointmentId) return

    // Validate that at least one field is filled
    const hasContent = Object.values(formData).some(value => value.trim().length > 0) || media.hasMedia
    if (!hasContent) {
      toast({
        title: "Error",
        description: "Fill in at least one section, record a voice note or attach a file.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (sessionLog) {
        // Update existing session log
        // The update replaces these fields, so keep what was already saved.
        await updateSessionLog({
          sessionLogId: sessionLog._id,
          ...formData,
          voiceNoteUrl: media.voiceStorageId ?? sessionLog.voiceNoteUrl,
          attachments: [...(sessionLog.attachments ?? []), ...media.attachmentIds],
        })
        toast({
          title: "Success",
          description: "Session log updated successfully.",
        })
      } else {
        // Create new session log
        await createSessionLog({
          appointmentId,
          ...formData,
          voiceNoteUrl: media.voiceStorageId,
          attachments: media.attachmentIds.length ? media.attachmentIds : undefined,
        })
        toast({
          title: "Success",
          description: "Session log created successfully.",
        })
      }

      playSound('success')
      onSuccess?.()
      onClose()
    } catch (error) {
      console.error('Error saving session log:', error)
      toast({
        title: "Error",
        description: programError(error, "Couldn’t save the session notes. Please try again."),
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEditing = !!sessionLog

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEditing ? 'Edit Session Log' : 'Create Session Log'}
          </DialogTitle>
          {appointmentDetails && (
            <DialogDescription>
              <div className="space-y-1">
                <p>
                  Patient: <span className="font-medium">
                    {appointmentDetails.patient.firstName} {appointmentDetails.patient.lastName}
                  </span>
                </p>
                <p>
                  Appointment: <span className="font-medium">
                    {appointmentDetails.serviceType} on {format(new Date(appointmentDetails.startTime), 'PPP')}
                  </span>
                </p>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        {loadingSessionLog && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for notes already written for this visit…
          </p>
        )}

        <div className="space-y-6">
          {/* Template Selector */}
          <div className="mb-4">
            <TemplateSelector
              onSelect={(content) => {
                // Update the appropriate field based on cursor focus
                const activeElement = document.activeElement as HTMLTextAreaElement
                if (activeElement?.id === 'subjectiveAssessment') {
                  setFormData(prev => ({
                    ...prev,
                    subjectiveAssessment: prev.subjectiveAssessment + 
                      (prev.subjectiveAssessment && !prev.subjectiveAssessment.endsWith('\n') ? '\n' : '') +
                      content
                  }))
                } else if (activeElement?.id === 'objectiveAssessment') {
                  setFormData(prev => ({
                    ...prev,
                    objectiveAssessment: prev.objectiveAssessment +
                      (prev.objectiveAssessment && !prev.objectiveAssessment.endsWith('\n') ? '\n' : '') +
                      content
                  }))
                } else if (activeElement?.id === 'treatmentAdministered') {
                  setFormData(prev => ({
                    ...prev,
                    treatmentAdministered: prev.treatmentAdministered +
                      (prev.treatmentAdministered && !prev.treatmentAdministered.endsWith('\n') ? '\n' : '') +
                      content
                  }))
                } else if (activeElement?.id === 'planForNextSession') {
                  setFormData(prev => ({
                    ...prev,
                    planForNextSession: prev.planForNextSession +
                      (prev.planForNextSession && !prev.planForNextSession.endsWith('\n') ? '\n' : '') +
                      content
                  }))
                }
              }}
              patientName={appointmentDetails?.patient.firstName}
              clinicId={appointmentDetails?.serviceType as Id<"clinics"> | undefined}
            />
          </div>

          {/* SOAP Note Structure */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Subjective Assessment */}
            <div className="space-y-2">
              <Label htmlFor="subjective" className="text-base font-semibold">
                Subjective Assessment
                <Badge variant="outline" className="ml-2 text-xs">S</Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Patient&apos;s reported symptoms, pain levels, concerns, and feedback
              </p>
              <Textarea
                id="subjective"
                placeholder="Patient reports decreased pain in lower back (3/10 vs 7/10 last week). States they've been doing prescribed exercises daily. Some stiffness in the morning..."
                value={formData.subjectiveAssessment}
                onChange={(e) => handleInputChange('subjectiveAssessment', e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>

            {/* Objective Assessment */}
            <div className="space-y-2">
              <Label htmlFor="objective" className="text-base font-semibold">
                Objective Assessment
                <Badge variant="outline" className="ml-2 text-xs">O</Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Observable findings, measurements, range of motion, strength tests
              </p>
              <Textarea
                id="objective"
                placeholder="ROM: Lumbar flexion 80° (improved from 60°), extension 20°. Straight leg raise negative bilaterally. Palpation reveals decreased muscle tension in paraspinals..."
                value={formData.objectiveAssessment}
                onChange={(e) => handleInputChange('objectiveAssessment', e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Assessment/Treatment */}
            <div className="space-y-2">
              <Label htmlFor="treatment" className="text-base font-semibold">
                Treatment Administered
                <Badge variant="outline" className="ml-2 text-xs">A</Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Interventions provided, techniques used, exercises performed
              </p>
              <Textarea
                id="treatment"
                placeholder="Manual therapy: soft tissue mobilization to lumbar paraspinals (10 min). Therapeutic exercise: core strengthening routine, hip flexor stretches. Patient education on posture..."
                value={formData.treatmentAdministered}
                onChange={(e) => handleInputChange('treatmentAdministered', e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>

            {/* Plan */}
            <div className="space-y-2">
              <Label htmlFor="plan" className="text-base font-semibold">
                Plan for Next Session
                <Badge variant="outline" className="ml-2 text-xs">P</Badge>
              </Label>
              <p className="text-sm text-muted-foreground">
                Goals, next steps, homework, follow-up recommendations
              </p>
              <Textarea
                id="plan"
                placeholder="Continue current exercise program. Progress to level 2 core exercises next session. Schedule follow-up in 1 week. Patient to continue daily walks, increase to 20 minutes..."
                value={formData.planForNextSession}
                onChange={(e) => handleInputChange('planForNextSession', e.target.value)}
                rows={6}
                className="resize-none"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="mb-3 text-sm font-medium text-muted-foreground">Voice note and attachments</h4>
            {sessionLog && (sessionLog.voiceNoteUrl || sessionLog.attachments?.length) ? (
              <p className="mb-3 text-xs text-muted-foreground">
                Already saved: {[sessionLog.voiceNoteUrl && 'a voice note', sessionLog.attachments?.length && `${sessionLog.attachments.length} file(s)`].filter(Boolean).join(' and ')}. Anything you add here is kept alongside.
              </p>
            ) : null}
            <NoteMediaControls media={media} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || media.recording}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || media.busy || loadingSessionLog}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Update Session Log' : 'Create Session Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 