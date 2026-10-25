'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { Id } from '@/convex/_generated/dataModel';

type Account = { _id: Id<'users'>; role?: string; onboarded?: boolean } | null;

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const getMyUserRef = makeFunctionReference<'query', Record<string, never>, Account>('users:getMyUser');
const getApprovalStatusRef = makeFunctionReference<'query', { userId: Id<'users'> }, { status?: string } | null>(
  'accountApproval:getStatus'
);

export default function ClinicOwnerOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { data, setRole } = useOnboardingStore();
  const currentUser = useQuery(getMyUserRef);
  const approval = useQuery(
    getApprovalStatusRef,
    currentUser?.onboarded && currentUser.role === 'clinic_owner' ? { userId: currentUser._id } : 'skip'
  );

  useEffect(() => {
    if (isLoaded) {
      // Not signed in: sign in, then come straight back to clinic onboarding
      // (without the return path they landed on /dashboard and then /role-selection)
      if (!user) {
        router.replace('/sign-in?redirect_url=%2Fclinic-owner');
        return;
      }

      // Already onboarded: go to their dashboard. A declined clinic stays here to update and
      // resubmit its application (the dashboard would only send it back to the declined page).
      if (currentUser?.onboarded) {
        if (currentUser.role === 'clinic_owner') {
          if (approval === undefined) return;
          if (approval?.status === 'declined') return;
        }
        router.replace(currentUser.role === 'clinic_owner' ? '/dashboard/clinic' : '/dashboard');
        return;
      }

      // Set role if not already set
      if (!data.role) {
        setRole('clinic_owner');
      }
    }
  }, [isLoaded, user, currentUser, approval, data.role, setRole, router]);

  return (
    <div className="min-h-screen bg-rh-canvas">
      {/* Header is handled by ConditionalLayout globally */}
      <main className="pt-24 pb-12">
        {children}
      </main>
    </div>
  );
}
