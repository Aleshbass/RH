'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, UserPlus, Mail, Stethoscope, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useActionUntyped } from '@/lib/convexUntyped'
import { api } from '@/convex/_generated/api'

// Simple schema to avoid deep type instantiation
const physiotherapistSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phoneNumber: z.string().optional(),
  licenseNumber: z.string().optional(),
  specialization: z.string().optional(),
  experience: z.string().optional(),
  message: z.string().optional(),
  addMethod: z.enum(['direct', 'invite']),
})

type PhysiotherapistFormData = z.infer<typeof physiotherapistSchema>

interface AddPhysiotherapistDirectFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export default function AddPhysiotherapistDirectForm({ onSuccess, onCancel }: AddPhysiotherapistDirectFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use untyped action to avoid deep type instantiation
  const createClinicStaffInvitation = useActionUntyped(
    (api as any).actions.clinics.inviteClinicStaff.createClinicStaffInvitationWithNotification
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<PhysiotherapistFormData>({
    resolver: zodResolver(physiotherapistSchema),
    defaultValues: {
      addMethod: 'invite'
    }
  })

  const addMethod = watch('addMethod')

  const onSubmit = async (data: PhysiotherapistFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      if (data.addMethod === 'invite') {
        // Send invitation
        const inviteeName = `${data.firstName} ${data.lastName}`
        const message = data.message || `Welcome to our clinic! We'd like to invite you to join our team as a physiotherapist.${data.specialization ? ` We're particularly interested in your expertise in ${data.specialization}.` : ''}`

        const result = await createClinicStaffInvitation({
          inviteeEmail: data.email,
          inviteeName,
          message,
          sendEmail: true,
        })

        if (result?.success) {
          toast.success('Physiotherapist invitation sent successfully!')
          onSuccess?.()
        } else {
          throw new Error(result?.message || 'Failed to send invitation')
        }
      } else {
        // For direct addition, we would need a separate action
        // For now, we'll use the invitation method as fallback
        toast.info('Direct physiotherapist addition will be available soon. Sending invitation instead.')
        
        const inviteeName = `${data.firstName} ${data.lastName}`
        const message = data.message || `Welcome to our clinic! We'd like to invite you to join our team as a physiotherapist.${data.specialization ? ` We're particularly interested in your expertise in ${data.specialization}.` : ''}`

        const result = await createClinicStaffInvitation({
          inviteeEmail: data.email,
          inviteeName,
          message,
          sendEmail: true,
        })

        if (result?.success) {
          toast.success('Physiotherapist invitation sent successfully!')
          onSuccess?.()
        } else {
          throw new Error(result?.message || 'Failed to send invitation')
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Add New Physiotherapist
        </CardTitle>
        <CardDescription>
          Add a physiotherapist to your clinic by sending an invitation or creating their profile directly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Add Method Selection */}
          <div className="space-y-2">
            <Label htmlFor="addMethod">How would you like to add this physiotherapist?</Label>
            <Select 
              value={addMethod} 
              onValueChange={(value: 'direct' | 'invite') => setValue('addMethod', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invite">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Send Invitation Email
                  </div>
                </SelectItem>
                <SelectItem value="direct">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    Create Profile Directly
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register('firstName')}
                placeholder="Enter first name"
              />
              {errors.firstName && (
                <p className="text-sm text-red-600">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...register('lastName')}
                placeholder="Enter last name"
              />
              {errors.lastName && (
                <p className="text-sm text-red-600">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="physiotherapist@example.com"
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                {...register('phoneNumber')}
                placeholder="+234 xxx xxx xxxx"
              />
            </div>
          </div>

          {/* Professional Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                {...register('licenseNumber')}
                placeholder="Professional license number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialization">Specialization</Label>
              <Select onValueChange={(value) => setValue('specialization', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select specialization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orthopedic">Orthopedic Physiotherapy</SelectItem>
                  <SelectItem value="neurological">Neurological Physiotherapy</SelectItem>
                  <SelectItem value="cardiopulmonary">Cardiopulmonary Physiotherapy</SelectItem>
                  <SelectItem value="pediatric">Pediatric Physiotherapy</SelectItem>
                  <SelectItem value="geriatric">Geriatric Physiotherapy</SelectItem>
                  <SelectItem value="sports">Sports Physiotherapy</SelectItem>
                  <SelectItem value="women_health">Women's Health Physiotherapy</SelectItem>
                  <SelectItem value="general">General Physiotherapy</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <Label htmlFor="experience">Years of Experience</Label>
            <Select onValueChange={(value) => setValue('experience', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select experience level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0-1">0-1 years</SelectItem>
                <SelectItem value="2-5">2-5 years</SelectItem>
                <SelectItem value="6-10">6-10 years</SelectItem>
                <SelectItem value="11-15">11-15 years</SelectItem>
                <SelectItem value="16-20">16-20 years</SelectItem>
                <SelectItem value="20+">20+ years</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Personal Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Personal Message (Optional)</Label>
            <Textarea
              id="message"
              {...register('message')}
              placeholder="Add a personal message to include in the invitation..."
              rows={3}
            />
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {addMethod === 'invite' ? 'Sending Invitation...' : 'Adding Physiotherapist...'}
                </>
              ) : (
                <>
                  {addMethod === 'invite' ? (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Invitation
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add Physiotherapist
                    </>
                  )}
                </>
              )}
            </Button>
            
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
