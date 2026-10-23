'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from 'convex/react'
import { programError } from '@/components/exercise-programs/errors'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, User } from '@/components/icons'
import { toast } from 'sonner'

const editPatientSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
})

type EditPatientFormData = z.infer<typeof editPatientSchema>

interface EditPatientModalProps {
  isOpen: boolean
  onClose: () => void
  patientId: string
  currentData: {
    firstName: string
    lastName: string
    email?: string
    phoneNumber?: string
    dateOfBirth?: string
    gender?: string
  }
  onSuccess?: () => void
}

export default function EditPatientModal({
  isOpen,
  onClose,
  patientId,
  currentData,
  onSuccess
}: EditPatientModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const updatePatientBasicInfo = useMutation(api.patients.updatePatientBasicInfo)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<EditPatientFormData>({
    resolver: zodResolver(editPatientSchema),
    defaultValues: {
      firstName: currentData.firstName,
      lastName: currentData.lastName,
      email: currentData.email || '',
      phoneNumber: currentData.phoneNumber || '',
      dateOfBirth: currentData.dateOfBirth?.slice(0, 10) || '',
      gender: currentData.gender as any,
    }
  })

  // Update form values when currentData changes or modal opens
  useEffect(() => {
    if (isOpen) {
      reset({
        firstName: currentData.firstName,
        lastName: currentData.lastName,
        email: currentData.email || '',
        phoneNumber: currentData.phoneNumber || '',
        dateOfBirth: currentData.dateOfBirth?.slice(0, 10) || '',
        gender: currentData.gender as any,
      })
    }
  }, [isOpen, currentData, reset])

  const onSubmit = async (data: EditPatientFormData) => {
    setIsSubmitting(true)

    try {
      await updatePatientBasicInfo({
        patientId: patientId as Id<'users'>,
        updates: {
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber || undefined,
          dateOfBirth: data.dateOfBirth || undefined,
          gender: data.gender || undefined,
        }
      })

      toast.success('Patient information updated successfully!')
      onSuccess?.()
      onClose()
      reset()
    } catch (error) {
      toast.error(programError(error, 'Failed to update patient information'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      reset()
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Edit Patient Information
          </DialogTitle>
          <DialogDescription>
            Update the basic information for this patient.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-4">
            {/* First Name */}
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                {...register('firstName')}
                placeholder="Enter first name"
                disabled={isSubmitting}
              />
              {errors.firstName && (
                <p className="text-sm text-red-600">{errors.firstName.message}</p>
              )}
            </div>

            {/* Last Name */}
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                {...register('lastName')}
                placeholder="Enter last name"
                disabled={isSubmitting}
              />
              {errors.lastName && (
                <p className="text-sm text-red-600">{errors.lastName.message}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="patient@example.com"
                disabled
              />
              <p className="text-xs text-gray-500">This is the patient&apos;s sign-in email. They change it in their own account.</p>
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                {...register('phoneNumber')}
                placeholder="+234 xxx xxx xxxx"
                disabled={isSubmitting}
              />
              {errors.phoneNumber && (
                <p className="text-sm text-red-600">{errors.phoneNumber.message}</p>
              )}
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date of Birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                {...register('dateOfBirth')}
                disabled={isSubmitting}
              />
              {errors.dateOfBirth && (
                <p className="text-sm text-red-600">{errors.dateOfBirth.message}</p>
              )}
            </div>

            {/* Gender */}
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select
                defaultValue={currentData.gender}
                onValueChange={(value) => {
                  // Manually set the value since we're not using register for Select
                  const event = { target: { name: 'gender', value } } as any
                  register('gender').onChange(event)
                }}
                disabled={isSubmitting}
              >
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
              {errors.gender && (
                <p className="text-sm text-red-600">{errors.gender.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
