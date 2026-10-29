'use client';

import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import { toSafeInternalPath } from '@/lib/auth/ssoRedirect';

function readStoredRedirect() {
  try {
    return localStorage.getItem('authRedirectUrl');
  } catch {
    return null;
  }
}

function SSOCallbackContent() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasRedirected, setHasRedirected] = useState(false);
  // Query value is bound to the OAuth initiation URL; localStorage is a
  // fallback for providers that strip callback query parameters.
  const [destination] = useState(() =>
    toSafeInternalPath(searchParams.get('post_auth_redirect') || readStoredRedirect(), '/role-selection'),
  );

  // Already signed in when the callback settles (e.g. returning to this page)
  useEffect(() => {
    if (isLoaded && isSignedIn && !hasRedirected) {
      setHasRedirected(true);
      try {
        localStorage.removeItem('authRedirectUrl');
      } catch {
        // Nothing to clear
      }
      router.replace(destination);
    }
  }, [isLoaded, isSignedIn, hasRedirected, router, destination]);

  return (
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-600 mb-2">Completing sign in...</p>
      {/* A first-time Google user is turned from a sign-in into a sign-up here, and Clerk then
          goes to its own "after sign-up" page ("/" by default) before our effect runs; both
          destinations are pinned so they land where they started (onboarding, partner portal) */}
      <AuthenticateWithRedirectCallback signInForceRedirectUrl={destination} signUpForceRedirectUrl={destination} />
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
