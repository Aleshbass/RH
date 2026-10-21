'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function ClinicOwnerOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { data, setRole } = useOnboardingStore();
  const currentUser = useQuery(api.users.getMyUser);
  const approval = useQuery(
    api.accountApproval.getStatus,
    currentUser?.onboarded && currentUser.role === 'clinic_owner' ? { userId: currentUser._id } : 'skip'
  ) as { status?: string } | null | undefined;

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
    <div className="min-h-screen bg-white">
      {/* Header is handled by ConditionalLayout globally */}
      <main className="pt-24 pb-12">
        {children}
      </main>
    </div>
  );
}
