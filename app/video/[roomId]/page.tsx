'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
// Legacy VideoCallManager (Daily) is no longer used. We redirect to Stream route.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function VideoCallPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const roomId = params.roomId as string;

  // Get current user from Convex
  const currentUser = useQuery(api.users.getMyUser);
  
  // Immediately redirect to Stream route, preserving the identifier
  if (typeof window !== 'undefined') {
    router.replace(`/video-call/${roomId}`)
  }

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

  // Fallback loading UI during redirect
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-center mt-4 text-gray-600">Redirecting to Stream video call...</p>
        </CardContent>
      </Card>
    </div>
  );
  // This page exists only to redirect. The UI above shows while redirecting.
}
 