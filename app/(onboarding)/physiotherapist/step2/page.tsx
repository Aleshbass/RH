'use client';

import { useRouter } from 'next/navigation';
import ProfessionalDetailsForm from '@/components/onboarding/physiotherapist/ProfessionalDetailsForm';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function ProfessionalDetailsPage() {
  const router = useRouter();
  const { setCurrentStep } = useOnboardingStore();
  
  useEffect(() => {
    // Update current step in store
    setCurrentStep(2);
  }, [setCurrentStep]);
  
  const handleNext = () => {
    router.push('/physiotherapist/step3');
  };
  
  const handlePrev = () => {
    router.push('/physiotherapist/step1');
  };
  
  return <ProfessionalDetailsForm onNext={handleNext} onPrev={handlePrev} />;
}
