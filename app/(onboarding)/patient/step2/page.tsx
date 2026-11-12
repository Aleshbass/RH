'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnboardingStore } from '@/stores/onboardingStore';
import HealthInfoForm, { PatientHealthInfoValues } from '@/components/onboarding/patient/HealthInfoForm';
import { useCompletePatientOnboarding } from '@/lib/api/patientInvitations';
import { toast } from 'sonner';
import { RehabifyLoader } from '@/components/brand/RehabifyLoader';

function PatientStep2Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, updatePatientData } = useOnboardingStore();
  const { completePatientOnboarding } = useCompletePatientOnboarding();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get invitation code from URL parameters
  const invitationCode = searchParams ? searchParams.get('invitationCode') : null;

  // Redirect if patient data doesn't exist or patient role not set
  if (!data.patientData || data.role !== 'patient') {
    router.push('/patient/step1');
    return null;
  }

  // Format all health info fields into a single string to store in medicalHistory
  const formatHealthInfoToMedicalHistory = (healthInfo: PatientHealthInfoValues, existingMedicalHistory: string): string => {
    const sections = [
      existingMedicalHistory,
      '--- ADDITIONAL HEALTH INFORMATION ---',
      healthInfo.insuranceProvider ? `Insurance Provider: ${healthInfo.insuranceProvider}` : '',
      healthInfo.insurancePolicyNumber ? `Policy Number: ${healthInfo.insurancePolicyNumber}` : '',
      '--- MEDICAL CONDITIONS ---',
      healthInfo.hasMedicalConditions ? 'Has relevant medical conditions: Yes' : 'Has relevant medical conditions: No',
      healthInfo.hasMedicalConditions && healthInfo.medicalConditionsDetails ?
        `Medical Conditions Details: ${healthInfo.medicalConditionsDetails}` : '',
      healthInfo.painLevel ? `Pain Level (1-10): ${healthInfo.painLevel}` : '',
      healthInfo.painLocations ? `Pain Locations: ${healthInfo.painLocations}` : '',
      healthInfo.mobilityLimitations ? `Mobility Limitations: ${healthInfo.mobilityLimitations}` : '',
      '--- TREATMENT HISTORY & GOALS ---',
      healthInfo.treatmentGoals ? `Treatment Goals: ${healthInfo.treatmentGoals}` : '',
      healthInfo.previousPhysiotherapy ? 'Previous Physiotherapy: Yes' : 'Previous Physiotherapy: No',
      healthInfo.previousPhysiotherapy && healthInfo.previousPhysiotherapyDetails ?
        `Previous Physiotherapy Details: ${healthInfo.previousPhysiotherapyDetails}` : '',
      '--- CONSENT ---',
      `Consent to Treatment: ${healthInfo.consentToTreatment ? 'Yes' : 'No'}`,
      `Consent to Share Medical Info: ${healthInfo.consentToShareMedicalInfo ? 'Yes' : 'No'}`,
    ];

    // Filter out empty strings and join with newlines
    return sections.filter(section => section).join('\n');
  };

  const handleSubmit = async (formData: PatientHealthInfoValues) => {
    if (!invitationCode) {
      toast.error('Invitation code is missing. Please start the onboarding process again.');
      return;
    }

    if (!data.patientData) {
      toast.error('Patient information is missing. Please go back to step 1.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Format all health info into a single medicalHistory string
      const formattedMedicalHistory = formatHealthInfoToMedicalHistory(formData, data.patientData?.medicalHistory || '');

      // Update the store with the formatted medical history
      updatePatientData({
        ...data.patientData,
        medicalHistory: formattedMedicalHistory,
      });

      // Complete the patient onboarding process with the backend
      const result = await completePatientOnboarding(invitationCode, {
        firstName: data.patientData.firstName,
        lastName: data.patientData.lastName,
        email: data.patientData.email,
        phoneNumber: data.patientData.phoneNumber,
        dateOfBirth: data.patientData.dateOfBirth,
        medicalHistory: formattedMedicalHistory,
        emergencyContact: data.patientData.emergencyContact ? JSON.stringify(data.patientData.emergencyContact) : undefined,
      });

      if (result.success) {
        toast.success('Onboarding completed successfully!');
        // Navigate to onboarding completion
        router.push('/onboarding-complete');
      } else {
        toast.error(result.message || 'Failed to complete onboarding. Please try again.');
      }
    } catch (error) {
      console.error('Error completing patient onboarding:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.push('/patient/step1');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-rh-canvas">
      <div className="w-full max-w-2xl p-8 space-y-6 bg-white/90 backdrop-blur-sm rounded-xl shadow-xl">
        <HealthInfoForm
          onSubmit={handleSubmit}
          onBack={handleBack}
          isExternallySubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}

export default function PatientStep2Page() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-rh-canvas">
        <RehabifyLoader size={64} />
      </div>
    }>
      <PatientStep2Content />
    </Suspense>
  );
}
