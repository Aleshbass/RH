'use client';

import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';

function SSOCallbackContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [hasRedirected, setHasRedirected] = useState(false);

  // After auth completes, check localStorage for redirect URL
  useEffect(() => {
    if (isLoaded && isSignedIn && !hasRedirected) {
      setHasRedirected(true);

      // Check localStorage for stored redirect URL
      const storedRedirect = localStorage.getItem('authRedirectUrl');
      if (storedRedirect) {
        localStorage.removeItem('authRedirectUrl');
        router.push(storedRedirect);
      } else {
        // Default redirect
        router.push('/dashboard');
      }
    }
  }, [isLoaded, isSignedIn, hasRedirected, router]);

  return (
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-600 mb-2">Completing sign in...</p>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}

export default function SSOCallback() {
  return (
    <Suspense fallback={
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading...</p>
      </div>
    }>
      <SSOCallbackContent />
    </Suspense>
  );
}
