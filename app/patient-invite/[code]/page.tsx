'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Heart, Shield, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PatientData {
  firstName: string
  lastName: string
  email: string
  phoneNumber?: string
  dateOfBirth?: string
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say'
  medicalHistory?: string
  emergencyContact?: string
}

export default function PatientInvitePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const [isAccepting, setIsAccepting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get invitation details with validation
  const validateInvitation = useQuery(
    api.patientInvitations.validateInvitationCode,
    code ? { code } : 'skip'
  )

  const completeOnboarding = useMutation(
    api.patientInvitations.completePatientOnboarding
  )

  // Redirect to sign in if not authenticated
  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      router.push(`/sign-in?redirect=/patient-invite/${code}`)
      return
    }

    if (validateInvitation === undefined) {
      setIsLoading(true)
      return
    }

    if (!validateInvitation.valid || !validateInvitation.invitation) {
      setError(validateInvitation.message || 'Invalid or expired invitation code')
      setIsLoading(false)
      return
    }

    setIsLoading(false)
  }, [isLoaded, isSignedIn, validateInvitation, code, router])

  // Handle form submission
  const handleAcceptInvitation = async () => {
    if (!user) return

    try {
      setIsAccepting(true)
      setIsLoading(true)
      const patientData: PatientData = {
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.emailAddresses[0]?.emailAddress ?? '',
        phoneNumber: user.phoneNumbers[0]?.phoneNumber ?? '',
        dateOfBirth: '',
        gender: 'prefer_not_to_say',
        medicalHistory: '',
      }

      const result = await completeOnboarding({
        invitationCode: code,
        patientData,
      })

      if (result.success) {
        toast.success('Welcome to Rehabify Health!')
        router.push('/dashboard/patient')
      } else {
        toast.error(result.message || 'Failed to accept invitation')
      }
    } catch (error) {
      console.error('Error accepting invitation:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to accept invitation. Please try again.'
      )
    } finally {
      setIsAccepting(false)
      setIsLoading(false)
    }
  }

  // Loading state
  if (!isLoaded || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-[420px]">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => router.push('/')}
              variant="outline"
              className="w-full"
            >
              Return to Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (!validateInvitation?.invitation) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Heart className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Rehabify Health
                </h1>
                <p className="text-sm text-gray-600">
                  Your Journey to Better Health Starts Here
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Invitation Code</p>
              <p className="font-mono text-sm font-medium">{code}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Welcome to Rehabify Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium">
                    You&apos;ve been invited!
                  </h3>
                  <p className="text-gray-600 mt-1">
                    {validateInvitation.invitation.physiotherapistName} from{' '}
                    {validateInvitation.invitation.clinicName} has invited you
                    to join Rehabify Health.
                  </p>
                </div>
              </div>

              <div className="border-t pt-6">
                <Button
                  onClick={handleAcceptInvitation}
                  className="w-full"
                  disabled={isAccepting}
                >
                  {isAccepting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Accepting Invitation...
                    </>
                  ) : (
                    'Accept Invitation'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 