// /Users/ella/rehabifyhealth/app/(onboarding)/role-selection/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore, UserRole } from '@/stores/onboardingStore';
// Add this type that excludes 'admin' from UserRole
type OnboardingRole = Exclude<UserRole, 'admin'>;
import { Button } from '@/components/ui/button';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useQuery } from 'convex/react';

// A simple way to generate a unique ID for the onboarding session
const generateOnboardingId = () => `onboarding_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;

export default function RoleSelectionPage() {
  const router = useRouter();
  const { setRoleAndStep, setCurrentOnboardingId, setActualClinicId } = useOnboardingStore();
  const updateUserRole = useMutation(api.users.updateUserRole);
  const [loadingRole, setLoadingRole] = useState<OnboardingRole | null>(null);
  const currentUser = useQuery(api.users.getMyUser);

  // If user already completed onboarding, check their approval status
  useEffect(() => {
    if (currentUser && currentUser.onboarded) {
      // Only redirect if the user also has a role assigned
      // This prevents an infinite loop where DashboardAuthGuard redirects to /role-selection
      // because role is missing, but this page redirects back to /dashboard because onboarded is true
      if (currentUser.role) {
        // For roles that require approval, check status before redirecting
        if (currentUser.role === 'physiotherapist' || currentUser.role === 'clinic_owner') {
          // Let DashboardAuthGuard handle the approval status check
          router.replace('/dashboard');
        } else {
          // Admin can go directly to dashboard
          if (currentUser.role === 'admin') {
            router.replace('/dashboard');
          } else if (currentUser.role === 'patient') {
            // Patient goes to step 1 if they are here (meaning they might need to complete profile)
            // But if they are fully onboarded, maybe they should go to dashboard?
            // The user said: "not a long onboarding step immediately they are done onboarding we save that to database then we send the to find my physio page"
            // So if they are already onboarded, they should probably go to dashboard or find-a-physio.
            // Let's assume if they are here, they might want to update or we just send them to dashboard if onboarded.
            router.replace('/dashboard');
          }
        }
      }
      // If role is missing but onboarded is true, stay here so they can select a role
    }
  }, [currentUser, router]);

  const handleRoleSelect = async (role: OnboardingRole) => {
    try {
      setLoadingRole(role);

      // Update the role in the database
      await updateUserRole({ role });

      // Update the client-side store
      const newOnboardingId = generateOnboardingId();
      setCurrentOnboardingId(newOnboardingId); // Store the unique ID for this onboarding attempt
      setActualClinicId(undefined); // Clear any previous clinic ID to prevent auth errors
      setRoleAndStep(role, 1); // Set role and start at step 1

      // Navigate to the first step of the respective onboarding flow
      switch (role) {
        case 'physiotherapist':
          // Redirect to the main physiotherapist onboarding page (wizard)
          router.push('/physiotherapist');
          break;
        case 'clinic_owner':
          // Redirect to the main clinic owner onboarding page (wizard)
          router.push('/clinic-owner');
          break;
        case 'patient':
          router.push('/patient/step1');
          break;
        default:
          console.error('Unknown role selected');
          // Optionally, navigate to an error page or back to role selection
          break;
      }
    } catch (error) {
      console.error('Error updating user role:', error);
      // Optionally show an error message to the user
    } finally {
      setLoadingRole(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-teal-100">
      <div className="w-full max-w-md shadow-xl bg-white/80 backdrop-blur-md rounded-xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-semibold text-teal-800">
            Welcome to Rehabify Health!
          </h1>
          <p className="text-lg text-teal-700 pt-2">
            Please select your role to get started.
          </p>
        </div>
        <div className="space-y-6 p-2">
          <Button
            onClick={() => handleRoleSelect('physiotherapist')}
            className="w-full text-lg py-6 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg shadow-md transition-transform transform hover:scale-105"
            aria-label="Select Physiotherapist Role"
            disabled={loadingRole !== null}
          >
            {loadingRole === 'physiotherapist' ? 'Loading...' : 'I am a Physiotherapist'}
          </Button>
          <Button
            onClick={() => handleRoleSelect('clinic_owner')}
            className="w-full text-lg py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-md transition-transform transform hover:scale-105"
            aria-label="Select Clinic Owner Role"
            disabled={loadingRole !== null}
          >
            {loadingRole === 'clinic_owner' ? 'Loading...' : 'I am a Clinic Owner'}
          </Button>
          <Button
            onClick={() => handleRoleSelect('patient')}
            className="w-full text-lg py-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-md transition-transform transform hover:scale-105"
            aria-label="Select Patient Role"
            disabled={loadingRole !== null}
          >
            {loadingRole === 'patient' ? 'Loading...' : 'I am a Patient'}
          </Button>
          <p className="text-sm text-gray-600 text-center mt-6 px-4">
            Patients join through invitation links from their physiotherapist
          </p>
        </div>
      </div>
      <p className="mt-8 text-sm text-gray-600">
        Rehabify Health © {new Date().getFullYear()}
      </p>
    </div>
  );
}