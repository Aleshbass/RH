'use client';

import { useRouter } from 'next/navigation';
import ServicesAndFacilitiesForm from '@/components/onboarding/clinic-owner/ServicesAndFacilitiesForm'; // Correct form for Step 3
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function ServicesAndFacilitiesPage() { // Renamed component for clarity
  const router = useRouter();
  const { data, setCurrentStep } = useOnboardingStore();
  
  useEffect(() => {
    // Update current step in store
    if (data.currentStep !== 3) {
      setCurrentStep(3);
    }
  }, [data.currentStep, setCurrentStep]);
  
  const handleNext = () => {
    // Navigate to the next step (Step 4 for verification documents)
    router.push('/clinic-owner/step4');
  };
  
  const handleBack = () => {
    router.push('/clinic-owner/step2');
  };
  
  return <ServicesAndFacilitiesForm onNext={handleNext} onBack={handleBack} />; // Use ServicesAndFacilitiesForm
}
