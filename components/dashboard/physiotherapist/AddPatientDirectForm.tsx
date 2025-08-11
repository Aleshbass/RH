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
import { Loader2, UserPlus, Mail, Phone, Calendar, User } from 'lucide-react'
import { toast } from 'sonner'
import { useActionUntyped } from '@/lib/convexUntyped'
import { api } from '@/convex/_generated/api'

// Simple schema to avoid deep type instantiation
const patientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phoneNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  medicalHistory: z.string().optional(),
  emergencyContact: z.string().optional(),
  addMethod: z.enum(['direct', 'invite']),
})

type PatientFormData = z.infer<typeof patientSchema>

interface AddPatientDirectFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export default function AddPatientDirectForm({ onSuccess, onCancel }: AddPatientDirectFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Use untyped action to avoid deep type instantiation
  const createPatientInvitation = useActionUntyped(
    (api as any).actions.patients.invitePatient.createPatientInvitationWithNotification
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      addMethod: 'invite'
    }
  })

  const addMethod = watch('addMethod')

  const onSubmit = async (data: PatientFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      if (data.addMethod === 'invite') {
        // Send invitation
        const result = await createPatientInvitation({
          patientEmail: data.email,
          patientName: `${data.firstName} ${data.lastName}`,
          notes: data.medicalHistory || undefined,
          sendEmail: true,
        })

        if (result?.success) {
          toast.success('Patient invitation sent successfully!')
          onSuccess?.()
        } else {
          throw new Error(result?.message || 'Failed to send invitation')
        }
      } else {
        // For direct addition, we would need a separate action
        // For now, we'll use the invitation method as fallback
        toast.info('Direct patient addition will be available soon. Sending invitation instead.')
        
        const result = await createPatientInvitation({
          patientEmail: data.email,
          patientName: `${data.firstName} ${data.lastName}`,
          notes: data.medicalHistory || undefined,
          sendEmail: true,
        })

        if (result?.success) {
          toast.success('Patient invitation sent successfully!')
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
          <UserPlus className="h-5 w-5" />
          Add New Patient
        </CardTitle>
        <CardDescription>
          Add a patient to your care by sending an invitation or creating their profile directly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Add Method Selection */}
          <div className="space-y-2">
            <Label htmlFor="addMethod">How would you like to add this patient?</Label>
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
                    <User className="h-4 w-4" />
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
                placeholder="patient@example.com"
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

          {/* Additional Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                {...register('dateOfBirth')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select onValueChange={(value) => setValue('gender', value as any)}>
                <SelectTrigger>
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

          {/* Medical History */}
          <div className="space-y-2">
            <Label htmlFor="medicalHistory">Medical History / Notes</Label>
            <Textarea
              id="medicalHistory"
              {...register('medicalHistory')}
              placeholder="Enter any relevant medical history or notes..."
              rows={3}
            />
          </div>

          {/* Emergency Contact */}
          <div className="space-y-2">
            <Label htmlFor="emergencyContact">Emergency Contact</Label>
            <Input
              id="emergencyContact"
              {...register('emergencyContact')}
              placeholder="Name and phone number of emergency contact"
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
                  {addMethod === 'invite' ? 'Sending Invitation...' : 'Creating Patient...'}
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
                      Add Patient
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
