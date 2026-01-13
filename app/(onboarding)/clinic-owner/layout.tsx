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

  useEffect(() => {
    if (isLoaded) {
      // If no user is logged in, redirect to sign in
      if (!user) {
        router.replace('/sign-in');
      }

      // If user already completed onboarding, skip onboarding flow
      if (currentUser && (currentUser as { onboarded?: boolean }).onboarded) {
        router.replace('/dashboard');
      }

      // Set role if not already set
      if (!data.role) {
        setRole('clinic_owner');
      }
    }
  }, [isLoaded, user, currentUser, data.role, setRole, router]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header is handled by ConditionalLayout globally */}
      <main className="pt-24 pb-12">
        {children}
      </main>
    </div>
  );
}
