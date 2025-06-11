'use client';

import { useRouter } from 'next/navigation';
import PersonalInfoForm from '@/components/onboarding/physiotherapist/PersonalInfoForm';
import { useUser } from '@clerk/nextjs';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function PersonalInfoPage() {
  const router = useRouter();
  const { data, setCurrentStep, updatePhysiotherapistData } = useOnboardingStore();
  const { user, isLoaded } = useUser();
  
  useEffect(() => {
    // Update current step in store if needed
    if (data.currentStep !== 1) {
      setCurrentStep(1);
    }
  }, [data.currentStep, setCurrentStep]);

  useEffect(() => {
    if (isLoaded && user) {
      const clerkFirstName = user.firstName || '';
      const clerkLastName = user.lastName || '';
      const clerkEmail = user.primaryEmailAddress?.emailAddress || '';

      // Only pre-fill if the store values are currently empty, 
      // to avoid overwriting if user comes back to this step after partial entry.
      // For step 1, usually direct pre-fill is fine.
      if (!data.physiotherapistData.firstName && !data.physiotherapistData.lastName && !data.physiotherapistData.email) {
        updatePhysiotherapistData({
          firstName: clerkFirstName,
          lastName: clerkLastName,
          email: clerkEmail,
        });
      }
    }
  }, [isLoaded, user, updatePhysiotherapistData, data.physiotherapistData]);
  
  const handleNext = () => {
    router.push('/physiotherapist/step2');
  };
  
  return <PersonalInfoForm onNext={handleNext} />;
}
