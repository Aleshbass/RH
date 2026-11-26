'use client';

/**
 * Physiotherapist application: four short steps, only what Rehabify needs to verify someone.
 *
 *   1. How you'll work  country (Nigeria by default), then Rehabify physio or independent physio
 *                       (lib/practiceModes.ts); outside Nigeria it's independent only (lib/practiceCountries.ts)
 *   2. About you        name and phone
 *   3. Your licence     board (the country's own), licence number and expiry, experience, ID and the licence
 *                       document itself: required (MRTB in Nigeria, the country's board elsewhere; owner, 26 Nov
 *                       2026). A degree certificate is optional and no longer stands in for the licence.
 *   4. Your practice    where you work, what you treat, terms; then submit for review
 *
 * Both kinds of physio go through the same licence check and approval.
 *
 * Everything else (photo and bio, working hours, prices, payout account, other documents) is
 * finished from the dashboard, before or after approval. Patients can only book once that's done
 * (convex/physioSetup.ts). Answers are saved after each step, so leaving and coming back resumes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, Loader2 } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SpecialisationPicker } from '@/components/physio/SettingsUI';
import {
    DocumentRow,
    usePhysioDocumentUpload,
    usePhysioDocuments,
    type PhysioDocumentType,
} from '@/components/physio/PhysioDocuments';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { choiceOf, PRACTICE_CHOICES, type PracticeChoice, type PracticeMode } from '@/lib/practiceModes';
import { PROFESSIONAL_SIGNUP_POLICIES, policyVersions } from '@/lib/policies';
import {
    countryCodeFromName,
    DEFAULT_COUNTRY_CODE,
    hasRehabifyCare,
    internationalPhone,
    localPhone,
    OTHER_COUNTRY,
    practiceCountry,
    signupTimeZone,
} from '@/lib/practiceCountries';
import { CountryFlag, CountryPicker } from '@/components/onboarding/common/CountryPicker';
import { cn } from '@/lib/utils';

const MapboxLocationPicker = dynamic(() => import('@/components/onboarding/physiotherapist/MapboxLocationPicker'), {
    ssr: false,
    loading: () => <div className="h-[340px] animate-pulse rounded-xl bg-neutral-100" />,
});

const STEPS = [
    { id: 'path', title: 'How you’ll work', subtitle: 'Where you practise, and whether you’re joining as a Rehabify physio or an independent physio.' },
    { id: 'about', title: 'About you', subtitle: 'So patients and our team know who you are.' },
    { id: 'licence', title: 'Your licence', subtitle: 'We verify every physiotherapist before they can see patients.' },
    { id: 'practice', title: 'Your practice', subtitle: 'Where you work and what you treat.' },
] as const;

const REFERRAL_OPTIONS = ['A colleague', 'Instagram', 'LinkedIn', 'X (Twitter)', 'Google search', 'An event or conference', 'Other'];
// The licence is stored as "mrtbLicense" whatever the country; only its label changes
// Licence uploads from the older application form still count as proof
const LEGACY_LICENCE_PROOFS: PhysioDocumentType[] = ['licenseDocument', 'practicingLicense'];

const primary = 'bg-rh-lime font-semibold text-rh-ink hover:bg-rh-lime-deep';
const labelClass = 'text-sm font-medium text-neutral-700';
const hintClass = 'mt-1 text-xs text-neutral-500';
const errorClass = 'mt-1 text-xs text-red-600';

type Draft = {
    role: string | null;
    onboarded: boolean;
    approvalStatus: 'pending_review' | 'approved' | 'declined' | null;
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    profileId: string | null;
    practiceMode: PracticeMode | null;
    country: string;
    gender: string | null;
    licenseNumber: string;
    certificationBoard: string;
    licenseExpiryDate: string;
    yearsOfExperience: number | null;
    location: string;
    latitude: number | null;
    longitude: number | null;
    specializations: string[];
    referralSource: string;
    uploadedDocumentTypes: string[];
};

// A plain reference: the generated `api` type is at TypeScript's depth limit (TS2589)
const getMyOnboardingDraftRef = makeFunctionReference<'query', Record<string, never>, Draft | null>(
    'physioSetup:getMyOnboardingDraft'
);

type RegistryProfile = {
    fullName?: string;
    phone?: string;
    licenseNumber?: string;
    yearsOfExperience?: number;
    practiceAddress?: string;
    specialties?: string[];
    licenseExpiryDate?: string;
    regulatoryBody?: string;
    bio?: string;
};

function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Drop undefined/empty values so a partial save never clears a stored field. */
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ) as Partial<T>;
}

function errorMessage(error: unknown, fallback: string) {
    const message = (error as { data?: unknown; message?: string })?.data ?? (error as Error)?.message;
    if (typeof message === 'string' && message && !message.includes('Server Error')) {
        return message.replace(/^.*Uncaught (Convex)?Error:\s*/, '').split('\n')[0];
    }
    return fallback;
}

function Field({
    id,
    label,
    hint,
    error,
    children,
}: {
    id?: string;
    label: string;
    hint?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <Label htmlFor={id} className={labelClass}>
                {label}
            </Label>
            <div className="mt-1.5">{children}</div>
            {error ? <p className={errorClass}>{error}</p> : hint ? <p className={hintClass}>{hint}</p> : null}
        </div>
    );
}

/** Step 1: Rehabify physio, independent physio, or both. */
function PracticeModeChoice({
    value,
    onChange,
    error,
    rehabifyAvailable,
    countryName,
}: {
    value: PracticeChoice | null;
    onChange: (mode: PracticeChoice) => void;
    error?: string;
    /** Rehabify Care patients are only in Nigeria for now */
    rehabifyAvailable: boolean;
    countryName: string;
}) {
    return (
        <div>
            <p className="mb-3 text-sm text-neutral-600">
                {rehabifyAvailable
                    ? 'Choose how you’ll work. You can change it later.'
                    : `Rehabify Care patients are only in Nigeria for now, so physios in ${countryName || 'your country'} join as independent physios.`}
            </p>
            <div role="radiogroup" aria-label="How you’ll work with Rehabify" className="grid gap-3">
                {PRACTICE_CHOICES.map((mode) => {
                    const selected = value === mode.id;
                    // Rehabify physio (alone or with own patients) needs Rehabify Care, which is Nigeria only
                    const unavailable = mode.id !== 'independent' && !rehabifyAvailable;
                    return (
                        <button
                            key={mode.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={unavailable}
                            onClick={() => onChange(mode.id)}
                            className={cn(
                                'flex w-full items-start gap-4 rounded-2xl border-2 bg-white p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2',
                                selected ? 'border-rh-ink' : 'border-neutral-200 hover:border-neutral-400',
                                unavailable && 'cursor-not-allowed opacity-50 hover:border-neutral-200'
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                    selected ? 'border-rh-ink' : 'border-neutral-300'
                                )}
                            >
                                {selected && <span className="h-2.5 w-2.5 rounded-full bg-rh-ink" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-base font-semibold text-neutral-900">{mode.title}</span>
                                <span className="mt-1 block text-sm leading-relaxed text-neutral-600">{mode.summary}</span>
                                <span className="mt-3 block space-y-1.5">
                                    {mode.points.map((point) => (
                                        <span key={point} className="flex gap-2 text-sm text-neutral-700">
                                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rh-ink" />
                                            {point}
                                        </span>
                                    ))}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
            {error && <p className={errorClass}>{error}</p>}
            <p className="mt-4 text-xs leading-relaxed text-neutral-500">
                Everyone goes through the same licence check, and you can change this later in Settings. Work at a clinic? Ask
                your clinic to invite you instead.
            </p>
        </div>
    );
}

function SignInFirst() {
    return (
        <div className="mx-auto w-full max-w-md px-4 py-10 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Join Rehabify</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Join as a Rehabify physio or an independent physio. Create your account, then apply in four
                short steps. It takes about five minutes. Have your licence number and a photo of your ID ready.
            </p>
            <div className="mt-6 flex flex-col gap-2">
                <Button asChild className={cn('h-11', primary)}>
                    <Link href="/sign-up?redirect=/physiotherapist">Create account</Link>
                </Button>
                <Button asChild variant="ghost" className="h-11 text-neutral-600">
                    <Link href="/sign-in?redirect_url=/physiotherapist">I already have an account</Link>
                </Button>
            </div>
        </div>
    );
}

/** This browser's time zone, used outside Nigeria where a country has several (US, Canada...). */
function browserTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return undefined;
    }
}

function Submitted({ practiceMode, outsideNigeria }: { practiceMode: PracticeMode; outsideNigeria?: boolean }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-md px-4 py-10 text-center"
        >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rh-lime text-rh-ink">
                <Check className="h-6 w-6" strokeWidth={2.5} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-neutral-900">Application sent</h1>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                We&apos;ll check your licence and ID, usually within 1–2 business days, and email you when you&apos;re
                approved.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                {practiceMode === 'independent'
                    ? outsideNigeria
                        ? 'While you wait, add your photo. Once you’re approved, you can invite your patients.'
                        : 'While you wait, add your photo and payout account. Once you’re approved, you can invite your patients.'
                    : 'While you wait, finish setting up your profile, hours and payout account so you can start seeing patients the day you’re approved.'}
            </p>
            <Button asChild className={cn('mt-6 h-11 w-full', primary)}>
                <Link href="/dashboard/physiotherapist">Finish setting up</Link>
            </Button>
        </motion.div>
    );
}

export default function PhysiotherapistOnboardingWizard() {
    const router = useRouter();
    const { isLoaded: authLoaded, isSignedIn } = useAuth();
    const draft = useQuery(getMyOnboardingDraftRef, isSignedIn ? {} : 'skip');
    const completeUserProfile = useMutation(api.users.completeUserProfile);
    const updatePhysioProfile = useMutation(api.users.updatePhysiotherapistProfile);
    const resetOnboardingStore = useOnboardingStore((state) => state.resetOnboarding);
    const { upload } = usePhysioDocumentUpload();
    const documents = usePhysioDocuments(
        draft === undefined ? undefined : ((draft?.profileId as never) ?? null)
    );

    const [step, setStep] = useState(0);
    const [direction, setDirection] = useState(1);
    const [saving, setSaving] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const initialised = useRef(false);

    // Answers
    const [practiceMode, setPracticeMode] = useState<PracticeChoice | null>(null);
    const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
    const [otherCountry, setOtherCountry] = useState(''); // typed when the country isn't listed
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [gender, setGender] = useState('');
    // Licensed by a board other than their country's own (or the country has no single board)
    const [useOtherBoard, setUseOtherBoard] = useState(false);
    const [otherBoard, setOtherBoard] = useState('');
    const [licenseNumber, setLicenseNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [years, setYears] = useState('');
    const [location, setLocation] = useState({ location: '', latitude: undefined as number | undefined, longitude: undefined as number | undefined });
    const [specializations, setSpecializations] = useState<string[]>([]);
    const [referralSource, setReferralSource] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [registryBio, setRegistryBio] = useState('');
    // Applied before (possibly months ago): their saved answers are shown for review
    const [returning, setReturning] = useState(false);

    // Someone who came from the public Physio Register: prefill from their listing
    const [registrySlug, setRegistrySlug] = useState<string | null>(null);
    useEffect(() => {
        try {
            setRegistrySlug(localStorage.getItem('physioOnboardingRegistrySlug'));
            // Left behind by the older application form, which kept answers in the browser
            localStorage.removeItem('physioOnboardingData');
        } catch {
            // Storage blocked: no prefill
        }
    }, []);
    const registry = useQuery(api.physioRegistry.getPublicProfile, registrySlug ? { slug: registrySlug } : 'skip') as
        | RegistryProfile
        | null
        | undefined;

    // Already approved or under review: the dashboard is the right place
    useEffect(() => {
        if (submitted || !draft || !draft.onboarded) return;
        if (draft.role === 'physiotherapist') {
            // Declined applicants come back to resubmit; anyone without a review request yet
            // (older accounts) finishes the application here
            if (draft.approvalStatus === 'pending_review' || draft.approvalStatus === 'approved') {
                router.replace('/dashboard/physiotherapist');
            }
        } else if (draft.role) {
            // Already onboarded as someone else (e.g. a patient)
            router.replace('/dashboard');
        }
    }, [draft, router, submitted]);

    // Fill the form once from what's saved (and the register listing), then jump to the first unfinished step
    useEffect(() => {
        if (initialised.current || !draft || (registrySlug && registry === undefined)) return;
        initialised.current = true;
        const r = registry ?? undefined;
        const [regFirst, ...regRest] = (r?.fullName ?? '').split(' ');

        const first = draft.firstName || regFirst || '';
        const last = draft.lastName || regRest.join(' ') || '';
        const phoneValue = draft.phoneNumber || r?.phone || '';
        const boardValue = draft.certificationBoard || r?.regulatoryBody || '';
        const licence = draft.licenseNumber || r?.licenseNumber || '';
        // A licence date that has since passed is left blank for them to update
        const savedExpiry = draft.licenseExpiryDate || r?.licenseExpiryDate || '';
        const expiryValue = savedExpiry >= todayIso() ? savedExpiry : '';

        // Applications from before countries were asked are Nigerian
        const code = countryCodeFromName(draft.country);
        const savedCountry = practiceCountry(code);
        setCountryCode(code);
        if (code === OTHER_COUNTRY) setOtherCountry(draft.country);
        setPracticeMode(hasRehabifyCare(code) ? choiceOf(draft.practiceMode) : 'independent');
        setFirstName(first);
        setLastName(last);
        setPhone(localPhone(code, phoneValue));
        setGender(draft.gender ?? '');
        const isCountryBoard =
            savedCountry.board &&
            (boardValue === savedCountry.board || Boolean(savedCountry.boardMatch?.test(boardValue)));
        if (boardValue && !isCountryBoard) {
            setUseOtherBoard(true);
            setOtherBoard(boardValue);
        }
        setLicenseNumber(licence);
        setExpiry(expiryValue);
        const yearsValue = draft.yearsOfExperience ?? r?.yearsOfExperience;
        setYears(yearsValue !== undefined && yearsValue !== null ? String(yearsValue) : '');
        setLocation({
            location: draft.location || r?.practiceAddress || '',
            latitude: draft.latitude ?? undefined,
            longitude: draft.longitude ?? undefined,
        });
        setSpecializations(draft.specializations.length ? draft.specializations : r?.specialties ?? []);
        setReferralSource(draft.referralSource);
        setRegistryBio(r?.bio ?? '');
        // The licence itself (a degree certificate no longer stands in for it)
        const hasProof = draft.uploadedDocumentTypes.some(
            (t) => t === 'mrtbLicense' || LEGACY_LICENCE_PROOFS.includes(t as PhysioDocumentType)
        );
        const aboutDone = Boolean(draft.profileId && draft.firstName && draft.lastName && draft.phoneNumber);
        const licenceDone =
            aboutDone && Boolean(draft.licenseNumber && expiryValue) && draft.uploadedDocumentTypes.includes('nationalId') && hasProof;
        // Rehabify or independent is asked first, even of returning applicants who never answered it
        setStep(!draft.practiceMode ? 0 : licenceDone ? 3 : aboutDone ? 2 : 1);
        setReturning(Boolean(draft.profileId) && draft.approvalStatus !== 'declined');
    }, [draft, registry, registrySlug]);

    const uploaded = useMemo(() => new Set((documents ?? []).map((doc) => doc.documentType)), [documents]);
    const legacyProofOnFile = !uploaded.has('mrtbLicense') && LEGACY_LICENCE_PROOFS.some((t) => uploaded.has(t));
    const country = practiceCountry(countryCode);
    const countryName = countryCode === OTHER_COUNTRY ? otherCountry.trim() : country.name;
    const rehabifyAvailable = hasRehabifyCare(countryCode);
    const boardIsTyped = useOtherBoard || !country.board;
    const boardName = boardIsTyped ? otherBoard.trim() : (country.board ?? '');
    // Lagos time in Nigeria (not saved); elsewhere the country's zone, or this browser's where it has several
    const practiceTimeZone = rehabifyAvailable ? undefined : signupTimeZone(countryCode, browserTimeZone());

    if (!authLoaded) return <WizardSkeleton />;
    if (!isSignedIn) return <SignInFirst />;
    if (submitted) return <Submitted practiceMode={practiceMode ?? 'network'} outsideNigeria={countryCode !== DEFAULT_COUNTRY_CODE} />;
    if (draft === undefined || draft === null || !initialised.current) {
        return <WizardSkeleton message={draft === null ? 'Setting up your account…' : undefined} />;
    }

    const go = (next: number) => {
        setDirection(next > step ? 1 : -1);
        setErrors({});
        setStep(next);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const changeCountry = (code: string) => {
        setCountryCode(code);
        // The new country's own board is picked again (anything typed is kept for "Another board")
        setUseOtherBoard(false);
        if (!hasRehabifyCare(code)) setPracticeMode('independent');
        setErrors((prev) => {
            const nextErrors = { ...prev };
            delete nextErrors.country;
            delete nextErrors.practiceMode;
            return nextErrors;
        });
    };

    const validate = (): Record<string, string> => {
        const e: Record<string, string> = {};
        if (step === 0) {
            if (countryCode === OTHER_COUNTRY && otherCountry.trim().length < 2) e.country = 'Enter the country you practise in';
            if (!practiceMode) e.practiceMode = 'Choose Rehabify physio or independent physio';
        }
        if (step === 1) {
            if (!firstName.trim()) e.firstName = 'Enter your first name';
            if (!lastName.trim()) e.lastName = 'Enter your last name';
            // Nigerian numbers are typed with the leading 0; elsewhere after the dialling code
            const minDigits = countryCode === DEFAULT_COUNTRY_CODE ? 10 : 7;
            if (phone.replace(/\D/g, '').length < minDigits) e.phone = 'Enter a phone number we can reach you on';
        }
        if (step === 2) {
            if (boardIsTyped && otherBoard.trim().length < 2) e.board = 'Enter the board that issued your licence';
            if (!licenseNumber.trim()) e.licenseNumber = 'Enter your licence number';
            if (!expiry) e.expiry = 'Enter the date your licence expires';
            else if (expiry < todayIso()) e.expiry = 'This licence has expired. Renew it, then apply with the new one.';
            const y = Number(years);
            if (years.trim() === '' || !Number.isFinite(y) || y < 0 || y > 60) e.years = 'Enter your years of experience';
            if (!uploaded.has('nationalId')) e.nationalId = 'Upload a photo or scan of your ID';
            if (!uploaded.has('mrtbLicense') && !legacyProofOnFile) {
                // "AHPC licence" keeps its capitals; "Licence" and "State licence" read as plain words
                const licence = /^[A-Z]{2,}/.test(country.licenceLabel) ? country.licenceLabel : country.licenceLabel.toLowerCase();
                e.proof = `Upload your ${licence}. It's required to apply.`;
            }
        }
        if (step === 3) {
            if (location.location.trim().length < 2) e.location = 'Search for your practice address or drop a pin';
            if (specializations.length === 0) e.specializations = 'Choose at least one';
            if (!termsAccepted) e.terms = 'Please accept the terms to continue';
        }
        return e;
    };

    const next = async () => {
        if (step === STEPS.length - 1 && !practiceMode) {
            toast.error('Choose how you’ll work with Rehabify first');
            go(0);
            return;
        }
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) {
            toast.error(Object.values(e)[0]);
            return;
        }

        setSaving(true);
        try {
            if (step === 0) {
                // Saved now if the profile exists (a returning applicant); otherwise with the next step
                if (draft.profileId && practiceMode) {
                    await completeUserProfile({
                        role: 'physiotherapist',
                        profileData: { practiceMode, country: countryName, timeZone: practiceTimeZone } as never,
                        finalStep: false,
                    });
                }
                go(1);
            } else if (step === 1) {
                // Creates the physiotherapist profile on first save, so documents can be uploaded next
                await completeUserProfile({
                    role: 'physiotherapist',
                    profileData: compact({
                        gender: gender || undefined,
                        practiceMode: practiceMode ?? undefined,
                        country: countryName,
                        timeZone: practiceTimeZone,
                    }) as never,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    finalStep: false,
                });
                await updatePhysioProfile({ phoneNumber: internationalPhone(countryCode, phone) });
                go(2);
            } else if (step === 2) {
                await completeUserProfile({
                    role: 'physiotherapist',
                    profileData: compact({
                        certificationBoard: boardName,
                        licenseNumber: licenseNumber.trim(),
                        licenseExpiryDate: expiry,
                        yearsOfExperience: Number(years),
                    }) as never,
                    finalStep: false,
                });
                go(3);
            } else {
                await completeUserProfile({
                    role: 'physiotherapist',
                    profileData: compact({
                        location: location.location.trim(),
                        latitude: location.latitude,
                        longitude: location.longitude,
                        specializations,
                        referralSource: referralSource || undefined,
                        // Someone coming from the Physio Register keeps the bio they wrote there
                        bio: registryBio || undefined,
                        termsAcceptedAt: termsAccepted ? Date.now() : undefined,
                        practiceMode: practiceMode ?? undefined,
                        country: countryName,
                        timeZone: practiceTimeZone,
                    }) as never,
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    finalStep: true,
                    // The ticked Terms and Privacy Policy, recorded append-only (channel "web")
                    acceptedPolicies: termsAccepted ? policyVersions(PROFESSIONAL_SIGNUP_POLICIES) : undefined,
                });
                try {
                    localStorage.removeItem('physioOnboardingData');
                    localStorage.removeItem('physioOnboardingRegistrySlug');
                } catch {
                    // Nothing to clean up
                }
                resetOnboardingStore();
                setSubmitted(true);
                window.scrollTo({ top: 0 });
            }
        } catch (error) {
            toast.error(errorMessage(error, 'Something went wrong saving your answers. Try again.'));
        } finally {
            setSaving(false);
        }
    };

    const uploadDoc = (type: PhysioDocumentType) => async (file: File) => {
        if (!draft.profileId) throw new Error('Save your details first.');
        await upload(
            draft.profileId as never,
            type,
            file,
            (documents ?? []).filter((doc) => doc.documentType === type)
        );
        setErrors((prev) => {
            const nextErrors = { ...prev };
            delete nextErrors[type === 'nationalId' ? 'nationalId' : 'proof'];
            return nextErrors;
        });
    };

    const current = STEPS[step];

    return (
        <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
            {draft.approvalStatus === 'declined' && (
                <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                    Update anything our team flagged, then send your application again.
                </div>
            )}
            {returning && (
                <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                    Welcome back. We kept the answers you gave before. Check each step and update anything that has
                    changed, like your licence expiry date, then send your application.
                </div>
            )}

            {/* Progress */}
            <div className="mb-8">
                <div className="flex gap-1.5" aria-hidden="true">
                    {STEPS.map((s, i) => (
                        <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-200">
                            <motion.div
                                className="h-full bg-rh-ink"
                                initial={false}
                                animate={{ width: i <= step ? '100%' : '0%' }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                            />
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-xs font-medium text-neutral-500">
                    Step {step + 1} of {STEPS.length}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{current.title}</h1>
                <p className="mt-1 text-sm text-neutral-500">{current.subtitle}</p>
            </div>

            <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                    key={step}
                    custom={direction}
                    initial={{ opacity: 0, x: direction * 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -16 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="space-y-5"
                >
                    {step === 0 && (
                        <>
                            <Field id="country" label="Country you practise in" error={errors.country}>
                                <CountryPicker id="country" value={countryCode} onChange={changeCountry} />
                                {countryCode === OTHER_COUNTRY && (
                                    <Input
                                        className="mt-2 h-11"
                                        value={otherCountry}
                                        onChange={(e) => setOtherCountry(e.target.value)}
                                        placeholder="Your country"
                                        aria-label="Your country"
                                        autoComplete="country-name"
                                    />
                                )}
                            </Field>
                            <PracticeModeChoice
                                value={practiceMode}
                                onChange={setPracticeMode}
                                error={errors.practiceMode}
                                rehabifyAvailable={rehabifyAvailable}
                                countryName={countryName}
                            />
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field id="firstName" label="First name" error={errors.firstName}>
                                    <Input id="firstName" className="h-11" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                                </Field>
                                <Field id="lastName" label="Last name" error={errors.lastName}>
                                    <Input id="lastName" className="h-11" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                                </Field>
                            </div>
                            <Field id="email" label="Email" hint="From your account. Change it in your account settings.">
                                <Input id="email" className="h-11" value={draft.email} disabled />
                            </Field>
                            <Field id="phone" label="Phone" hint="For our team only, in case we need to reach you about your application." error={errors.phone}>
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center gap-2 text-sm text-neutral-600">
                                        <CountryFlag code={countryCode} />
                                        {country.dialCode}
                                    </span>
                                    <Input
                                        id="phone"
                                        className={cn('h-11', country.dialCode ? (country.dialCode.length > 3 ? 'pl-[5.5rem]' : 'pl-[4.75rem]') : 'pl-10')}
                                        type="tel"
                                        inputMode="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        autoComplete={countryCode === DEFAULT_COUNTRY_CODE || !country.dialCode ? 'tel' : 'tel-national'}
                                        placeholder={country.phonePlaceholder}
                                    />
                                </div>
                            </Field>
                            <Field label="Gender (optional)" hint="Some patients prefer a physio of a particular gender.">
                                <Select value={gender} onValueChange={setGender}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Choose" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="female">Female</SelectItem>
                                        <SelectItem value="male">Male</SelectItem>
                                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Field label="Licensing board" error={errors.board}>
                                {country.board && (
                                    <Select
                                        value={useOtherBoard ? 'other' : 'country'}
                                        onValueChange={(value) => setUseOtherBoard(value === 'other')}
                                    >
                                        <SelectTrigger className="h-11">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="country">{country.board}</SelectItem>
                                            <SelectItem value="other">Another board</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                                {boardIsTyped && (
                                    <Input
                                        className={cn('h-11', country.board && 'mt-2')}
                                        value={otherBoard}
                                        onChange={(e) => setOtherBoard(e.target.value)}
                                        placeholder={(!country.board && country.boardPlaceholder) || 'Name of the board'}
                                        aria-label="Name of the board"
                                    />
                                )}
                            </Field>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Field id="licenseNumber" label="Licence number" error={errors.licenseNumber}>
                                    <Input id="licenseNumber" className="h-11" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} autoCapitalize="characters" />
                                </Field>
                                <Field id="expiry" label="Expiry date" error={errors.expiry}>
                                    <Input id="expiry" className="h-11" type="date" value={expiry} min={todayIso()} onChange={(e) => setExpiry(e.target.value)} />
                                </Field>
                            </div>
                            <Field id="years" label="Years of experience" error={errors.years}>
                                <Input
                                    id="years"
                                    className="h-11 sm:w-40"
                                    inputMode="numeric"
                                    value={years}
                                    onChange={(e) => setYears(e.target.value.replace(/[^\d]/g, ''))}
                                    placeholder="5"
                                />
                            </Field>

                            <div className="rounded-xl border border-neutral-200">
                                <div className="border-b border-neutral-100 px-4 py-3">
                                    <p className="text-sm font-semibold text-neutral-900">Documents</p>
                                    <p className="text-xs text-neutral-500">PDF, JPG or PNG up to 10 MB. Only our verification team sees these.</p>
                                </div>
                                <div className="divide-y divide-neutral-100 px-4">
                                    <div>
                                        <DocumentRow
                                            type="nationalId"
                                            required
                                            documents={documents ?? []}
                                            onUpload={uploadDoc('nationalId')}
                                            hint={country.idHint}
                                        />
                                        {errors.nationalId && <p className={cn(errorClass, '-mt-1 pb-2')}>{errors.nationalId}</p>}
                                    </div>
                                    <div>
                                        {/* The licence itself is required: MRTB in Nigeria, the country's own board elsewhere */}
                                        <DocumentRow
                                            type="mrtbLicense"
                                            required
                                            documents={documents ?? []}
                                            onUpload={uploadDoc('mrtbLicense')}
                                            title={country.licenceLabel}
                                            hint={
                                                country.board
                                                    ? `Required. Your current licence or registration from the ${country.board.replace(/\s*\([^)]*\)$/, '')}`
                                                    : 'Required. Your current licence or registration to practise'
                                            }
                                        />
                                        {errors.proof && <p className={cn(errorClass, '-mt-1 pb-2')}>{errors.proof}</p>}
                                        {legacyProofOnFile && (
                                            <p className={cn(hintClass, 'pb-2')}>
                                                The licence you uploaded before is on file. Upload a newer one here if it has changed.
                                            </p>
                                        )}
                                    </div>
                                    {/* Optional: the verification team may ask for it later */}
                                    <DocumentRow
                                        type="degreeCertificate"
                                        documents={documents ?? []}
                                        onUpload={uploadDoc('degreeCertificate')}
                                        hint="Optional. You can add it later."
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Field
                                label="Practice address"
                                hint={
                                    practiceMode === 'independent'
                                        ? 'Where you see patients. For home visits, use the area you cover.'
                                        : 'Patients near you see you first. For home visits, use the area you cover.'
                                }
                                error={errors.location}
                            >
                                <MapboxLocationPicker
                                    countryCode={countryCode}
                                    center={country.center}
                                    value={location}
                                    onChange={(data) =>
                                        setLocation({ location: data.location, latitude: data.latitude, longitude: data.longitude })
                                    }
                                />
                            </Field>
                            <div>
                                <p className={labelClass}>What you treat</p>
                                <p className={cn(hintClass, 'mb-2')}>Choose all that apply.</p>
                                <SpecialisationPicker value={specializations} onChange={setSpecializations} />
                                {errors.specializations && <p className={errorClass}>{errors.specializations}</p>}
                            </div>
                            <Field label="How did you hear about us? (optional)">
                                <Select value={referralSource} onValueChange={setReferralSource}>
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Choose" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REFERRAL_OPTIONS.map((option) => (
                                            <SelectItem key={option} value={option}>
                                                {option}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 p-4">
                                <input
                                    type="checkbox"
                                    checked={termsAccepted}
                                    onChange={(e) => setTermsAccepted(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-rh-ink"
                                />
                                <span className="text-sm text-neutral-700">
                                    I agree to the{' '}
                                    <a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="font-medium text-rh-ink underline">
                                        Terms
                                    </a>{' '}
                                    and{' '}
                                    <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-medium text-rh-ink underline">
                                        Privacy Policy
                                    </a>
                                    , and confirm my licence details are true.
                                </span>
                            </label>
                            {errors.terms && <p className={cn(errorClass, '-mt-3')}>{errors.terms}</p>}
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-neutral-200 pt-5">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => go(step - 1)}
                    disabled={saving}
                    className={cn('text-neutral-600', step === 0 && 'invisible')}
                >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                </Button>
                <Button type="button" onClick={next} disabled={saving || (step === 3 && !termsAccepted)} className={cn('h-11 min-w-36', primary)}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {step === STEPS.length - 1 ? 'Submit application' : 'Continue'}
                </Button>
            </div>
            {step === STEPS.length - 1 && (
                <p className="mt-3 text-right text-xs text-neutral-500">
                    You&apos;ll add your photo, hours, prices and payout account from your dashboard.
                </p>
            )}
        </div>
    );
}

function WizardSkeleton({ message }: { message?: string }) {
    return (
        <div className="mx-auto w-full max-w-xl space-y-4 px-4 pt-4">
            <Skeleton className="h-1 w-full rounded-full" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="mt-6 h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            {message && <p className="pt-2 text-center text-sm text-neutral-500">{message}</p>}
        </div>
    );
}
