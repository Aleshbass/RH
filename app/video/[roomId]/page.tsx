'use client';

import { useParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import VideoCallManager from '@/components/video/VideoCallManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function VideoCallPage() {
  const params = useParams();
  const { user } = useUser();
  const roomId = params.roomId as string;

  // Get current user from Convex
  const currentUser = useQuery(api.users.getMyUser);
  
  // Get video call details
  const videoCall = useQuery(api.videoCalls.getVideoCall, { roomId });

  // Join call mutation
  const joinCall = useMutation(api.videoCalls.joinVideoCall);

  if (!user || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Authentication Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Please sign in to join this video call.
            </p>
            <Link href="/sign-in">
              <Button className="w-full">
                Sign In
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (videoCall === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-center mt-4 text-gray-600">Loading video call...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (videoCall === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Call Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              The video call you&apos;re looking for doesn&apos;t exist or has ended.
            </p>
            <div className="space-y-2">
              <Link href={`/dashboard/${currentUser.role}`}>
                <Button className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
              <Link href={`/dashboard/${currentUser.role}/video-calls`}>
                <Button variant="outline" className="w-full">
                  View My Video Calls
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if user is authorized to join this call
  const isAuthorized = videoCall.participants?.some(p => p.userId === currentUser._id) ||
                      videoCall.initiatorId === currentUser._id;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              You don&apos;t have permission to join this video call.
            </p>
            <Link href={`/dashboard/${currentUser.role}`}>
              <Button className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check call status
  if (videoCall.status === 'ended') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gray-500" />
              Call Ended
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              This video call has already ended.
            </p>
            <Link href={`/dashboard/${currentUser.role}/video-calls`}>
              <Button className="w-full">
                View Call History
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (videoCall.status === 'cancelled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Call Cancelled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              This video call has been cancelled.
            </p>
            {videoCall.cancellationReason && (
              <p className="text-sm text-gray-500 mb-4">
                Reason: {videoCall.cancellationReason}
              </p>
            )}
            <Link href={`/dashboard/${currentUser.role}/video-calls`}>
              <Button className="w-full">
                Back to Video Calls
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Auto-join the call and render the video interface
  return (
    <div className="min-h-screen bg-gray-900">
      <VideoCallManager
        appointmentId={videoCall.appointmentId}
        defaultParticipants={videoCall.participants?.map(p => p.userId) || []}
        onCallEnd={() => {
          // Redirect back to dashboard after call ends
          window.location.href = `/dashboard/${currentUser.role}/video-calls`;
        }}
      />
    </div>
  );
} 