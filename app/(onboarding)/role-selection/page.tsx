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
  const { setRoleAndStep, setCurrentOnboardingId } = useOnboardingStore();
  const updateUserRole = useMutation(api.users.updateUserRole);
  const [isLoading, setIsLoading] = useState(false);
  const currentUser = useQuery(api.users.getMyUser);

  // If user already completed onboarding, check their approval status
  useEffect(() => {
    if (currentUser && currentUser.onboarded) {
      // For roles that require approval, check status before redirecting
      if (currentUser.role === 'physiotherapist' || currentUser.role === 'clinic_owner') {
        // Let DashboardAuthGuard handle the approval status check
        router.replace('/dashboard');
      } else {
        // Admin and patient roles can go directly to dashboard
        router.replace('/dashboard');
      }
    }
  }, [currentUser, router]);

  const handleRoleSelect = async (role: OnboardingRole) => {
    try {
      setIsLoading(true);
      
      // Update the role in the database
      await updateUserRole({ role });
      
      // Update the client-side store
      const newOnboardingId = generateOnboardingId();
      setCurrentOnboardingId(newOnboardingId); // Store the unique ID for this onboarding attempt
      setRoleAndStep(role, 1); // Set role and start at step 1

      // Navigate to the first step of the respective onboarding flow
      switch (role) {
        case 'physiotherapist':
          // Assuming the first step for physiotherapist is personal details
          router.push('/physiotherapist/step1'); 
          break;
        case 'clinic_owner':
          // Assuming the first step for clinic owner is clinic details
          router.push('/clinic-owner/step1'); 
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
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-teal-100">
      <div className="w-full max-w-md shadow-xl bg-white/80 backdrop-blur-md rounded-xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-pally-bold text-teal-800">
            Welcome to Rehabify Health!
          </h1>
          <p className="text-lg text-teal-700 pt-2">
            Please select your role to get started.
          </p>
        </div>
        <div className="space-y-6 p-2">
          <Button
            onClick={() => handleRoleSelect('physiotherapist')}
            className="w-full text-lg py-6 bg-teal-600 hover:bg-teal-700 text-white font-pally-medium rounded-lg shadow-md transition-transform transform hover:scale-105"
            aria-label="Select Physiotherapist Role"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'I am a Physiotherapist'}
          </Button>
          <Button
            onClick={() => handleRoleSelect('clinic_owner')}
            className="w-full text-lg py-6 bg-emerald-600 hover:bg-emerald-700 text-white font-pally-medium rounded-lg shadow-md transition-transform transform hover:scale-105"
            aria-label="Select Clinic Owner Role"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'I am a Clinic Owner'}
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