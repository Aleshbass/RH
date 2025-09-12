"use client";


import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useUserProfileMutation } from "@/lib/onboardingHelpers";


import { useOnboardingStore } from '@/stores/onboardingStore';

type Status = "loading" | "success" | "error";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Finalizing your onboarding...");
  const { data } = useOnboardingStore();
  const [showModal, setShowModal] = useState(false);

  // Completion actions for non-patient roles
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
            // Patient onboarding is already completed in step 2.
            setStatus("success");
            setMessage("Patient onboarding complete! You're all set.");
            setShowModal(true);
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
            setShowModal(true);
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
            setShowModal(true);
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
  }, [completeUserProfile, router, data]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          {status === "loading" && (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-dark mx-auto"></div>
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
                onClick={() => router.push("/role-selection")}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Start Over
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Success Modal */}
      {status === 'success' && showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden shadow-2xl">
            <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden>
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#002e2c" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#g)" />
              </svg>
            </div>
            <div className="bg-white">
              <div className="bg-gradient-to-r from-call-bg to-white p-8">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🎉</span>
                  <h3 className="text-2xl font-bold text-teal-dark">Congratulations!</h3>
                </div>
                <p className="mt-3 text-gray-700">
                  {data.role === 'patient' && (
                    <>Your onboarding is complete. You can now explore your personal dashboard, book appointments, and view your treatment plan.</>
                  )}
                  {(data.role === 'physiotherapist' || data.role === 'clinic_owner') && (
                    <>Your onboarding is complete and your account is now awaiting admin approval. While you wait, feel free to explore the platform and get set up.</>
                  )}
                </p>
              </div>
              <div className="px-8 pb-8">
                {(data.role === 'physiotherapist' || data.role === 'clinic_owner') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <FeatureCard title="Set up your calendar" desc="Review your schedule and availability." icon="📅" />
                    <FeatureCard title="Explore treatment plans" desc="Browse and personalize plans." icon="🧩" />
                    <FeatureCard title="Invite a test patient" desc="Try the patient experience." icon="👤" />
                    <FeatureCard title="Connect your tools" desc="Calendar, video calls and more." icon="🔌" />
                  </div>
                )}
                {data.role === 'patient' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <FeatureCard title="Book an appointment" desc="Find a time that works for you." icon="🗓️" />
                    <FeatureCard title="View your plan" desc="See exercises and goals." icon="🏆" />
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => router.push(data.role === 'patient' ? '/dashboard/patient' : '/dashboard')}
                    className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-teal-dark text-white hover:opacity-90 transition"
                  >
                    Go to Dashboard
                  </button>
                  {(data.role === 'physiotherapist' || data.role === 'clinic_owner') && (
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="inline-flex items-center justify-center px-5 py-3 rounded-lg border border-teal-dark text-teal-dark hover:bg-call-bg transition"
                    >
                      Explore Features
                    </button>
                  )}
                  <button
                    onClick={() => setShowModal(false)}
                    className="ml-auto inline-flex items-center justify-center px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 bg-white/80">
      <div className="flex items-start gap-3">
        <div className="text-2xl">{icon}</div>
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          <div className="text-sm text-gray-600">{desc}</div>
        </div>
      </div>
    </div>
  );
}