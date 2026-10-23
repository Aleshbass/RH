// /Users/ella/rehabifyhealth/app/(onboarding)/role-selection/page.tsx
'use client';

import { FileText, User, Building2, Heart, HeartHandshake } from '@/components/icons'
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useOnboardingStore, UserRole } from '@/stores/onboardingStore';
// Add this type that excludes 'admin' from UserRole
type OnboardingRole = Exclude<UserRole, 'admin'>;
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useQuery } from 'convex/react';
import { programError } from '@/components/exercise-programs/errors';
import {
  forgetIntent,
  onboardingPathFor,
  parseIntent,
  readRememberedIntent,
  roleForIntent,
  type SignupIntent,
} from '@/lib/auth/signupIntent';

// A simple way to generate a unique ID for the onboarding session
const generateOnboardingId = () => `onboarding_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;

type CardIntent = Exclude<SignupIntent, 'partner'>;

const SETTING_UP_LABELS: Record<CardIntent, string> = {
  patient: 'patient',
  physiotherapist: 'physiotherapist',
  clinic_owner: 'clinic',
  doctor: 'referring doctor',
  family: 'caregiver',
};

const DASHBOARD_ROLES = new Set(['physiotherapist', 'clinic_owner', 'patient', 'doctor', 'admin', 'clinic_staff']);

const CARDS: { intent: CardIntent; title: string; body: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { intent: 'patient', title: 'Patient', body: 'I need care or have an invitation link.', icon: Heart, tone: 'blue' },
  { intent: 'physiotherapist', title: 'Physiotherapist', body: 'I treat patients and want to manage my practice.', icon: User, tone: 'teal' },
  { intent: 'clinic_owner', title: 'Clinic Owner', body: 'I run a facility and manage multiple staff.', icon: Building2, tone: 'emerald' },
  { intent: 'doctor', title: 'Referring Doctor', body: 'I want to refer my patients for physio.', icon: FileText, tone: 'green' },
  { intent: 'family', title: 'Family / Caregiver', body: 'I want to arrange care for someone I look after.', icon: HeartHandshake, tone: 'rose' },
];

// Full class names so Tailwind keeps them
const TONES: Record<string, { idle: string; active: string; icon: string }> = {
  blue: { idle: 'border-blue-100 hover:border-blue-500', active: 'border-blue-500 ring-2 ring-blue-200', icon: 'bg-blue-50 text-blue-600 group-hover:bg-blue-500' },
  teal: { idle: 'border-teal-100 hover:border-teal-500', active: 'border-teal-500 ring-2 ring-teal-200', icon: 'bg-teal-50 text-teal-600 group-hover:bg-teal-500' },
  emerald: { idle: 'border-emerald-100 hover:border-emerald-500', active: 'border-emerald-500 ring-2 ring-emerald-200', icon: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500' },
  green: { idle: 'border-green-100 hover:border-green-500', active: 'border-green-500 ring-2 ring-green-200', icon: 'bg-green-50 text-green-600 group-hover:bg-green-500' },
  rose: { idle: 'border-rose-100 hover:border-rose-400', active: 'border-rose-400 ring-2 ring-rose-200', icon: 'bg-rose-50 text-rose-500 group-hover:bg-rose-400' },
};

function RoleSelectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { setRoleAndStep, setCurrentOnboardingId, setActualClinicId } = useOnboardingStore();
  const updateUserRole = useMutation(api.users.updateUserRole);
  const [loadingIntent, setLoadingIntent] = useState<CardIntent | null>(null);
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

  // Chosen before sign-up ("Get started", the sign-up page, or ?role= on older links)
  const urlIntent = parseIntent(searchParams.get('as')) ?? parseIntent(searchParams.get('role'));
  const [suggested, setSuggested] = useState<SignupIntent | null>(urlIntent);
  useEffect(() => {
    if (!urlIntent) setSuggested(readRememberedIntent());
  }, [urlIntent]);
  const autoAppliedRef = useRef(false);

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

    // A finished account never picks again; the dashboard routes it by role (and checks approval).
    // Only roles /dashboard knows, or it would send the user straight back here.
    if (currentUser && currentUser.onboarded && currentUser.role) {
      if (currentUser.role === 'partner') router.replace('/partners/portal');
      else if (DASHBOARD_ROLES.has(currentUser.role)) router.replace('/dashboard');
      return;
    }

    // Arriving signed out (an old link): sign up first, keeping the choice
    if (authLoaded && !isSignedIn && urlIntent) {
      router.replace(`/sign-up?as=${urlIntent}`);
      return;
    }

    // They already said who they are before signing up: set it up without asking again
    if (!urlIntent || autoAppliedRef.current || !currentUser || platform === undefined) return;
    autoAppliedRef.current = true;
    if (urlIntent === 'partner') {
      router.replace(onboardingPathFor('partner'));
      return;
    }
    const role = roleForIntent(urlIntent) as OnboardingRole;
    if (!isPaused(role)) void handleSelect(urlIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the user and platform status have loaded
  }, [currentUser, router, authLoaded, isSignedIn, urlIntent, platform]);

  const handleSelect = async (intent: CardIntent) => {
    const role = roleForIntent(intent) as OnboardingRole;
    if (isPaused(role)) {
      import('sonner').then(({ toast }) => toast.error('New registrations for this account type are paused right now.'));
      return;
    }
    try {
      setLoadingIntent(intent);

      // Update the role in the database (refused once the account is set up as something else)
      await updateUserRole({ role });

      // Update the client-side store
      const newOnboardingId = generateOnboardingId();
      setCurrentOnboardingId(newOnboardingId); // Store the unique ID for this onboarding attempt
      setActualClinicId(undefined); // Clear any previous clinic ID to prevent auth errors
      setRoleAndStep(role, 1); // Set role and start at step 1
      forgetIntent();

      // Navigate to the first step of the respective onboarding flow
      router.push(onboardingPathFor(intent));
    } catch (error) {
      console.error('Error updating user role:', error);
      import('sonner').then(({ toast }) => toast.error(programError(error, 'Failed to update role. Please try again.')));
      setLoadingIntent(null);
    }
  };

  const settingUp = loadingIntent ? SETTING_UP_LABELS[loadingIntent] : null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-teal-100">
      <div className="w-full max-w-2xl shadow-xl bg-white/80 backdrop-blur-md rounded-xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-semibold text-teal-800">
            Welcome to Rehabify Health!
          </h1>
          <p className="text-lg text-teal-700 pt-2" role="status">
            {settingUp ? `Setting up your ${settingUp} account…` : 'Please select your role to get started.'}
          </p>
        </div>
        <div className="grid gap-4 mt-8 sm:grid-cols-2">
          {CARDS.map(({ intent, title, body, icon: Icon, tone }) => {
            const role = roleForIntent(intent) as OnboardingRole;
            const paused = isPaused(role);
            const styles = TONES[tone];
            const isSuggested = suggested === intent && !loadingIntent;
            return (
              <button
                key={intent}
                onClick={() => void handleSelect(intent)}
                disabled={loadingIntent !== null || paused}
                className={`p-6 bg-white border-2 rounded-2xl text-left transition-all duration-200 group relative overflow-hidden ${
                  loadingIntent === intent ? `${styles.active} opacity-80` : isSuggested ? `${styles.active} hover:shadow-md` : `${styles.idle} hover:shadow-md`
                }`}
              >
                {isSuggested && (
                  <span className="absolute right-4 top-4 rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">Your choice</span>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:text-white transition-colors ${styles.icon}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-500">{body}</p>
                {paused && <p className="mt-2 text-xs font-medium text-amber-700">New registrations are paused</p>}
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-gray-600">
          Representing an HMO, insurer or employer?{' '}
          <Link href={onboardingPathFor('partner')} className="font-semibold text-teal-700 hover:underline">
            Apply for partner access
          </Link>
        </p>
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
