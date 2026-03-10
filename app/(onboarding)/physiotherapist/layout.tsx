'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { redirect } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function PhysiotherapistOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useUser();
  const { data, setRole } = useOnboardingStore();
  const currentUser = useQuery(api.users.getMyUser);

  useEffect(() => {
    if (isLoaded) {
      // If user already completed onboarding, skip onboarding flow
      if (user && currentUser && (currentUser as { onboarded?: boolean }).onboarded) {
        redirect('/dashboard');
      }

      // Set role if not already set
      if (!data.role) {
        setRole('physiotherapist');
      }
    }
  }, [isLoaded, user, currentUser, data.role, setRole]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header is handled by ConditionalLayout globally */}
      <main className="pt-24 pb-12">
        {children}
      </main>
    </div>
  );
}

