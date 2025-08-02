"use client";


import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePatientOnboardingAction, useUserProfileMutation } from "@/lib/onboardingHelpers";


import { useOnboardingStore } from '@/stores/onboardingStore';

type Status = "loading" | "success" | "error";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Finalizing your onboarding...");
  const { data } = useOnboardingStore();

  // Different completion actions for different roles
  const completePatientOnboarding = usePatientOnboardingAction();
  const completeUserProfile = useUserProfileMutation();

  useEffect(() => {
    const runOnboarding = async () => {
      try {
        const userRole = data.role;
        
        if (!userRole) {
          throw new Error("User role not found");
        }

        // Handle different completion flows based on role
        switch (userRole) {
          case 'patient':
            // Patient completion flow (existing logic)
            if (!data.patientData) {
              throw new Error("Patient data not found");
            }

            await completePatientOnboarding({
              invitationCode: data.invitationCode || "",
              patientData: {
                firstName: data.patientData.firstName,
                lastName: data.patientData.lastName,
                email: data.patientData.email,
                phoneNumber: data.patientData.phoneNumber || "",
                dateOfBirth: data.patientData.dateOfBirth,
                medicalHistory: data.patientData.medicalHistory,
                emergencyContact: data.patientData.emergencyContact,
                gender: data.patientData.gender
              },
              sendEmail: true
            });

            setStatus("success");
            setMessage("Patient onboarding complete! Redirecting to your dashboard...");
            
            setTimeout(() => {
              router.push("/dashboard/patient");
            }, 3000);
            break;

          case 'physiotherapist':
            // Physiotherapist completion flow
            if (!data.physiotherapistData) {
              throw new Error("Physiotherapist data not found");
            }

            // Complete the physiotherapist profile with final step flag
            await completeUserProfile({
              role: "physiotherapist",
              profileData: {
                specializations: data.physiotherapistData.specializations || [],
                licenseNumber: data.physiotherapistData.licenseNumber || "",
                yearsOfExperience: data.physiotherapistData.yearsOfExperience || 0,
                bio: data.physiotherapistData.bio || "",
                certificationBoard: data.physiotherapistData.certificationBoard || "",
                certificationYear: data.physiotherapistData.certificationYear || new Date().getFullYear(),
                licenseExpiryDate: data.physiotherapistData.licenseExpiryDate || "",
              },
              firstName: data.physiotherapistData.firstName,
              lastName: data.physiotherapistData.lastName,
              finalStep: true, // This is the final step!
            });

            setStatus("success");
            setMessage("Physiotherapist application submitted! Your account is pending admin approval.");
            
            setTimeout(() => {
              router.push("/dashboard"); // Will show pending approval page
            }, 3000);
            break;

          case 'clinic_owner':
            // Clinic owner completion flow
            if (!data.clinicOwnerData) {
              throw new Error("Clinic owner data not found");
            }

            // Complete the clinic owner profile with final step flag
            await completeUserProfile({
              role: "clinic_owner",
              profileData: {
                // Add clinic owner specific data here
              },
              firstName: data.clinicOwnerData.firstName,
              lastName: data.clinicOwnerData.lastName,
              finalStep: true, // This is the final step!
            });

            setStatus("success");
            setMessage("Clinic registration submitted! Your account is pending admin approval.");
            
            setTimeout(() => {
              router.push("/dashboard"); // Will show pending approval page
            }, 3000);
            break;

          default:
            throw new Error(`Unknown user role: ${userRole}`);
        }

      } catch (err) {
        console.error("Onboarding completion failed:", err);
        setStatus("error");
        setMessage(`An error occurred during onboarding: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again or contact support.`);
      }
    };

    runOnboarding();
  }, [completePatientOnboarding, completeUserProfile, router, data]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          {status === "loading" && (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          )}
          {status === "success" && (
            <div className="text-green-500 text-4xl mb-4">✓</div>
          )}
          {status === "error" && (
            <div className="text-red-500 text-4xl mb-4">⚠</div>
          )}
          <h2 className="text-2xl font-semibold mb-4">
            {status === "success" ? "Onboarding Complete!" : "Completing Onboarding"}
          </h2>
          <p className="text-gray-600">{message}</p>
          
          {status === "error" && (
            <div className="mt-4 space-y-2">
              <button
                onClick={() => router.back()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Go Back
              </button>
              <br />
              <button
                onClick={() => router.push("/onboarding/role-selection")}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}