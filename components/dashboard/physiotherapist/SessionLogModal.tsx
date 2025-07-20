'use client'

import { useState, useEffect } from 'react'
import { useMutation } from 'convex/react'
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
import { Loader2, FileText, Mic, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { TemplateSelector } from './TemplateSelector'
// import { useToast } from '@/components/ui/use-toast'

interface SessionLogModalProps {
  isOpen: boolean
  onClose: () => void
  appointmentId: Id<'appointments'>
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
  // Simple toast replacement - can be enhanced later
  const toast = ({ title, description, variant }: { title: string; description: string; variant?: string }) => {
    console.log(`${variant === 'destructive' ? 'ERROR' : 'SUCCESS'}: ${title} - ${description}`)
    alert(`${title}: ${description}`)
  }
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

  // Initialize form data when modal opens or existing session log changes
  useEffect(() => {
    if (existingSessionLog) {
      setFormData({
        subjectiveAssessment: existingSessionLog.subjectiveAssessment || '',
        objectiveAssessment: existingSessionLog.objectiveAssessment || '',
        treatmentAdministered: existingSessionLog.treatmentAdministered || '',
        planForNextSession: existingSessionLog.planForNextSession || '',
      })
    } else {
      setFormData({
        subjectiveAssessment: '',
        objectiveAssessment: '',
        treatmentAdministered: '',
        planForNextSession: '',
      })
    }
  }, [existingSessionLog, isOpen])

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async () => {
    if (!appointmentId) return

    // Validate that at least one field is filled
    const hasContent = Object.values(formData).some(value => value.trim().length > 0)
    if (!hasContent) {
      toast({
        title: "Error",
        description: "Please fill in at least one assessment field.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (existingSessionLog) {
        // Update existing session log
        await updateSessionLog({
          sessionLogId: existingSessionLog._id,
          ...formData,
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
        })
        toast({
          title: "Success",
          description: "Session log created successfully.",
        })
      }

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error('Error saving session log:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save session log.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEditing = !!existingSessionLog

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
              clinicId={appointmentDetails?.serviceType}
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

          {/* Future Features - Voice Notes & Attachments */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Additional Options</h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled className="opacity-50">
                  <Mic className="h-4 w-4 mr-2" />
                  Voice Note
                  <Badge variant="secondary" className="ml-2 text-xs">Soon</Badge>
                </Button>
                <Button variant="outline" size="sm" disabled className="opacity-50">
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attachments
                  <Badge variant="secondary" className="ml-2 text-xs">Soon</Badge>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? 'Update Session Log' : 'Create Session Log'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 