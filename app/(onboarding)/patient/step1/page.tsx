'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnboardingStore } from '@/stores/onboardingStore';
import PersonalInfoForm, { PatientInfoValues } from '@/components/onboarding/patient/PersonalInfoForm';
import { useValidateInvitationCode } from '@/lib/api/patientInvitations';

export default function PatientStep1Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, setRoleAndStep, updatePatientData } = useOnboardingStore();
  
  // Extract invitation code from URL parameters (if any)
  const invitationCode = searchParams.get('invitationCode');
  
  // Use the backend API hook to validate the invitation code
  const { isLoading, isValid, invitation, message } = useValidateInvitationCode(invitationCode);
  
  // State to track invitation validation status
  const [invitationStatus, setInvitationStatus] = useState<{
    isValid: boolean;
    message: string;
    physiotherapist?: {
      name: string;
      type: 'private' | 'clinic';
      clinicName?: string;
    };
  }>({ isValid: false, message: 'Validating invitation...' });

  // Update invitation status when validation results change
  useEffect(() => {
    if (isLoading) {
      setInvitationStatus({
        isValid: false,
        message: 'Validating invitation...'
      });
    } else if (!invitationCode) {
      setInvitationStatus({
        isValid: false,
        message: 'No invitation code provided. You need an invitation from a physiotherapist to continue.'
      });
    } else if (isValid && invitation) {
      // Real validation successful
      setInvitationStatus({
        isValid: true,
        message: 'Invitation validated successfully',
        physiotherapist: {
          name: invitation.physiotherapistName,
          type: 'clinic', // Assuming all physiotherapists are part of a clinic in our system
          clinicName: invitation.clinicName
        }
      });

      // Set role to patient in the onboarding store
      setRoleAndStep('patient', 1);
      
      // Pre-fill patient data if provided in the invitation
      if (invitation.patientEmail || invitation.patientName) {
        const names = invitation.patientName ? invitation.patientName.split(' ') : ['', ''];
        updatePatientData({
          firstName: names[0] || '',
          lastName: names.slice(1).join(' ') || '',
          email: invitation.patientEmail || ''
        });
      }
    } else {
      // Validation failed
      setInvitationStatus({
        isValid: false,
        message: message || 'Invalid invitation code. Please check and try again.'
      });
    }
  }, [isLoading, isValid, invitation, message, invitationCode, setRoleAndStep, updatePatientData]);

  const handleSubmit = (formData: PatientInfoValues) => {
    // Store the form data in Zustand store - only use fields that exist in PatientData
    updatePatientData({
      ...formData,
      // Store invitation info in a comment field if needed
      medicalHistory: `Invited by: ${invitationCode || 'Unknown'} \n\n${formData.medicalHistory || ''}`,
    });

    // Navigate to the next step
    router.push('/patient/step2');
  };

  const handleBack = () => {
    router.push('/');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-teal-100">
      <div className="w-full max-w-2xl p-8 space-y-6 bg-white/90 backdrop-blur-sm rounded-xl shadow-xl">
        <PersonalInfoForm 
          initialData={data.patientData}
          invitationInfo={invitationStatus}
          invitationCode={invitationCode}
          onSubmit={handleSubmit}
          onBack={handleBack}
        />
      </div>
    </div>
  );
}
