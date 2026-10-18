'use client';

import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { toSafeInternalPath } from '@/lib/auth/ssoRedirect';

function SSOCallbackContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasRedirected, setHasRedirected] = useState(false);

  // After auth completes, check localStorage for redirect URL
  useEffect(() => {
    if (isLoaded && isSignedIn && !hasRedirected) {
      setHasRedirected(true);

      // Check localStorage for stored redirect URL
      const queryRedirect = searchParams.get('post_auth_redirect');
      const storedRedirect = localStorage.getItem('authRedirectUrl');
      localStorage.removeItem('authRedirectUrl');

      // Query value is bound to the OAuth initiation URL; localStorage is a
      // fallback for providers that strip callback query parameters.
      const destination = toSafeInternalPath(
        queryRedirect || storedRedirect,
        '/role-selection',
      );
      router.replace(destination);
    }
  }, [isLoaded, isSignedIn, hasRedirected, router, searchParams]);

  return (
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-600 mb-2">Completing sign in...</p>
      <AuthenticateWithRedirectCallback />
      {/* First-time Google users are signed up here, which runs Clerk's bot protection:
          the Smart CAPTCHA needs this mount point to show a challenge if one is required */}
      <div id="clerk-captcha" data-cl-theme="light" className="mx-auto mt-4 flex justify-center" />
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
