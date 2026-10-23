'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Loader2, Twitter, Instagram, Linkedin, Globe, Users, Search as SearchIcon, Eye } from '@/components/icons';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { api } from '@/convex/_generated/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/ui/file-upload';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import MapboxAddressInput, { type MapboxPlace } from '@/components/physio-register/MapboxAddressInput';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { AvailabilityScheduler, type OperatingHours } from '@/components/onboarding/common/AvailabilityScheduler';
import { useFileUpload } from '@/lib/hooks/useFileUpload';

// --- Schema ---

const formSchema = z.object({
    // About you
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().optional(), // shown from the account, not edited here
    phoneNumber: z.string().min(10, "Please enter a valid phone number"),
    isOwner: z.boolean(),
    positionIfNotOwner: z.string().optional(),

    // Your clinic
    clinicName: z.string().min(2, "Clinic name must be at least 2 characters"),
    registrationNumber: z.string().optional(),
    clinicEmail: z.string().email("Please enter a valid clinic email address"),
    clinicPhone: z.string().min(10, "Please enter a valid clinic phone number"),
    website: z.string().optional(),

    // Location
    clinicLocation: z.string().optional(), // the result picked in the address search
    address: z.string().min(5, "Please enter the street address"),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),

    // Opening hours
    operatingHours: z.any(),
    additionalNotes: z.string().optional(),

    // Review & submit
    referralSource: z.string().min(1, "Please tell us how you heard about us"),
    acceptTerms: z.boolean().refine(val => val === true, {
        message: "You must accept the terms and conditions"
    }),
}).refine(data => data.isOwner || !!data.positionIfNotOwner?.trim(), {
    message: "Position is required if you are not the owner.",
    path: ["positionIfNotOwner"],
});

type FormValues = z.infer<typeof formSchema>;

/** A readable message from a Convex error (ConvexError data, or the text after Convex's prefix). */
function errorMessage(error: unknown, fallback: string) {
    if (error instanceof ConvexError) {
        return typeof error.data === 'string' ? error.data : fallback;
    }
    if (error instanceof Error && error.message) {
        const cleaned = error.message.replace(/^[\s\S]*Uncaught (?:Convex)?Error:\s*/, '').split('\n')[0].trim();
        return cleaned && cleaned !== 'Server Error' && !cleaned.startsWith('[CONVEX') ? cleaned : fallback;
    }
    return fallback;
}

// --- Steps Configuration ---

const steps = [
    { id: 'about', title: 'About you' },
    { id: 'clinic', title: 'Your clinic' },
    { id: 'location', title: 'Location' },
    { id: 'hours', title: 'Opening hours' },
    { id: 'licence', title: 'Business licence' },
    { id: 'review', title: 'Review & submit' },
];

const LOCATION_STEP = 2;
const HOURS_STEP = 3;
const DOCUMENTS_STEP = 4;
const REVIEW_STEP = 5;

const DRAFT_STORAGE_KEY = 'clinicOwnerOnboardingData';
const DRAFT_VERSION = 2;
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Drafts saved by the old 9-step wizard: the step each old step now belongs to
const LEGACY_STEP_MAP = [0, 1, 1, 2, 3, 3, 3, 4, 5];

const HAS_MAPBOX = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

// Form fields validated on each step (the licence step is checked separately)
const stepFields: (keyof FormValues)[][] = [
    ['firstName', 'lastName', 'phoneNumber', 'isOwner', 'positionIfNotOwner'],
    ['clinicName', 'registrationNumber', 'clinicEmail', 'clinicPhone', 'website'],
    ['address', 'city', 'state'],
    ['operatingHours', 'additionalNotes'],
    [],
    ['referralSource', 'acceptTerms'],
];

// Form fields brought back from a saved draft
const restoredFields: (keyof FormValues)[] = [
    'firstName', 'lastName', 'email', 'phoneNumber', 'isOwner', 'positionIfNotOwner',
    'clinicName', 'registrationNumber', 'clinicEmail', 'clinicPhone', 'website',
    'clinicLocation', 'address', 'city', 'state',
    'operatingHours', 'additionalNotes', 'referralSource', 'acceptTerms',
];

const clean = (value?: string) => value?.trim() || undefined;

// What the clinic record stores from the wizard; sent on every save so edits are never lost.
// Services, facilities and photos are added later in Clinic settings.
function buildClinicDetails(values: FormValues) {
    return {
        name: values.clinicName.trim(),
        address: clean(values.address),
        city: clean(values.city),
        state: clean(values.state),
        contactEmail: clean(values.clinicEmail),
        contactPhone: clean(values.clinicPhone),
        website: clean(values.website),
        registrationNumber: clean(values.registrationNumber),
        workingHours: values.operatingHours ?? undefined,
        additionalNotes: clean(values.additionalNotes),
    };
}

/** The clinic's one-line location: the picked search result, or the typed address. */
function locationLabel(values: FormValues) {
    return clean(values.clinicLocation)
        ?? clean([values.address, values.city, values.state].map(clean).filter(Boolean).join(', '));
}

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** e.g. "Mon–Fri 09:00–17:00; Sat 10:00–14:00" */
function summarizeHours(hours: OperatingHours | undefined) {
    const groups: { from: number; to: number; times: string }[] = [];
    DAY_KEYS.forEach((day, i) => {
        const schedule = hours?.[day];
        if (!schedule?.isOpen || !schedule.slots?.length) return;
        const times = schedule.slots.map(s => `${s.start}–${s.end}`).join(', ');
        const last = groups[groups.length - 1];
        if (last && last.to === i - 1 && last.times === times) {
            last.to = i;
        } else {
            groups.push({ from: i, to: i, times });
        }
    });
    if (!groups.length) return 'Closed every day';
    return groups
        .map(g => `${DAY_SHORT[g.from]}${g.to > g.from ? `–${DAY_SHORT[g.to]}` : ''} ${g.times}`)
        .join('; ');
}

export default function ClinicOwnerOnboardingWizard() {
    const router = useRouter();
    const { data, updateClinicOwnerData, setActualClinicId, completeOnboarding } = useOnboardingStore();
    const { clinicOwnerData, actualClinicId } = data;
    const currentUser = useQuery(api.users.getMyUser);
    const { isSignedIn } = useUser();

    const createClinicMutation = useMutation(api.clinics.createClinic);
    const completeUserProfileMutation = useMutation(api.users.completeUserProfile);
    const saveClinicDocument = useMutation(api.files.saveClinicDocument);
    const { uploadFile } = useFileUpload();

    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [isFinishing, setIsFinishing] = useState(false);
    const [otherReferralChosen, setOtherReferralChosen] = useState(false);
    const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
    const [isSkipping, setIsSkipping] = useState(false);
    const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);

    // Business licence files live only in memory. Files already saved are skipped if submit is retried.
    const [businessLicense, setBusinessLicense] = useState<File[]>([]);
    const savedLicenceFiles = useRef(new WeakSet<File>());

    const { control, register, trigger, watch, setValue, getValues, formState: { errors, isSubmitting } } = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        mode: 'onChange',
        defaultValues: {
            firstName: clinicOwnerData.firstName || '',
            lastName: clinicOwnerData.lastName || '',
            email: clinicOwnerData.email || '',
            phoneNumber: clinicOwnerData.phoneNumber || '',
            isOwner: clinicOwnerData.isOwner ?? true,
            positionIfNotOwner: clinicOwnerData.positionIfNotOwner || '',

            clinicName: clinicOwnerData.clinicName || '',
            registrationNumber: clinicOwnerData.registrationNumber || '',
            clinicEmail: clinicOwnerData.clinicEmail || '',
            clinicPhone: clinicOwnerData.clinicPhone || '',
            website: clinicOwnerData.website || '',

            clinicLocation: clinicOwnerData.clinicLocation || '',
            address: clinicOwnerData.address || '',
            city: clinicOwnerData.city || '',
            state: clinicOwnerData.state || '',

            operatingHours: clinicOwnerData.operatingHours || {
                monday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                tuesday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                wednesday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                thursday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                friday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                saturday: { isOpen: false, slots: [{ start: '09:00', end: '17:00' }] },
                sunday: { isOpen: false, slots: [{ start: '09:00', end: '17:00' }] },
            },
            additionalNotes: clinicOwnerData.additionalNotes || '',

            referralSource: clinicOwnerData.referralSource || '',
            acceptTerms: clinicOwnerData.acceptTerms || false,
        }
    });

    // Pre-fill user data
    useEffect(() => {
        if (currentUser && !clinicOwnerData.firstName) {
            setValue('firstName', currentUser.firstName || '');
            setValue('lastName', currentUser.lastName || '');
            setValue('email', currentUser.email || '');
        }
    }, [currentUser, setValue, clinicOwnerData.firstName]);

    // Persist progress after each step so a refresh or a skip can resume where the owner left off.
    // The licence files live only in memory and must be re-attached after a reload.
    const saveDraft = (step: number, extra: Record<string, unknown> = {}) => {
        try {
            localStorage.setItem(
                DRAFT_STORAGE_KEY,
                JSON.stringify({
                    formData: watch(),
                    currentStep: step,
                    version: DRAFT_VERSION,
                    actualClinicId,
                    timestamp: Date.now(),
                    ...extra,
                })
            );
        } catch { }
    };

    // Restore a saved draft
    useEffect(() => {
        if (!isSignedIn) return;

        try {
            const savedData = localStorage.getItem(DRAFT_STORAGE_KEY);
            if (savedData) {
                const parsed = JSON.parse(savedData);
                if (Date.now() - parsed.timestamp < DRAFT_MAX_AGE_MS) {
                    restoredFields.forEach(field => {
                        if (parsed.formData?.[field] !== undefined) {
                            setValue(field, parsed.formData[field]);
                        }
                    });

                    if (parsed.actualClinicId) {
                        setActualClinicId(parsed.actualClinicId);
                    }

                    // Resume on the step they reached (drafts from the older, longer wizard are mapped
                    // onto the new steps). The licence is not kept across reloads, so anyone who had
                    // passed that step goes back to re-attach it.
                    const savedStep = typeof parsed.currentStep === 'number' ? parsed.currentStep : 0;
                    const step = parsed.version === DRAFT_VERSION ? savedStep : (LEGACY_STEP_MAP[savedStep] ?? 0);
                    const resumeStep = Math.max(0, Math.min(step, DOCUMENTS_STEP));
                    setCurrentStep(resumeStep);
                    toast.success(
                        step > DOCUMENTS_STEP
                            ? 'Welcome back! Please re-attach your business licence to finish.'
                            : 'Welcome back! We restored your progress.'
                    );
                }
            }
        } catch { }
    }, [isSignedIn, setValue, setActualClinicId]);

    // Simulate loading for the opening hours step
    useEffect(() => {
        if (currentStep === HOURS_STEP) {
            setIsAvailabilityLoading(true);
            const timer = setTimeout(() => {
                setIsAvailabilityLoading(false);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [currentStep]);

    const hasRequiredDocuments = () => businessLicense.length > 0;

    // Fill the address fields from a picked search result. They stay editable afterwards.
    const handlePlacePicked = (place: MapboxPlace) => {
        const opts = { shouldValidate: true, shouldDirty: true } as const;
        setValue('clinicLocation', place.placeName, { shouldDirty: true });
        const line = [place.street, place.area].filter(Boolean).join(', ');
        // A street result replaces the address line; an area result only fills an empty one
        if (line && (place.street || !getValues('address')?.trim())) {
            setValue('address', line, opts);
        }
        if (place.city) setValue('city', place.city, opts);
        if (place.state) setValue('state', place.state, opts);
    };

    const goToStep = (step: number) => {
        setDirection(step > currentStep ? 1 : -1);
        setCurrentStep(step);
    };

    const nextStep = async () => {
        if (currentStep === DOCUMENTS_STEP) {
            if (!hasRequiredDocuments()) {
                toast.error("Please upload your business licence");
                return;
            }
        } else {
            const isStepValid = await trigger(stepFields[currentStep]);
            if (!isStepValid) return;
        }

        // Save the clinic record once the location is known. createClinic updates the owner's
        // existing clinic (including the placeholder made by "Skip"), so this never duplicates.
        if (currentStep === LOCATION_STEP && isSignedIn) {
            try {
                const result = await createClinicMutation(buildClinicDetails(watch()));
                if (result.success && result.clinicId) {
                    setActualClinicId(result.clinicId);
                } else {
                    toast.error("Failed to save clinic record");
                    return;
                }
            } catch (error) {
                console.error("Clinic save error:", error);
                toast.error(errorMessage(error, "Could not save your clinic. Please try again."));
                return;
            }
        }

        if (currentStep < steps.length - 1) {
            saveDraft(currentStep + 1);
            setDirection(1);
            setCurrentStep(prev => prev + 1);
        } else {
            await handleFinalSubmit();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setDirection(-1);
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleFinalSubmit = async () => {
        const formData = watch();

        // ── If not signed in, save form data and redirect to sign-up ──
        if (!isSignedIn) {
            saveDraft(currentStep);
            toast.info('Create your account to complete onboarding');
            router.push('/sign-up?redirect_url=/clinic-owner');
            return;
        }

        // Validate every step, not just this one: a restored draft may have gaps
        for (let step = 0; step < stepFields.length; step++) {
            if (step === DOCUMENTS_STEP) {
                if (!hasRequiredDocuments()) {
                    toast.error("Please upload your business licence");
                    goToStep(DOCUMENTS_STEP);
                    return;
                }
                continue;
            }
            const valid = await trigger(stepFields[step]);
            if (!valid) {
                toast.error(`Please complete the "${steps[step].title}" step`);
                goToStep(step);
                return;
            }
        }

        setIsFinishing(true);
        try {
            // 1. Save every clinic detail (creates the clinic, or updates the owner's existing one)
            const clinicResult = await createClinicMutation(buildClinicDetails(formData));
            if (!clinicResult.success || !clinicResult.clinicId) {
                throw new Error("Failed to save clinic record");
            }
            const clinicId = clinicResult.clinicId;
            setActualClinicId(clinicId);

            // 2. Upload the business licence. A failed upload stops the submission.
            for (const file of businessLicense) {
                if (savedLicenceFiles.current.has(file)) continue;
                const { storageId } = await uploadFile(file);
                await saveClinicDocument({ clinicId, storageId, documentType: "businessLicense", fileName: file.name });
                savedLicenceFiles.current.add(file);
            }

            // 3. Submit Profile Data
            await completeUserProfileMutation({
                role: "clinic_owner",
                profileData: {
                    referralSource: formData.referralSource,
                    gender: 'prefer_not_to_say', // Default or add to form if needed
                    clinicLocation: locationLabel(formData),
                },
                firstName: formData.firstName,
                lastName: formData.lastName,
                finalStep: true,
            });

            updateClinicOwnerData({
                ...formData,
                onboardingCompleted: true,
            });
            completeOnboarding();
            try {
                localStorage.removeItem(DRAFT_STORAGE_KEY);
            } catch { }

            // The onboarding layout redirects as soon as the account is onboarded,
            // so go straight to the clinic dashboard rather than showing a modal.
            toast.success("Application submitted! We'll notify you once your clinic is verified.");
            router.replace('/dashboard/clinic');
        } catch (error) {
            console.error("Submission error:", error);
            toast.error(errorMessage(error, "Could not submit your application. Please try again."));
        } finally {
            setIsFinishing(false);
        }
    };

    // --- Skip to Preview Dashboard ---
    const handleSkipToPreview = async () => {
        setIsSkipping(true);
        const currentFormValues = watch();

        // 1. Persist current values and step so "Complete Onboarding" resumes here
        saveDraft(currentStep, { onboardingSkipped: true });

        if (!isSignedIn) {
            setIsSkipping(false);
            setIsSkipModalOpen(false);
            toast.info("Entering Clinic OS Preview Sandbox.");
            router.push('/dashboard/clinic');
            return;
        }

        try {
            await completeUserProfileMutation({
                role: 'clinic_owner',
                profileData: {
                    referralSource: currentFormValues.referralSource || 'preview_skipped',
                    gender: 'prefer_not_to_say',
                    clinicLocation: locationLabel(currentFormValues),
                },
                firstName: currentFormValues.firstName || currentUser?.firstName || undefined,
                lastName: currentFormValues.lastName || currentUser?.lastName || undefined,
                finalStep: false,
                onboardingSkipped: true,
            });

            toast.info("Entering Preview Mode. Welcome to your Clinic OS.");
            router.push('/dashboard/clinic');
        } catch (error) {
            console.error("Skip error:", error);
            // Even if database provisioning takes a moment, allow entering preview mode smoothly
            toast.info("Entering Preview Mode.");
            router.push('/dashboard/clinic');
        } finally {
            setIsSkipping(false);
            setIsSkipModalOpen(false);
        }
    };

    // Animation variants
    const variants = {
        enter: (direction: number) => ({ x: direction > 0 ? 20 : -20, opacity: 0 }),
        center: { zIndex: 1, x: 0, opacity: 1 },
        exit: (direction: number) => ({ zIndex: 0, x: direction < 0 ? 20 : -20, opacity: 0 }),
    };

    const socialOptions = [
        { id: 'twitter', label: 'X (Twitter)', icon: Twitter },
        { id: 'instagram', label: 'Instagram', icon: Instagram },
        { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
        { id: 'search', label: 'Search Engine', icon: SearchIcon },
        { id: 'friend', label: 'Friend/Colleague', icon: Users },
        { id: 'other', label: 'Other', icon: Globe },
    ];
    const referralSourceValue = watch('referralSource') || '';
    const isPresetReferralSource = socialOptions.slice(0, 5).some(o => o.label === referralSourceValue);
    // "Other" is active once chosen, or when a restored draft holds a custom answer
    const isOtherReferralSource = !isPresetReferralSource && (otherReferralChosen || referralSourceValue !== '');

    const accountEmail = currentUser?.email || watch('email');

    const values = watch();
    const reviewSections: { step: number; title: string; lines: (string | undefined)[] }[] = [
        {
            step: 0,
            title: 'About you',
            lines: [
                `${values.firstName ?? ''} ${values.lastName ?? ''}`.trim(),
                values.phoneNumber,
                values.isOwner ? 'Clinic owner' : values.positionIfNotOwner,
            ],
        },
        {
            step: 1,
            title: 'Your clinic',
            lines: [
                values.clinicName,
                values.clinicEmail,
                values.clinicPhone,
                values.registrationNumber && `Reg. no. ${values.registrationNumber}`,
                values.website,
            ],
        },
        {
            step: LOCATION_STEP,
            title: 'Location',
            lines: [values.address, [values.city, values.state].filter(Boolean).join(', ')],
        },
        {
            step: HOURS_STEP,
            title: 'Opening hours',
            lines: [summarizeHours(values.operatingHours)],
        },
        {
            step: DOCUMENTS_STEP,
            title: 'Business licence',
            lines: businessLicense.length ? businessLicense.map(f => f.name) : ['Not uploaded'],
        },
    ];

    return (
        <div className="w-full max-w-xl mx-auto px-4 py-6">
            {/* Progress Bar & Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        Clinic Setup • Step {currentStep + 1} of {steps.length}
                    </span>
                    <button
                        type="button"
                        onClick={() => setIsSkipModalOpen(true)}
                        className="text-xs font-medium text-[#005b57] hover:text-[#00443e] hover:underline flex items-center gap-1 transition-colors"
                    >
                        <span>Skip to Preview</span>
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[#005b57]"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400 font-medium">
                    <span>{steps[currentStep].title}</span>
                    <span className="text-gray-400">Preview mode available</span>
                </div>
            </div>

            <div className="min-h-[400px] relative">
                <AnimatePresence initial={false} custom={direction} mode="wait">
                    <motion.div
                        key={currentStep}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                        className="w-full"
                    >
                        {/* Step 1: About you */}
                        {currentStep === 0 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">About you</h2>
                                    <p className="text-gray-500">The person setting up this clinic</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="firstName">First name</Label>
                                            <Input id="firstName" {...register('firstName')} autoComplete="given-name" />
                                            {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message as string}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="lastName">Last name</Label>
                                            <Input id="lastName" {...register('lastName')} autoComplete="family-name" />
                                            {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message as string}</p>}
                                        </div>
                                    </div>
                                    {accountEmail && (
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <Input id="email" value={accountEmail} readOnly className="bg-gray-50 text-gray-600" />
                                            <p className="text-xs text-gray-500">From your account</p>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label htmlFor="phoneNumber">Phone number</Label>
                                        <Input id="phoneNumber" type="tel" {...register('phoneNumber')} autoComplete="tel" />
                                        {errors.phoneNumber && <p className="text-xs text-red-500">{errors.phoneNumber.message as string}</p>}
                                    </div>

                                    <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
                                        <Label>Are you the clinic owner?</Label>
                                        <Controller
                                            name="isOwner"
                                            control={control}
                                            render={({ field }) => (
                                                <div className="flex gap-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" checked={field.value === true} onChange={() => field.onChange(true)} className="text-[#005b57]" />
                                                        <span>Yes</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" checked={field.value === false} onChange={() => field.onChange(false)} className="text-[#005b57]" />
                                                        <span>No</span>
                                                    </label>
                                                </div>
                                            )}
                                        />
                                    </div>
                                    {!watch('isOwner') && (
                                        <div className="space-y-2">
                                            <Label htmlFor="positionIfNotOwner">Your position</Label>
                                            <Input id="positionIfNotOwner" {...register('positionIfNotOwner')} placeholder="e.g. Manager" />
                                            {errors.positionIfNotOwner && <p className="text-xs text-red-500">{errors.positionIfNotOwner.message as string}</p>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Your clinic */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Your clinic</h2>
                                    <p className="text-gray-500">How patients will find and contact you</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="clinicName">Clinic name</Label>
                                        <Input id="clinicName" {...register('clinicName')} autoComplete="organization" />
                                        {errors.clinicName && <p className="text-xs text-red-500">{errors.clinicName.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="registrationNumber">CAC / registration number (optional)</Label>
                                        <Input id="registrationNumber" {...register('registrationNumber')} placeholder="e.g. RC 1234567" />
                                        <p className="text-xs text-gray-500">Helps us verify your clinic faster.</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="clinicEmail">Clinic email</Label>
                                            <Input id="clinicEmail" {...register('clinicEmail')} type="email" autoComplete="email" />
                                            {errors.clinicEmail && <p className="text-xs text-red-500">{errors.clinicEmail.message as string}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="clinicPhone">Clinic phone</Label>
                                            <Input id="clinicPhone" {...register('clinicPhone')} type="tel" />
                                            {errors.clinicPhone && <p className="text-xs text-red-500">{errors.clinicPhone.message as string}</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="website">Website (optional)</Label>
                                        <Input id="website" {...register('website')} placeholder="https://" />
                                        {errors.website && <p className="text-xs text-red-500">{errors.website.message as string}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Location */}
                        {currentStep === LOCATION_STEP && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Location</h2>
                                    <p className="text-gray-500">Where is the clinic?</p>
                                </div>
                                <div className="space-y-4">
                                    {HAS_MAPBOX && (
                                        <div className="space-y-2">
                                            <Label>Search for the address</Label>
                                            <MapboxAddressInput
                                                value={watch('clinicLocation') || ''}
                                                onChange={(val) => {
                                                    // Only a picked result sets the location; clearing the search clears it
                                                    if (!val) setValue('clinicLocation', '');
                                                }}
                                                onSelectPlace={handlePlacePicked}
                                                placeholder="Start typing the clinic address"
                                                className="w-full"
                                            />
                                            <p className="text-xs text-gray-500">Pick a result to fill in the fields below, or type them in yourself.</p>
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <Label htmlFor="address">Street address</Label>
                                        <Input id="address" {...register('address')} autoComplete="street-address" />
                                        {errors.address && <p className="text-xs text-red-500">{errors.address.message as string}</p>}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="city">City</Label>
                                            <Input id="city" {...register('city')} autoComplete="address-level2" />
                                            {errors.city && <p className="text-xs text-red-500">{errors.city.message as string}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="state">State</Label>
                                            <Input id="state" {...register('state')} autoComplete="address-level1" />
                                            {errors.state && <p className="text-xs text-red-500">{errors.state.message as string}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Opening hours */}
                        {currentStep === HOURS_STEP && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Opening hours</h2>
                                    <p className="text-gray-500">When is the clinic open? You can change this later.</p>
                                </div>
                                <div className="space-y-4">
                                    <Controller
                                        control={control}
                                        name="operatingHours"
                                        render={({ field }) => (
                                            isAvailabilityLoading ? (
                                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                    {[...Array(7)].map((_, i) => (
                                                        <div key={i} className="flex flex-col py-4 border-b border-gray-200 last:border-0">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex items-center gap-4 w-32 pt-2">
                                                                    <Skeleton className="h-6 w-10 rounded-full" />
                                                                    <Skeleton className="h-4 w-16" />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 justify-end">
                                                                        <Skeleton className="h-9 w-28" />
                                                                        <Skeleton className="h-9 w-28" />
                                                                        <Skeleton className="h-8 w-8 rounded-md" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <AvailabilityScheduler
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            )
                                        )}
                                    />
                                    <div className="space-y-2">
                                        <Label htmlFor="additionalNotes">Additional notes (optional)</Label>
                                        <Textarea id="additionalNotes" {...register('additionalNotes')} placeholder="e.g. Closed on public holidays" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 5: Business licence */}
                        {currentStep === DOCUMENTS_STEP && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Business licence</h2>
                                    <p className="text-gray-500">We use this to verify your clinic</p>
                                </div>
                                <div className="space-y-4">
                                    <FileUpload
                                        id="doc-license"
                                        label="Business licence"
                                        required
                                        accept="application/pdf,image/jpeg,image/png"
                                        multiple
                                        onChange={(f) => setBusinessLicense((Array.isArray(f) ? f : [f]).filter((file): file is File => file !== null))}
                                        value={businessLicense}
                                    />
                                    <p className="text-sm text-gray-500">
                                        You can add more documents, photos, services and facilities later in Clinic settings.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Step 6: Review & submit */}
                        {currentStep === REVIEW_STEP && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Review & submit</h2>
                                    <p className="text-gray-500">Check your details, then submit for verification</p>
                                </div>
                                <div className="space-y-6">
                                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {reviewSections.map((section) => (
                                            <div key={section.title} className="flex items-start justify-between gap-4 p-4">
                                                <div className="min-w-0 space-y-0.5">
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{section.title}</p>
                                                    {section.lines
                                                        .filter((line): line is string => !!line)
                                                        .map((line, i) => (
                                                            <p key={i} className="text-sm text-gray-900 break-words">{line}</p>
                                                        ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => goToStep(section.step)}
                                                    className="shrink-0 text-xs font-medium text-[#005b57] hover:text-[#00443e] hover:underline"
                                                    aria-label={`Edit ${section.title}`}
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="space-y-3">
                                        <Label>How did you hear about us?</Label>
                                        <Controller
                                            control={control}
                                            name="referralSource"
                                            render={({ field }) => (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {socialOptions.map((option) => {
                                                        const Icon = option.icon;
                                                        const isSelected = option.id === 'other'
                                                            ? isOtherReferralSource
                                                            : field.value === option.label;

                                                        return (
                                                            <button
                                                                type="button"
                                                                key={option.id}
                                                                onClick={() => {
                                                                    if (option.id !== 'other') {
                                                                        field.onChange(option.label);
                                                                    } else if (!isOtherReferralSource) {
                                                                        field.onChange(''); // Clear for manual input
                                                                        setOtherReferralChosen(true);
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    "flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:border-teal-200 hover:bg-teal-50/50",
                                                                    isSelected ? "border-[#005b57] bg-teal-50 text-[#005b57]" : "border-gray-100 bg-white text-gray-500"
                                                                )}
                                                            >
                                                                <Icon className="w-6 h-6 mb-2" />
                                                                <span className="text-xs font-medium text-center">{option.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        />

                                        {/* Manual Input if "Other" is selected or value doesn't match predefined options */}
                                        {isOtherReferralSource && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="pt-2"
                                            >
                                                <Label className="text-xs text-gray-500 mb-1.5 block">Please specify</Label>
                                                <Input
                                                    placeholder="e.g. Conference, Flyer, etc."
                                                    value={watch('referralSource')}
                                                    onChange={(e) => setValue('referralSource', e.target.value, { shouldValidate: true })}
                                                    className="h-11"
                                                />
                                            </motion.div>
                                        )}

                                        {errors.referralSource && <p className="text-xs text-red-500">{errors.referralSource.message as string}</p>}
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                                        <Controller
                                            control={control}
                                            name="acceptTerms"
                                            render={({ field }) => (
                                                <Checkbox id="acceptTerms" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                                            )}
                                        />
                                        <Label htmlFor="acceptTerms" className="text-sm font-normal leading-snug">
                                            I accept the{' '}
                                            <Link href="/terms-and-conditions" target="_blank" className="text-[#005b57] underline">
                                                terms and conditions
                                            </Link>
                                        </Label>
                                    </div>
                                    {errors.acceptTerms && <p className="text-xs text-red-500">{errors.acceptTerms.message as string}</p>}
                                </div>
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-6 mt-6 border-t border-gray-100">
                <Button
                    type="button"
                    onClick={prevStep}
                    variant="ghost"
                    className={cn("text-gray-500 hover:text-gray-900", currentStep === 0 && "invisible")}
                >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>

                <div className="flex items-center gap-2.5">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsSkipModalOpen(true)}
                        disabled={isSkipping || isSubmitting || isFinishing}
                        className="text-xs text-neutral-500 hover:text-neutral-900 h-12 px-3"
                    >
                        Skip for now
                    </Button>

                    <Button
                        type="button"
                        onClick={nextStep}
                        disabled={isSubmitting || isSkipping || isFinishing}
                        className="bg-[#005b57] hover:bg-[#00443e] text-white min-w-[120px] h-12 rounded-xl shadow-lg shadow-teal-900/10"
                    >
                        {isSubmitting || isFinishing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : currentStep === steps.length - 1 ? (
                            'Submit'
                        ) : (
                            <>
                                Next
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Skip to Preview Confirmation Modal */}
            <Dialog open={isSkipModalOpen} onOpenChange={setIsSkipModalOpen}>
                <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.08]">
                    <DialogHeader className="text-left space-y-2">
                        <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-[#005b57] flex items-center justify-center">
                            <Eye className="w-5 h-5" />
                        </div>
                        <DialogTitle className="text-lg font-semibold tracking-tight text-neutral-950 dark:text-white">
                            Explore Clinic OS in Preview Mode?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed space-y-2">
                            <span>
                                You can explore the complete Clinic OS layout, EHR timeline, and appointment calendar immediately without completing all registration steps right now.
                            </span>
                            <span className="block mt-2 font-medium text-amber-700 dark:text-amber-400">
                                Note: Your dashboard will be in read-only preview mode. You cannot book real patients or accept payments until onboarding is completed and verified by admin.
                            </span>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-3 sm:space-x-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsSkipModalOpen(false)}
                            className="h-10 rounded-xl text-xs"
                        >
                            Continue Setup
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSkipToPreview}
                            disabled={isSkipping}
                            className="h-10 rounded-xl text-xs bg-[#005b57] hover:bg-[#00443e] text-white"
                        >
                            {isSkipping ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                            ) : (
                                <Eye className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Enter Preview Mode
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
