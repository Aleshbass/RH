'use client';

import { useRouter } from 'next/navigation';
import VerificationDocumentsForm from '@/components/onboarding/clinic-owner/VerificationDocumentsForm';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function VerificationDocumentsPage() {
  const router = useRouter();
  const { data, setCurrentStep } = useOnboardingStore();
  
  useEffect(() => {
    // Update current step in store
    if (data.currentStep !== 4) {
      setCurrentStep(4);
    }
  }, [data.currentStep, setCurrentStep]);
  
  const handleNext = () => {
    // Navigate to the completion page
    // Consider calling completeOnboarding() from the store here if appropriate
    router.push('/onboarding-complete');
  };
  
  const handleBack = () => {
    router.push('/clinic-owner/step3');
  };
  
  return <VerificationDocumentsForm onNext={handleNext} onBack={handleBack} />;
}
