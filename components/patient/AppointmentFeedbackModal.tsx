"use client"

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Star, MessageSquare, ThumbsUp, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface AppointmentFeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  appointmentId: Id<"appointments">
  physiotherapistName: string
  appointmentDate: string
  serviceType: string
}

interface FeedbackCategory {
  key: string
  label: string
  icon: React.ElementType
}

const feedbackCategories: FeedbackCategory[] = [
  { key: 'overall_experience', label: 'Overall Experience', icon: ThumbsUp },
  { key: 'communication', label: 'Communication', icon: MessageSquare },
  { key: 'treatment_effectiveness', label: 'Treatment Effectiveness', icon: AlertCircle },
  { key: 'professionalism', label: 'Professionalism', icon: Star },
]

export function AppointmentFeedbackModal({
  isOpen,
  onClose,
  appointmentId,
  physiotherapistName,
  appointmentDate,
  serviceType
}: AppointmentFeedbackModalProps) {
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const submitFeedback = useMutation(api.appointments.submitPatientFeedback)
  
  const handleRatingChange = (category: string, rating: number) => {
    setRatings(prev => ({ ...prev, [category]: rating }))
  }
  
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true)
      
      // Validate that all categories have ratings
      const missingRatings = feedbackCategories.filter(cat => !ratings[cat.key])
      if (missingRatings.length > 0) {
        toast.error('Please provide ratings for all categories')
        return
      }
      
      // Calculate overall rating
      const overallRating = Math.round(
        Object.values(ratings).reduce((sum, rating) => sum + rating, 0) / Object.values(ratings).length
      )
      
      await submitFeedback({
        appointmentId,
        rating: overallRating,
        feedback: feedback.trim(),
        categoryRatings: ratings as {
          overall_experience: number;
          communication: number;
          treatment_effectiveness: number;
          professionalism: number;
        }
      })
      
      toast.success('Thank you for your feedback!')
      onClose()
      
      // Reset form
      setRatings({})
      setFeedback('')
      
    } catch (error) {
      console.error('Error submitting feedback:', error)
      toast.error('Failed to submit feedback. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const StarRating = ({ value, onChange }: { value: number; onChange: (rating: number) => void }) => {
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="focus:outline-none"
          >
            <Star
              className={`w-6 h-6 ${
                star <= value
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300 hover:text-yellow-300'
              } transition-colors`}
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-gray-600">
          {value ? `${value}/5` : 'Not rated'}
        </span>
      </div>
    )
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Star className="w-5 h-5 text-yellow-500" />
            <span>Rate Your Appointment</span>
          </DialogTitle>
          <DialogDescription>
            Please share your experience with {physiotherapistName} on {new Date(appointmentDate).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Appointment Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-800 mb-2">Appointment Details</h4>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-medium">Service:</span> {serviceType}</p>
              <p><span className="font-medium">Date:</span> {new Date(appointmentDate).toLocaleDateString()}</p>
              <p><span className="font-medium">Physiotherapist:</span> {physiotherapistName}</p>
            </div>
          </div>
          
          {/* Rating Categories */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-800">Rate Your Experience</h4>
            {feedbackCategories.map((category) => {
              const IconComponent = category.icon
              return (
                <div key={category.key} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <IconComponent className="w-5 h-5 text-blue-600" />
                      <Label className="font-medium">{category.label}</Label>
                    </div>
                    <StarRating
                      value={ratings[category.key] || 0}
                      onChange={(rating) => handleRatingChange(category.key, rating)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          
          {/* Written Feedback */}
          <div className="space-y-2">
            <Label htmlFor="feedback" className="font-medium">
              Additional Comments (Optional)
            </Label>
            <Textarea
              id="feedback"
              placeholder="Share any additional thoughts about your treatment, suggestions for improvement, or what went particularly well..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              Your feedback helps us improve our services and helps other patients.
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || Object.keys(ratings).length < feedbackCategories.length}
              className="flex-1"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 