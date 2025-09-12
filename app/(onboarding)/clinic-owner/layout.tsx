'use client';

import { usePathname } from 'next/navigation';
import OnboardingLayout from '@/components/onboarding/common/OnboardingLayout';
import { useUser } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { redirect } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import { useQueryUntyped } from '@/lib/convexUntyped';

export default function ClinicOwnerOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '';
  const { user, isLoaded } = useUser();
  const { data, setCurrentStep, setRole } = useOnboardingStore();
  const currentUser = useQueryUntyped(api.users.getMyUser);
  
  const steps = [
    'Personal Details',
    'Clinic Information',
    'Services & Facilities',
    'Verification & Documents'
  ];
  
  // Extract current step from URL
  const currentStepMatch = pathname.match(/step(\d+)/);
  const currentStepFromUrl = currentStepMatch 
    ? parseInt(currentStepMatch[1], 10) 
    : 1;
  
  useEffect(() => {
    if (isLoaded) {
      // If no user is logged in, redirect to sign in
      if (!user) {
        redirect('/sign-in');
      }

      // If user already completed onboarding, skip onboarding flow
      if (currentUser && (currentUser as { onboarded?: boolean }).onboarded) {
        redirect('/dashboard');
      }
      
      // Set role if not already set
      if (!data.role) {
        setRole('clinic_owner');
      }
      
      // Update the current step based on URL
      if (currentStepFromUrl !== data.currentStep) {
        setCurrentStep(currentStepFromUrl);
      }
    }
  }, [isLoaded, user, currentUser, data.role, currentStepFromUrl, data.currentStep, setRole, setCurrentStep]);
  
  const handleStepClick = (step: number) => {
    // Only allow navigating to completed steps
    if (step < data.currentStep) {
      redirect(`/clinic-owner/step${step}`);
    }
  };

  return (
    <OnboardingLayout
      steps={steps}
      currentStep={currentStepFromUrl}
      title="Clinic Registration"
      subtitle="Set up your healthcare facility on Rehabify Health"
      onStepClick={handleStepClick}
    >
      {children}
    </OnboardingLayout>
  );
}
