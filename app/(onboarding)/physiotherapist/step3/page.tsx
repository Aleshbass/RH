'use client';

import { useRouter } from 'next/navigation';
import LicenseCredentialsForm from '@/components/onboarding/physiotherapist/LicenseCredentialsForm';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function LicenseCredentialsPage() {
  const router = useRouter();
  const { setCurrentStep } = useOnboardingStore();
  
  useEffect(() => {
    // Update current step in store
    setCurrentStep(3);
  }, [setCurrentStep]);
  
  const handleComplete = () => {
    router.push('/onboarding-complete');
  };
  
  const handlePrev = () => {
    router.push('/physiotherapist/step2');
  };
  
  return <LicenseCredentialsForm onComplete={handleComplete} onPrev={handlePrev} />;
}
