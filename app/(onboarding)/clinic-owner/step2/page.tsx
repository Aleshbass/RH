'use client';

import { useRouter } from 'next/navigation';
import ClinicInfoForm from '@/components/onboarding/clinic-owner/ClinicInfoForm'; // Correct form for Step 2
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function ClinicDetailsPage() { // Renamed component for clarity
  const router = useRouter();
  const { data, setCurrentStep } = useOnboardingStore();
  
  useEffect(() => {
    // Update current step in store
    if (data.currentStep !== 2) {
      setCurrentStep(2);
    }
  }, [data.currentStep, setCurrentStep]);
  
  const handleNext = () => {
    router.push('/clinic-owner/step3');
  };
  
  const handleBack = () => {
    router.push('/clinic-owner/step1');
  };
  
  return <ClinicInfoForm onNext={handleNext} onBack={handleBack} />; // Use ClinicInfoForm
}
