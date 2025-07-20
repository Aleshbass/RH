'use client';

import { usePathname } from 'next/navigation';
import OnboardingLayout from '@/components/onboarding/common/OnboardingLayout';
import { useUser } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { redirect } from 'next/navigation';

export default function PhysiotherapistOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  const { data, setCurrentStep, setRole } = useOnboardingStore();
  
  const steps = [
    'Personal Information',
    'Professional Details',
    'License & Credentials'
  ];
  
  // Extract current step from URL
  const currentStepMatch = pathname ? pathname.match(/step(\d+)/) : null;
  const currentStepFromUrl = currentStepMatch 
    ? parseInt(currentStepMatch[1], 10) 
    : 1;
  
  useEffect(() => {
    if (isLoaded) {
      // If no user is logged in, redirect to sign in
      if (!user) {
        redirect('/sign-in');
      }
      
      // Set role if not already set
      if (!data.role) {
        setRole('physiotherapist');
      }
      
      // Update the current step based on URL
      if (currentStepFromUrl !== data.currentStep) {
        setCurrentStep(currentStepFromUrl);
      }
    }
  }, [isLoaded, user, data.role, currentStepFromUrl, data.currentStep, setRole, setCurrentStep]);
  
  const handleStepClick = (step: number) => {
    // Only allow navigating to completed steps
    if (step < data.currentStep) {
      redirect(`/physiotherapist/step${step}`);
    }
  };

  return (
    <OnboardingLayout
      steps={steps}
      currentStep={currentStepFromUrl}
      title="Physiotherapist Onboarding"
      subtitle="Complete your profile to start using Rehabify Health"
      onStepClick={handleStepClick}
    >
      {children}
    </OnboardingLayout>
  );
}
