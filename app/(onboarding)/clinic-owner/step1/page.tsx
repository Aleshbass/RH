'use client';

import { useRouter } from 'next/navigation';
import ClinicOwnerPersonalInfoForm from '@/components/onboarding/clinic-owner/ClinicOwnerPersonalInfoForm'; // Updated import
import { useUser } from '@clerk/nextjs'; // Added for Clerk
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useEffect } from 'react';

export default function ClinicOwnerStep1Page() { // Renamed component for clarity
  const router = useRouter();
  const { data, setCurrentStep, updateClinicOwnerData } = useOnboardingStore(); // Added updateClinicOwnerData
  const { user, isLoaded } = useUser(); // Added for Clerk
  
  useEffect(() => {
    // Update current step in store if needed
    if (data.currentStep !== 1) {
      setCurrentStep(1);
    }
  }, [data.currentStep, setCurrentStep]);

  // Effect to pre-fill data from Clerk
  useEffect(() => {
    if (isLoaded && user) {
      const clerkFirstName = user.firstName || '';
      const clerkLastName = user.lastName || '';
      const clerkEmail = user.primaryEmailAddress?.emailAddress || '';
      const clerkProfilePhotoUrl = user.imageUrl || ''; // Get profile photo URL

      // Only pre-fill if the store values are currently empty for personal info
      // and profilePhotoUrl is not already set (to avoid overwriting a user's manual entry if they clear and come back)
      if (!data.clinicOwnerData.firstName && 
          !data.clinicOwnerData.lastName && 
          !data.clinicOwnerData.email && 
          !data.clinicOwnerData.profilePhotoUrl
      ) {
        updateClinicOwnerData({
          firstName: clerkFirstName,
          lastName: clerkLastName,
          email: clerkEmail, // This is the personal email
          profilePhotoUrl: clerkProfilePhotoUrl, // Pre-fill profile photo URL
          // isOwner defaults to true in store, positionIfNotOwner is optional
          // phoneNumber is not pre-filled from Clerk here
        });
      }
    }
  }, [isLoaded, user, updateClinicOwnerData, data.clinicOwnerData]);
  
  const handleNext = () => {
    router.push('/clinic-owner/step2'); // This will now correctly lead to the clinic details form
  };
  
  return <ClinicOwnerPersonalInfoForm onNext={handleNext} />; // Use the new form
}
