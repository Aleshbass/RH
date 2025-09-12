

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { useActionUntyped } from "../convexUntyped";

/**
 * Hook to validate a patient invitation code
 * @param code The invitation code to validate
 * @returns Object containing validation state and invitation data
 */
export function useValidateInvitationCode(code: string | null) {
  const result = useQuery(
    api.patientInvitations.validateInvitationCode, 
    code ? { code } : "skip"
  );
  
  return {
    isLoading: result === undefined,
    isValid: result?.valid || false,
    invitation: result?.invitation,
    physiotherapist: (result as unknown as { physiotherapist?: unknown })?.physiotherapist,
    clinic: (result as unknown as { clinic?: unknown })?.clinic,
    message: (result as unknown as { error?: string })?.error || 'Unknown error',
  };
}

/**
 * Hook to complete patient onboarding
 * @returns Function to complete patient onboarding and success state
 */
export function useCompletePatientOnboarding() {
  // Use the action wrapper so notifications are sent and logic is unified
  // Using untyped action hook to avoid deep TS instantiation issues
  const completeOnboarding = useActionUntyped((api as unknown as { actions: { patients: { completeOnboarding: { completePatientOnboardingWithNotification: unknown }}}}).actions.patients.completeOnboarding.completePatientOnboardingWithNotification);
  
  return {
    completePatientOnboarding: async (invitationCode: string, patientData: {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber?: string;
      dateOfBirth?: string;
      gender?: "male" | "female" | "other" | "prefer_not_to_say";
      medicalHistory?: string;
      emergencyContact?: string;
    }) => {
      return await completeOnboarding({ invitationCode, patientData });
    }
  };
}

/**
 * Hook to create a new patient invitation (for physiotherapists)
 * @returns Function to create a new invitation and success state
 */
export function useCreatePatientInvitation() {
  // Use the unified Convex action that also sends email + notification
  // Using untyped action hook to avoid deep TS instantiation issues
  const createInvitationAction = useActionUntyped(
    (api as unknown as { actions: { patients: { invitePatient: { createPatientInvitationWithNotification: unknown }}}}).actions.patients.invitePatient.createPatientInvitationWithNotification
  );

  return {
    createPatientInvitation: async (data: {
      patientEmail?: string;
      patientName?: string;
      notes?: string;
      expirationDays?: number;
      sendEmail?: boolean;
    }) => {
      // Ensure patientEmail is provided or use empty string as fallback
      const invitationData = {
        ...data,
        patientEmail: data.patientEmail || '',
        // Default to true unless explicitly set to false
        sendEmail: data.sendEmail !== false,
      };
      return await createInvitationAction(invitationData);
    },
  };
}

/**
 * Hook to get all patient invitations created by the current physiotherapist
 * @param status Optional filter for invitation status
 * @returns Array of patient invitations
 */
export function useMyPatientInvitations(status?: "pending" | "accepted" | "expired" | "all") {
  const invitations = useQuery(
    api.patientInvitations.getMyPatientInvitations, 
    status && status !== "all" ? { status } : {}
  );
  
  return {
    isLoading: invitations === undefined,
    invitations: invitations || [],
  };
}

/**
 * Hook to get all patients for the current physiotherapist
 * @param status Optional filter for relationship status
 * @returns Array of patients
 */
export function useMyPatients(status?: "active" | "inactive" | "archived" | "all") {
  const patients = useQuery(
    api.patientInvitations.getMyPatients, 
    status && status !== "all" ? { status } : {}
  );
  
  return {
    isLoading: patients === undefined,
    patients: patients || [],
  };
}

/**
 * Hook to get all physiotherapists for the current patient
 * @param status Optional filter for relationship status
 * @returns Array of physiotherapists
 */
export function useMyPhysiotherapists(status?: "active" | "inactive" | "archived" | "all") {
  const physiotherapists = useQuery(
    api.patientInvitations.getMyPhysiotherapists, 
    status && status !== "all" ? { status } : {}
  );
  
  return {
    isLoading: physiotherapists === undefined,
    physiotherapists: physiotherapists || [],
  };
}
