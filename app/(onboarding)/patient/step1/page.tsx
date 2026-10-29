'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnboardingStore } from '@/stores/onboardingStore';
import PersonalInfoForm, { PatientInfoValues } from '@/components/onboarding/patient/PersonalInfoForm';
import { useValidateInvitationCode } from '@/lib/api/patientInvitations';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { programError } from '@/components/exercise-programs/errors';
import { PATIENT_CONSENT_POLICIES, policyVersions } from '@/lib/policies';

function PatientStep1Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, setRoleAndStep, updatePatientData } = useOnboardingStore();

  // Extract invitation code from URL parameters (if any)
  const invitationCode = searchParams ? searchParams.get('invitationCode') : null;

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
      // Allow self-signup if no code provided
      setInvitationStatus({
        isValid: true,
        message: 'Self-signup mode'
      });
    } else if (isValid && invitation) {
      // Real validation successful - use the invitation data directly
      setInvitationStatus({
        isValid: true,
        message: 'Invitation validated successfully',
        physiotherapist: {
          name: 'Physiotherapist', // Placeholder - will be updated when API returns full data
          type: 'clinic', // Assuming all physiotherapists are part of a clinic in our system
          clinicName: 'Healthcare Clinic' // Placeholder - will be updated when API returns full data
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

  const completeProfile = useMutation(api.users.completeUserProfile);

  const handleSubmit = async (formData: PatientInfoValues) => {
    const { acceptTerms, ...details } = formData;
    // Store the form data in Zustand store
    updatePatientData({
      ...details,
      // medicalHistory removed from form, so we don't append invitation info here anymore
      // or we can just store the invitation info if needed, but formData doesn't have medicalHistory
    });

    try {
      // Calculate approximate date of birth from age
      // We set it to January 1st of the birth year
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - (formData.age || 0);
      const dateOfBirth = `${birthYear}-01-01`;

      // Save to backend
      await completeProfile({
        role: 'patient',
        profileData: {
          dateOfBirth: dateOfBirth,
          gender: formData.gender,
          address: formData.location, // Mapping location to address
          phoneNumber: formData.phoneNumber,
          therapyFor: formData.therapyFor,
          // Removed: therapyType, relationshipStatus, medicalHistorySummary, emergencyContactName
        },
        firstName: formData.firstName,
        lastName: formData.lastName,
        finalStep: true,
        // Terms and Privacy, recorded append-only (channel "web")
        acceptedPolicies: acceptTerms ? policyVersions(PATIENT_CONSENT_POLICIES) : undefined,
      });

      // Navigate to Find a Physio page
      router.push('/find-a-physio');
    } catch (error) {
      console.error("Failed to complete profile:", error);
      toast.error(programError(error, "We couldn't save your details. Please check them and try again."));
    }
  };

  const handleBack = () => {
    router.push('/');
  };

  const currentUser = useQuery(api.users.getMyUser);

  // Merge store data with current user data for auto-fill
  const initialData = {
    ...data.patientData,
    firstName: data.patientData.firstName || currentUser?.firstName || '',
    lastName: data.patientData.lastName || currentUser?.lastName || '',
    email: data.patientData.email || currentUser?.email || '',
    // Phone might not be in currentUser depending on schema, but if it is, add it here
    // "Family / caregiver" in Get started lands here with ?for=family
    therapyFor: data.patientData.therapyFor || (searchParams?.get('for') === 'family' ? 'family_member' : ''),
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-rh-canvas">
      <div className="w-full max-w-2xl p-8 space-y-6 bg-white/90 backdrop-blur-sm rounded-xl shadow-xl">
        <PersonalInfoForm
          initialData={initialData}
          invitationInfo={invitationStatus}
          invitationCode={invitationCode}
          onSubmit={handleSubmit}
          onBack={handleBack}
        />
      </div>
    </div>
  );
}

export default function PatientStep1Page() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-rh-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-rh-ink" />
      </div>
    }>
      <PatientStep1Content />
    </Suspense>
  );
}
