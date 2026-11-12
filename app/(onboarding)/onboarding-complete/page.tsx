"use client";

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import { PhysioGuideVideoModal } from '@/components/dashboard/shared/PhysioGuideVideoModal';
import { RehabifyLoader } from "@/components/brand/RehabifyLoader";

type Status = "loading" | "success" | "error";

// Plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const getMyUserRef = makeFunctionReference<'query', Record<string, never>, { role?: string } | null>('users:getMyUser');

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Finalizing your onboarding...");
  const [showModal, setShowModal] = useState(false);
  const [showVideoGuide, setShowVideoGuide] = useState(false);

  // The account type comes from the server, never from answers saved in the browser: those can
  // be months old (or from another account on the same device) and used to re-submit stale details.
  const me = useQuery(getMyUserRef, {});
  const role = me?.role;

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) {
      router.replace('/sign-in');
      return;
    }
    if (role === 'patient') {
      // Patient onboarding is already completed in the earlier steps
      setStatus("success");
      setMessage("Patient onboarding complete! You're all set.");
      setShowModal(true);
      return;
    }
    if (!role) {
      setStatus("error");
      setMessage("We couldn't find your account type. Please choose it again.");
      return;
    }
    // Physiotherapist and clinic forms submit the application themselves; the dashboard routes
    // everyone else (and shows "under review" where needed)
    router.replace(role === 'physiotherapist' ? '/dashboard/physiotherapist' : '/dashboard');
  }, [me, role, router]);

  // Real-time check for approval status
  const dashboardAccess = useQuery(api.queries.checkDashboardAccess);

  useEffect(() => {
    if (dashboardAccess?.canAccess) {
      // If approved, redirect immediately
      router.replace('/dashboard');
    }
  }, [dashboardAccess, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-rh-canvas">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          {status === "loading" && (
            <RehabifyLoader size={64} className="mx-auto" />
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
                  {role === 'patient' && (
                    <>Your onboarding is complete. You can now explore your personal dashboard, book appointments, and view your treatment plan.</>
                  )}
                  {(role === 'physiotherapist' || role === 'clinic_owner') && (
                    <>Your onboarding is complete and your account is now awaiting admin approval. While you wait, feel free to explore the platform and get set up.</>
                  )}
                </p>
              </div>
              <div className="px-8 pb-8">
                {(role === 'physiotherapist' || role === 'clinic_owner') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <FeatureCard title="Set up your calendar" desc="Review your schedule and availability." icon="📅" />
                    <FeatureCard title="Explore treatment plans" desc="Browse and personalize plans." icon="🧩" />
                    <FeatureCard title="Invite a test patient" desc="Try the patient experience." icon="👤" />
                    <FeatureCard title="Connect your tools" desc="Calendar, video calls and more." icon="🔌" />
                  </div>
                )}
                {role === 'patient' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <FeatureCard title="Book an appointment" desc="Find a time that works for you." icon="🗓️" />
                    <FeatureCard title="View your plan" desc="See exercises and goals." icon="🏆" />
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => router.push(role === 'patient' ? '/dashboard/patient' : '/dashboard')}
                    className="inline-flex items-center justify-center px-5 py-3 rounded-lg bg-teal-dark text-white hover:opacity-90 transition"
                  >
                    Go to Dashboard
                  </button>
                  {(role === 'physiotherapist' || role === 'clinic_owner') && (
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

      {/* Platform guide video — shown to physios right after onboarding */}
      {showVideoGuide && role === 'physiotherapist' && (
        <PhysioGuideVideoModal
          forceShow
          title="🎬 Welcome to Rehabify!"
          subtitle="While we review your application, watch this quick guide to get familiar with the platform."
          onClose={() => setShowVideoGuide(false)}
        />
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