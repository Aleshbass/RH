import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";

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
    message: result?.message,
  };
}

/**
 * Hook to complete patient onboarding
 * @returns Function to complete patient onboarding and success state
 */
export function useCompletePatientOnboarding() {
  const completeOnboarding = useMutation(api.patientInvitations.completePatientOnboarding);
  
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
  const createInvitation = useMutation(api.patientInvitations.createPatientInvitation);
  
  return {
    createPatientInvitation: async (data: {
      patientEmail?: string;
      patientName?: string;
      notes?: string;
      expirationDays?: number;
    }) => {
      return await createInvitation(data);
    }
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
    status ? { status } : {}
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
    status ? { status } : {}
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
    status ? { status } : {}
  );
  
  return {
    isLoading: physiotherapists === undefined,
    physiotherapists: physiotherapists || [],
  };
}
