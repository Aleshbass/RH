'use client';

/**
 * Where every sign-in and sign-up without a fixed destination lands. It works out who the person
 * is and opens their onboarding without asking: the ?as= they picked, the role they already started
 * with, a partner organisation waiting for them, or the choice remembered from "Get started"
 * (browser, then Clerk sign-up metadata). Only someone we know nothing about sees the picker.
 */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { INTENT_ICONS } from '@/components/auth/GetStartedMenu';
import { useOnboardingStore, UserRole } from '@/stores/onboardingStore';
import { programError } from '@/components/exercise-programs/errors';
import { cn } from '@/lib/utils';
import {
  forgetIntent,
  onboardingPathFor,
  parseIntent,
  PRIMARY_INTENTS,
  readRememberedIntent,
  roleForIntent,
  SECONDARY_INTENTS,
  SIGNUP_INTENTS,
  type SignupIntent,
} from '@/lib/auth/signupIntent';
import { RehabifySplash } from '@/components/brand/RehabifyLoader';

type OnboardingRole = Exclude<UserRole, 'admin'>;

// A simple way to generate a unique ID for the onboarding session
const generateOnboardingId = () => `onboarding_${new Date().getTime()}_${Math.random().toString(36).substring(2, 10)}`;

const DASHBOARD_ROLES = new Set(['physiotherapist', 'clinic_owner', 'patient', 'family_member', 'doctor', 'admin', 'clinic_staff', 'blog_editor', 'learn_instructor']);

type AccountLike = { role?: string | null; patientProfileId?: unknown };

/** Where an account that already has a role, but hasn't finished setting up, carries on. */
function resumePathFor(user: AccountLike): string | null {
  switch (user.role) {
    case 'physiotherapist':
    case 'clinic_owner':
    case 'doctor':
    case 'partner':
      return onboardingPathFor(user.role);
    case 'patient':
      return user.patientProfileId ? '/dashboard/patient' : onboardingPathFor('patient');
    case 'family_member':
      return onboardingPathFor('family');
    case 'admin':
    case 'clinic_staff':
      return '/dashboard';
    default:
      return null;
  }
}

function RoleSelectionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user: clerkUser, isLoaded: clerkUserLoaded } = useUser();
  const { setRoleAndStep, setCurrentOnboardingId, setActualClinicId } = useOnboardingStore();
  const updateUserRole = useMutation(api.users.updateUserRole);
  const currentUser = useQuery(api.users.getMyUser);
  const partnerData = useQuery(api.partners.getCurrentUserPartner, isSignedIn ? {} : 'skip');
  // Admins can pause new registrations per role (/dashboard/admin/system); the server enforces it too
  const platform = useQuery(api.platformSettings.getPublicPlatformStatus);
  const isPaused = (role: OnboardingRole) => {
    if (!platform || currentUser?.role === role) return false;
    if (role === 'patient' || role === 'family_member') return !platform.allowPatientSignups;
    if (role === 'physiotherapist') return !platform.allowPhysioSignups;
    if (role === 'clinic_owner') return !platform.allowClinicSignups;
    if (role === 'doctor') return platform.allowDoctorSignups === false;
    return false;
  };

  // Chosen before sign-up ("Get started", the sign-up page, or ?role= on older links)
  const urlIntent = parseIntent(searchParams.get('as')) ?? parseIntent(searchParams.get('role'));
  const [remembered, setRemembered] = useState<SignupIntent | null | undefined>(undefined);
  useEffect(() => setRemembered(readRememberedIntent()), []);
  const signupMetadata = clerkUser?.unsafeMetadata?.signupIntent;
  const metadataIntent = parseIntent(typeof signupMetadata === 'string' ? signupMetadata : null);

  const [loadingIntent, setLoadingIntent] = useState<SignupIntent | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [suggested, setSuggested] = useState<SignupIntent | null>(null);
  const decidedRef = useRef(false);

  const handleSelect = async (intent: SignupIntent) => {
    if (intent === 'partner') {
      forgetIntent();
      router.push(onboardingPathFor('partner'));
      return;
    }
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
      setCurrentOnboardingId(generateOnboardingId()); // Store the unique ID for this onboarding attempt
      setActualClinicId(undefined); // Clear any previous clinic ID to prevent auth errors
      setRoleAndStep(role, 1); // Set role and start at step 1
      forgetIntent();

      // Navigate to the first step of the respective onboarding flow
      router.push(onboardingPathFor(intent));
    } catch (error) {
      console.error('Error updating user role:', error);
      import('sonner').then(({ toast }) => toast.error(programError(error, 'Failed to update role. Please try again.')));
      setLoadingIntent(null);
      setShowPicker(true);
    }
  };

  // They already said who they are: set it up without asking (a paused role shows the picker instead)
  const applyIntent = (intent: SignupIntent) => {
    const role = roleForIntent(intent);
    if (role && isPaused(role as OnboardingRole)) {
      setSuggested(intent);
      setShowPicker(true);
      return;
    }
    void handleSelect(intent);
  };

  useEffect(() => {
    if (decidedRef.current || !authLoaded) return;

    // Arriving signed out (an old link): sign up first, keeping the choice
    if (!isSignedIn) {
      decidedRef.current = true;
      router.replace(urlIntent ? `/sign-up?as=${urlIntent}` : '/sign-up');
      return;
    }

    // Wait for the account (created just after sign-up) and everything that decides where it goes
    if (!currentUser || platform === undefined || partnerData === undefined || remembered === undefined || !clerkUserLoaded) return;
    decidedRef.current = true;

    // A pending patient invitation comes first. Invites are only for new or patient accounts;
    // a staff account just drops the stale code
    const pendingInvite = localStorage.getItem('rehabify_pending_invite');
    if (pendingInvite && currentUser.role && currentUser.role !== 'patient') {
      localStorage.removeItem('rehabify_pending_invite');
    } else if (pendingInvite) {
      router.replace(`/patient-invite/${pendingInvite}`);
      return;
    }

    // A finished account never picks again; the dashboard routes it by role (and checks approval)
    if (currentUser.onboarded && currentUser.role) {
      const done =
        currentUser.role === 'partner' ? '/partners/portal' : DASHBOARD_ROLES.has(currentUser.role) ? '/dashboard' : resumePathFor(currentUser);
      if (done) {
        router.replace(done);
        return;
      }
    }

    if (urlIntent) {
      applyIntent(urlIntent);
      return;
    }

    // Started setting up as someone already: carry on there
    const resume = currentUser.role ? resumePathFor(currentUser) : null;
    if (resume) {
      router.replace(resume);
      return;
    }

    // An organisation is waiting for them (created by our team, or applied for already)
    if (partnerData?.partner) {
      router.replace(onboardingPathFor('partner'));
      return;
    }

    const known = remembered ?? metadataIntent;
    if (known) applyIntent(known);
    else setShowPicker(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decides once, when everything has loaded
  }, [authLoaded, isSignedIn, currentUser, platform, partnerData, remembered, clerkUserLoaded, metadataIntent, urlIntent, router]);

  if (!showPicker || loadingIntent) {
    const settingUp = loadingIntent ? SIGNUP_INTENTS[loadingIntent].chip.toLowerCase() : null;
    return (
      <RehabifySplash className="bg-rh-canvas" message={settingUp ? `Setting up your ${settingUp} account…` : 'Setting up your account…'} />
    );
  }

  const row = (intent: SignupIntent, compact: boolean) => {
    const Icon = INTENT_ICONS[intent];
    const details = SIGNUP_INTENTS[intent];
    const role = roleForIntent(intent);
    const paused = role ? isPaused(role as OnboardingRole) : false;
    return (
      <button
        key={intent}
        type="button"
        onClick={() => void handleSelect(intent)}
        disabled={paused}
        className={cn(
          'group flex w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-rh-canvas focus-visible:bg-rh-canvas focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent',
          compact ? 'py-2' : 'py-3',
          suggested === intent && 'bg-rh-canvas ring-1 ring-inset ring-rh-ink/10'
        )}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-lg bg-rh-canvas text-rh-ink transition-colors group-hover:bg-rh-lime',
            compact ? 'h-8 w-8' : 'h-10 w-10'
          )}
        >
          <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block font-semibold text-rh-ink', compact ? 'text-sm' : 'text-[15px]')}>{details.menuLabel}</span>
          {!compact && <span className="mt-0.5 block text-[13px] text-rh-ink/55">{details.description}</span>}
          {paused && <span className="mt-0.5 block text-xs font-medium text-amber-700">New registrations are paused</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-rh-canvas px-4 pb-10 pt-28">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-rh-ink sm:text-3xl">Who are you joining as?</h1>
        <p className="mt-2 text-center text-sm text-rh-ink/60">We&apos;ll open the right setup for you.</p>
        <div className="mt-6 rounded-3xl bg-white p-2 shadow-soft">
          <div className="space-y-1">{PRIMARY_INTENTS.map((intent) => row(intent, false))}</div>
          <div className="mx-3 my-2 h-px bg-rh-ink/[0.06]" role="separator" />
          <div className="space-y-0.5">{SECONDARY_INTENTS.map((intent) => row(intent, true))}</div>
        </div>
        <p className="mt-6 text-center text-xs text-rh-ink/50">
          Need help? <Link href="/contact" className="font-semibold text-rh-ink underline-offset-4 hover:underline">Contact us</Link>
        </p>
      </div>
    </div>
  );
}

export default function RoleSelectionPage() {
  return (
    <React.Suspense
      fallback={
        <RehabifySplash className="bg-rh-canvas" />
      }
    >
      <RoleSelectionContent />
    </React.Suspense>
  );
}
