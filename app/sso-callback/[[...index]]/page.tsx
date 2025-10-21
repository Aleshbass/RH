'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

export default function SSOCallback() {
  // Completes the Clerk OAuth/SAML redirect flow, then forwards to redirectUrlComplete
  return <AuthenticateWithRedirectCallback />;
}
