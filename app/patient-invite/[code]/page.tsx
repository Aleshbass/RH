'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { useValidateInvitationCode } from '@/lib/api/patientInvitations'
import { usePatientOnboardingAction } from '@/lib/onboardingHelpers'
import Confetti from '@/components/ui/Confetti'

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
  const [autoAcceptTriggered, setAutoAcceptTriggered] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // Get invitation details with validation
  const {
    isLoading: isValidating,
    isValid,
    invitation,
    physiotherapist,
    clinic,
    message,
  } = useValidateInvitationCode(code || null)

  // Use action wrapper that also sends notifications
  const completePatientOnboarding = usePatientOnboardingAction()

  const handleSignIn = useCallback(() => {
    const redirectPath = encodeURIComponent(`/patient-invite/${code}`)
    router.push(`/sign-in?redirect_url=${redirectPath}`)
  }, [router, code])

  const handleSignUp = useCallback(() => {
    const redirectPath = encodeURIComponent(`/patient-invite/${code}`)
    router.push(`/sign-up?redirect_url=${redirectPath}`)
  }, [router, code])

  // Handle form submission
  const handleAcceptInvitation = useCallback(async () => {
    if (!isSignedIn || !user) {
      handleSignUp()
      return
    }

    try {
      setIsAccepting(true)
      const patientData: PatientData = {
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.emailAddresses[0]?.emailAddress ?? '',
        phoneNumber: user.phoneNumbers[0]?.phoneNumber ?? '',
        dateOfBirth: '',
        gender: 'prefer_not_to_say',
        medicalHistory: '',
      }

      const result = await completePatientOnboarding({
        invitationCode: code,
        patientData,
      })

      if (result.success) {
        toast.success('Welcome to Rehabify Health!')
        setShowConfetti(true)
        // Briefly show confetti before redirecting
        setTimeout(() => {
          router.push('/dashboard/patient')
        }, 1200)
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
    }
  }, [isSignedIn, user, completePatientOnboarding, code, router, handleSignUp])

  // Friendly handling for already accepted invitations
  const alreadyAccepted = !isValid && typeof message === 'string' && message.toLowerCase().includes('already been accepted')

  // If the invitation was already accepted and user is signed in, celebrate and go to dashboard
  useEffect(() => {
    if (alreadyAccepted && isSignedIn) {
      toast.success('You are all set! Redirecting to your dashboard...')
      setShowConfetti(true)
      const t = setTimeout(() => {
        router.push('/dashboard/patient')
      }, 1200)
      return () => clearTimeout(t)
    }
  }, [alreadyAccepted, isSignedIn, router])

  // Auto-accept invitation after authentication
  useEffect(() => {
    if (isSignedIn && isValid && !alreadyAccepted && !autoAcceptTriggered && !isAccepting) {
      setAutoAcceptTriggered(true)
      // slight delay to ensure user is available
      const t = setTimeout(() => {
        handleAcceptInvitation()
      }, 200)
      return () => clearTimeout(t)
    }
  }, [isSignedIn, isValid, alreadyAccepted, autoAcceptTriggered, isAccepting, handleAcceptInvitation])

  // Loading state (placed after hooks to satisfy react-hooks rules)
  if (!isLoaded || isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Not signed in: prompt to sign up seamlessly
  if (!isSignedIn) {
    if (alreadyAccepted) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Card className="w-[420px]">
            <CardHeader>
              <CardTitle className="">You&apos;re already registered</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Sign in to access your patient dashboard.
              </p>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSignIn} className="w-full">Sign in</Button>
            </CardFooter>
          </Card>
        </div>
      )
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-[420px]">
          <CardHeader>
            <CardTitle className="">Create your account to continue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You need to sign up to accept your invitation.
            </p>
          </CardContent>
          <CardFooter>
            <div className="flex flex-col gap-2 w-full">
              <Button onClick={handleSignUp} className="w-full">Sign up</Button>
              <Button onClick={handleSignIn} variant="outline" className="w-full">I already have an account</Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // Invalid or expired invitation
  if (!isValid) {
    if (alreadyAccepted && isSignedIn) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center">
          {showConfetti && <Confetti />}
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-600">Redirecting to your dashboard...</p>
          </div>
        </div>
      )
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-[420px]">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{message}</p>
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

  if (!invitation) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {showConfetti && <Confetti />}
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
                  <h3 className="text-lg font-medium">You&apos;ve been invited!</h3>
                  <p className="text-sm text-muted-foreground">
                    Invited by {(physiotherapist as { firstName?: string; lastName?: string })?.firstName} {(physiotherapist as { firstName?: string; lastName?: string })?.lastName}
                    {(clinic as { name?: string })?.name && (<>
                      {' '}from {(clinic as { name?: string }).name}
                    </>)}
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