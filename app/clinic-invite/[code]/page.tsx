'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../../convex/_generated/api';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Building2, Users, MapPin, Mail, Phone, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function ClinicInvite({ code }: { code: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  // Get invitation details
  const invitation = useQuery(api.clinics.getInvitationByCode, { code });

  // Get current user
  const currentUser = useQuery(api.users.getMyUser);

  // Mutations
  const acceptInvitation = useMutation(api.clinics.acceptClinicInvitation);
  const declineInvitation = useMutation(api.clinics.declineClinicInvitation);

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [isLoaded, isSignedIn, router]);

  // Loading state
  if (!isLoaded || currentUser === undefined || invitation === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Check if user is signed in but we don't have their data yet
  if (isSignedIn && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <CardTitle>Complete Your Profile</CardTitle>
            <CardDescription>
              Please complete your profile setup before accepting this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push('/role-selection')}
              className="w-full"
            >
              Complete Profile Setup
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid or expired invitation
  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>
              This invitation link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard')}
              className="w-full"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if invitation is expired
  const isExpired = invitation.expiresAt < Date.now();
  const isAlreadyProcessed = invitation.status !== 'pending';

  // User mismatch (invitation is for different email)
  if (currentUser?.email !== invitation.inviteeEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <CardTitle>Email Mismatch</CardTitle>
            <CardDescription>
              This invitation was sent to {invitation.inviteeEmail}, but you&apos;re signed in as {currentUser?.email || 'an unknown account'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              Please sign in with the correct email address or contact the clinic owner.
            </p>
            <Button
              variant="outline"
              onClick={() => router.push('/sign-out')}
              className="w-full"
            >
              Sign Out & Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Already processed invitation
  if (isAlreadyProcessed) {
    const statusConfig = {
      accepted: {
        icon: CheckCircle,
        color: 'text-green-500',
        title: 'Invitation Already Accepted',
        description: 'You have already accepted this invitation.',
        action: () => router.push('/dashboard')
      },
      declined: {
        icon: XCircle,
        color: 'text-red-500',
        title: 'Invitation Declined',
        description: 'You have declined this invitation.',
        action: () => router.push('/dashboard')
      },
      expired: {
        icon: Clock,
        color: 'text-gray-500',
        title: 'Invitation Expired',
        description: 'This invitation has expired.',
        action: () => router.push('/dashboard')
      }
    };

    const config = statusConfig[invitation.status as keyof typeof statusConfig];
    const IconComponent = config.icon;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <IconComponent className={`h-12 w-12 ${config.color} mx-auto mb-4`} />
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={config.action} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle accepting invitation
  const handleAcceptInvitation = async () => {
    setIsAccepting(true);
    try {
      await acceptInvitation({ code });
      toast.success('Invitation accepted successfully!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  };

  // Handle declining invitation
  const handleDeclineInvitation = async () => {
    setIsDeclining(true);
    try {
      await declineInvitation({ code });
      toast.success('Invitation declined');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error declining invitation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to decline invitation');
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Clinic Invitation
          </h1>
          <p className="text-gray-600">
            You&apos;ve been invited to join a physiotherapy clinic
          </p>
        </div>

        {/* Expiry Warning */}
        {isExpired && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <Clock className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              This invitation expired on {format(new Date(invitation.expiresAt), 'PPP')}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Invitation Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">
                  Join {invitation.clinic?.name || 'Unknown Clinic'}
                </CardTitle>
                <CardDescription>
                  Invitation from {invitation.clinicOwner?.firstName || 'Unknown'} {invitation.clinicOwner?.lastName || 'Owner'}
                </CardDescription>
              </div>
              <Badge
                variant={isExpired ? "destructive" : "default"}
                className={isExpired ? "bg-red-100 text-red-800" : ""}
              >
                {isExpired ? 'Expired' : 'Active'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Clinic Information */}
            <div>
              <h3 className="font-semibold mb-3">Clinic Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <span>{invitation.clinic?.name || 'Unknown Clinic'}</span>
                </div>
                {invitation.clinic?.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <span>
                      {invitation.clinic.address}
                      {invitation.clinic.city && `, ${invitation.clinic.city}`}
                    </span>
                  </div>
                )}
                {invitation.clinic?.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span>{invitation.clinic.contactEmail}</span>
                  </div>
                )}
                {invitation.clinic?.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span>{invitation.clinic.contactPhone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span>{invitation.clinic?.staffCount || 0} staff members</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Role Information */}
            <div>
              <h3 className="font-semibold mb-3">Your Role</h3>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Badge variant="secondary" className="mb-2">
                  {invitation.role === 'physiotherapist' ? 'Physiotherapist' : invitation.role}
                </Badge>
                <p className="text-sm text-gray-700">
                  You will be joining as a Physiotherapist. You will be able to manage your patients, appointments, and treatment plans.
                </p>
              </div>
            </div>

            <Separator />
            
            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleAcceptInvitation}
                disabled={isAccepting || isDeclining || isExpired}
                className="flex-1"
              >
                {isAccepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Accept Invitation
              </Button>
              <Button
                onClick={handleDeclineInvitation}
                variant="outline"
                disabled={isAccepting || isDeclining || isExpired}
                className="flex-1"
              >
                {isDeclining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Decline Invitation
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500">
          <p>
            If you were not expecting this invitation, you can safely ignore it.
          </p>
          <p>
            Having trouble? <a href="/support" className="text-blue-600 hover:underline">Contact Support</a>
          </p>
        </div>
      </div>
    </div>
  );
}


export default function ClinicInvitePage() {
  const params = useParams();
  const code = params?.code as string;

  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  return <ClinicInvite code={code} />;
} 