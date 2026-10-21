// /Users/ella/rehabifyhealth/app/(onboarding)/role-selection/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOnboardingStore, UserRole } from '@/stores/onboardingStore';
// Add this type that excludes 'admin' from UserRole
type OnboardingRole = Exclude<UserRole, 'admin'>;
import { Button } from '@/components/ui/button';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useQuery } from 'convex/react';

// A simple way to generate a unique ID for the onboarding session
const generateOnboardingId = () => `onboarding_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;

function RoleSelectionContent() {
  const router = useRouter();
  const { setRoleAndStep, setCurrentOnboardingId, setActualClinicId } = useOnboardingStore();
  const updateUserRole = useMutation(api.users.updateUserRole);
  const [loadingRole, setLoadingRole] = useState<OnboardingRole | null>(null);
  const currentUser = useQuery(api.users.getMyUser);
  // Admins can pause new registrations per role (/dashboard/admin/system); the server enforces it too
  const platform = useQuery(api.platformSettings.getPublicPlatformStatus);
  const isPaused = (role: OnboardingRole) => {
    if (!platform || currentUser?.role === role) return false;
    if (role === 'patient') return !platform.allowPatientSignups;
    if (role === 'physiotherapist') return !platform.allowPhysioSignups;
    if (role === 'clinic_owner') return !platform.allowClinicSignups;
    return false;
  };

  // If user already completed onboarding, check their approval status
  useEffect(() => {
    // Check for pending patient invitation first
    const pendingInvite = typeof window !== 'undefined' ? localStorage.getItem('rehabify_pending_invite') : null
    // Patient invites are only for new or patient accounts; a staff account just drops the stale code
    if (pendingInvite && currentUser?.role && currentUser.role !== 'patient') {
      localStorage.removeItem('rehabify_pending_invite')
    } else if (pendingInvite && currentUser !== undefined) {
      // User has a pending invitation, redirect to complete it
      router.replace(`/patient-invite/${pendingInvite}`)
      return
    }

    if (currentUser && currentUser.onboarded) {
      // Only redirect if the user also has a role assigned
      // This prevents an infinite loop where DashboardAuthGuard redirects to /role-selection
      // because role is missing, but this page redirects back to /dashboard because onboarded is true
      if (currentUser.role) {
        // For roles that require approval, check status before redirecting
        if (currentUser.role === 'physiotherapist' || currentUser.role === 'clinic_owner') {
          // Let DashboardAuthGuard handle the approval status check
          router.replace('/dashboard');
        } else {
          // Admin can go directly to dashboard
          if (currentUser.role === 'admin') {
            router.replace('/dashboard');
          } else if (currentUser.role === 'patient') {
            // Patient goes to step 1 if they are here (meaning they might need to complete profile)
            // But if they are fully onboarded, maybe they should go to dashboard?
            // The user said: "not a long onboarding step immediately they are done onboarding we save that to database then we send the to find my physio page"
            // So if they are already onboarded, they should probably go to dashboard or find-a-physio.
            // Let's assume if they are here, they might want to update or we just send them to dashboard if onboarded.
            router.replace('/dashboard');
          }
        }
      }
      // If role is missing but onboarded is true, stay here so they can select a role
    }
  }, [currentUser, router]);

  const handleRoleSelect = async (role: OnboardingRole) => {
    if (isPaused(role)) {
      import('sonner').then(({ toast }) => toast.error('New registrations for this account type are paused right now.'));
      return;
    }
    try {
      setLoadingRole(role);

      // Update the role in the database
      await updateUserRole({ role });

      // Update the client-side store
      const newOnboardingId = generateOnboardingId();
      setCurrentOnboardingId(newOnboardingId); // Store the unique ID for this onboarding attempt
      setActualClinicId(undefined); // Clear any previous clinic ID to prevent auth errors
      setRoleAndStep(role, 1); // Set role and start at step 1

      // Navigate to the first step of the respective onboarding flow
      switch (role) {
        case 'physiotherapist':
          // Redirect to the main physiotherapist onboarding page (wizard)
          router.push('/physiotherapist');
          break;
        case 'clinic_owner':
          // Redirect to the main clinic owner onboarding page (wizard)
          router.push('/clinic-owner');
          break;
        case 'patient':
          router.push('/patient/step1');
          break;
        case 'doctor':
          router.push('/doctor');
          break;
        default:
          console.error('Unknown role selected');
          // Optionally, navigate to an error page or back to role selection
          break;
      }
    } catch (error: any) {
      console.error('Error updating user role:', error);
      import('sonner').then(({ toast }) => toast.error(error.message || 'Failed to update role. Please try again.'));
    } finally {
      setLoadingRole(null);
    }
  };

  const searchParams = useSearchParams();
  const targetRole = searchParams.get('role');
  const hideOthers = targetRole === 'doctor';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-teal-100">
      <div className="w-full max-w-2xl shadow-xl bg-white/80 backdrop-blur-md rounded-xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-semibold text-teal-800">
            Welcome to Rehabify Health!
          </h1>
          <p className="text-lg text-teal-700 pt-2">
            Please select your role to get started.
          </p>
        </div>
        <div className={`grid gap-4 mt-8 ${hideOthers ? 'sm:grid-cols-1 max-w-sm mx-auto' : 'sm:grid-cols-2'}`}>
          {/* Doctor Card */}
          <button
            onClick={() => handleRoleSelect('doctor')}
            disabled={loadingRole !== null}
            className={`p-6 bg-white border-2 rounded-2xl text-left transition-all duration-200 group relative overflow-hidden ${loadingRole === 'doctor' ? 'border-green-500 ring-2 ring-green-200 opacity-80' : 'border-green-100 hover:border-green-500 hover:shadow-md'
              }`}
          >
            <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-500 group-hover:text-white transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">Referring Doctor</h3>
            <p className="text-sm text-gray-500">I want to refer my patients for physio.</p>
          </button>

          {!hideOthers && (
            <>
              {/* Physiotherapist Card */}
              <button
                onClick={() => handleRoleSelect('physiotherapist')}
                disabled={loadingRole !== null || isPaused('physiotherapist')}
                className={`p-6 bg-white border-2 rounded-2xl text-left transition-all duration-200 group relative overflow-hidden ${loadingRole === 'physiotherapist' ? 'border-teal-500 ring-2 ring-teal-200 opacity-80' : 'border-teal-100 hover:border-teal-500 hover:shadow-md'
                  }`}
              >
                <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-teal-500 group-hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Physiotherapist</h3>
                <p className="text-sm text-gray-500">I treat patients and want to manage my practice.</p>
                {isPaused('physiotherapist') && <p className="mt-2 text-xs font-medium text-amber-700">New registrations are paused</p>}
              </button>

              {/* Clinic Owner Card */}
              <button
                onClick={() => handleRoleSelect('clinic_owner')}
                disabled={loadingRole !== null || isPaused('clinic_owner')}
                className={`p-6 bg-white border-2 rounded-2xl text-left transition-all duration-200 group relative overflow-hidden ${loadingRole === 'clinic_owner' ? 'border-emerald-500 ring-2 ring-emerald-200 opacity-80' : 'border-emerald-100 hover:border-emerald-500 hover:shadow-md'
                  }`}
              >
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Clinic Owner</h3>
                <p className="text-sm text-gray-500">I run a facility and manage multiple staff.</p>
                {isPaused('clinic_owner') && <p className="mt-2 text-xs font-medium text-amber-700">New registrations are paused</p>}
              </button>

              {/* Patient Card */}
              <button
                onClick={() => handleRoleSelect('patient')}
                disabled={loadingRole !== null || isPaused('patient')}
                className={`p-6 bg-white border-2 rounded-2xl text-left transition-all duration-200 group relative overflow-hidden ${loadingRole === 'patient' ? 'border-blue-500 ring-2 ring-blue-200 opacity-80' : 'border-blue-100 hover:border-blue-500 hover:shadow-md'
                  }`}
              >
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Patient</h3>
                <p className="text-sm text-gray-500">I need care or have an invitation link.</p>
                {isPaused('patient') && <p className="mt-2 text-xs font-medium text-amber-700">New registrations are paused</p>}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="mt-8 text-sm text-gray-600">
        Rehabify Health © {new Date().getFullYear()}
      </p>
    </div>
  );
}

export default function RoleSelectionPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100">Loading...</div>}>
      <RoleSelectionContent />
    </React.Suspense>
  );
}