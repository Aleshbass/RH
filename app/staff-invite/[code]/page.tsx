'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { 
  Building2, 
  Mail, 
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  UserPlus,
  Shield
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@clerk/nextjs'

export default function StaffInviteAcceptancePage() {
  const params = useParams()
  const router = useRouter()
  const { isSignedIn } = useAuth()
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclined, setIsDeclined] = useState(false)
  
  const code = params.code as string
  
  // Get invitation details
  const invitation = useQuery(api.clinics.getInvitationByCode, { code })
  
  // Actions
  const acceptInvitation = useAction(api.actions.clinics.acceptStaffInvitationWithNotification)
  const declineInvitation = useAction(api.actions.clinics.declineStaffInvitationWithNotification)

  const handleAcceptInvitation = async () => {
    if (!invitation || !isSignedIn) return
    
    setIsAccepting(true)
    try {
      const result = await acceptInvitation({ code })
      
      if (result.success) {
        toast.success('Invitation accepted successfully! Welcome to the team.')
        
        // Redirect to appropriate dashboard based on role
        setTimeout(() => {
          if (invitation.role === 'physiotherapist') {
            router.push('/dashboard/physiotherapist')
          } else if (invitation.role === 'lead_physiotherapist') {
            router.push('/dashboard/physiotherapist')
          } else {
            router.push('/dashboard')
          }
        }, 2000)
      } else {
        toast.error(result.message || 'Failed to accept invitation')
      }
    } catch (error) {
      console.error('Accept invitation error:', error)
      toast.error('Failed to accept invitation. Please try again.')
    } finally {
      setIsAccepting(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!invitation) return
    
    try {
      const result = await declineInvitation({ code })
      
      if (result.success) {
        setIsDeclined(true)
        toast.success('Invitation declined.')
      } else {
        toast.error(result.message || 'Failed to decline invitation')
      }
    } catch (error) {
      console.error('Decline invitation error:', error)
      toast.error('Failed to decline invitation. Please try again.')
    }
  }

  // Loading state
  if (invitation === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Invalid invitation
  if (!invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/sign-in')} 
              className="w-full"
            >
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Expired invitation
  const isExpired = invitation.expiresAt && Date.now() > invitation.expiresAt
  if (isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Clock className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <CardTitle className="text-orange-600">Invitation Expired</CardTitle>
            <CardDescription>
              This invitation has expired. Please contact your clinic owner for a new invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-gray-600">
              <p><strong>Clinic:</strong> {invitation.clinic?.name}</p>
              <p><strong>Expired:</strong> {format(new Date(invitation.expiresAt), 'PPP')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Already accepted/declined
  if (invitation.status === 'accepted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-green-600">Already Accepted</CardTitle>
            <CardDescription>
              This invitation has already been accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => router.push('/dashboard')} 
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (invitation.status === 'declined' || isDeclined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-red-600">Invitation Declined</CardTitle>
            <CardDescription>
              This invitation has been declined.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Main invitation acceptance UI
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <UserPlus className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Staff Invitation</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join a clinic team
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{invitation.clinic?.name || 'Clinic'}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-500" />
              <span>Role: </span>
              <Badge variant="outline" className="capitalize">
                {invitation.role.replace('_', ' ')}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">{invitation.inviteeEmail}</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                Expires: {format(new Date(invitation.expiresAt), 'PPP')}
              </span>
            </div>
          </div>

          {/* Personal Message */}
          {invitation.message && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Personal Message</h4>
              <p className="text-blue-800 text-sm">{invitation.message}</p>
            </div>
          )}

          {/* Invitation from */}
          <div className="text-center text-sm text-gray-600">
            <p>
              Invited by <strong>{invitation.clinicOwner?.firstName} {invitation.clinicOwner?.lastName}</strong>
            </p>
            <p className="text-xs mt-1">
              {format(new Date(invitation.createdAt), 'PPP')}
            </p>
          </div>

          {/* Authentication Check */}
          {!isSignedIn ? (
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-yellow-800 text-sm mb-3">
                You need to sign in or create an account to accept this invitation.
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={() => router.push('/sign-in')}
                  className="flex-1"
                >
                  Sign In
                </Button>
                <Button 
                  onClick={() => router.push('/sign-up')}
                  variant="outline"
                  className="flex-1"
                >
                  Sign Up
                </Button>
              </div>
            </div>
          ) : (
            /* Action Buttons */
            <div className="flex gap-3">
              <Button 
                onClick={handleAcceptInvitation}
                disabled={isAccepting}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isAccepting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Accept Invitation
                  </>
                )}
              </Button>
              
              <Button 
                onClick={handleDeclineInvitation}
                variant="outline"
                disabled={isAccepting}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Decline
              </Button>
            </div>
          )}

          {/* Terms */}
          <div className="text-xs text-gray-500 text-center">
            By accepting this invitation, you agree to join the clinic team and 
            follow the clinic&apos;s policies and procedures.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
