 'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

interface PatientInviteModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (formData: { patientEmail: string; patientName?: string; notes?: string }) => Promise<boolean>
}

export function PatientInviteModal({ isOpen, onClose, onSubmit }: PatientInviteModalProps) {
  const [formData, setFormData] = useState({
    patientEmail: '',
    patientName: '',
    notes: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!formData.patientEmail) {
      toast.error('Email is required')
      return
    }

    setIsSubmitting(true)
    try {
      const success = await onSubmit({
        patientEmail: formData.patientEmail,
        patientName: formData.patientName || undefined,
        notes: formData.notes || undefined,
      })

      if (success) {
        toast.success(`Invitation sent successfully to ${formData.patientEmail}`)
        // Reset form
        setFormData({ patientEmail: '', patientName: '', notes: '' })
        // Close modal with slight delay for smooth UX
        setTimeout(() => {
          onClose()
        }, 500)
      } else {
        toast.error('Failed to send invitation. Please try again.')
      }
    } catch (error) {
      console.error('Error submitting invitation:', error)
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({ patientEmail: '', patientName: '', notes: '' })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite New Patient</DialogTitle>
          <DialogDescription>
            Send an invitation to a patient to join your practice on Rehabify Health.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Patient Email *</label>
            <Input
              type="email"
              placeholder="patient@example.com"
              value={formData.patientEmail}
              onChange={(e) => setFormData(prev => ({ ...prev, patientEmail: e.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Patient Name (Optional)</label>
            <Input
              placeholder="John Doe"
              value={formData.patientName}
              onChange={(e) => setFormData(prev => ({ ...prev, patientName: e.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
            <Textarea
              placeholder="Additional notes for the patient..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              <Send className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}