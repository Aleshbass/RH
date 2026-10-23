'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, Plus, X, Loader2, Upload, ShieldCheck, Share2, Copy, UserPlus, ArrowRight, Award } from '@/components/icons';
import { useMutation, useConvexAuth } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import { Id } from '@/convex/_generated/dataModel';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SignIn, SignUp, useUser, useSignUp as useClerkSignUp } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import MapboxAddressInput from '@/components/physio-register/MapboxAddressInput';

// --- Schemas ---

const personalInfoSchema = z.object({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    phone: z.string().min(10, "Please enter a valid phone number"),
    practiceName: z.string().optional(),
    practiceAddress: z.string().optional(),
    yearsOfExperience: z.number().min(0, 'Years of experience must be a positive number'),
});

const licenseSchema = z.object({
    licenseNumber: z.string().min(1, 'MRTB License number is required'),
    regulatoryBody: z.string().min(1, 'Regulatory body is required'),
    licenseCountry: z.string().min(1, 'Country is required'),
    licenseExpiryDate: z.string().min(1, 'Expiry date is required'),
});

const profileSchema = z.object({
    bio: z.string().optional(),
    websiteUrl: z.string().optional(),
});

const confirmSchema = z.object({
    termsAccepted: z.boolean().refine(val => val === true, {
        message: "You must confirm the information is accurate"
    }),
});

const fullSchema = z.object({
    ...personalInfoSchema.shape,
    ...licenseSchema.shape,
    ...profileSchema.shape,
    ...confirmSchema.shape,
    specialties: z.array(z.string()),
    languages: z.array(z.string()),
});

type FormValues = z.infer<typeof fullSchema>;

// --- Steps ---

const steps = [
    { id: 'personal', title: 'Personal & Practice Info' },
    { id: 'license', title: 'License & Credentials' },
    { id: 'profile', title: 'Professional Profile' },
    { id: 'review', title: 'Review & Submit' },
    { id: 'signup', title: 'Create Account' },
];

const SPECIALIZATIONS = [
    "Orthopedic", "Neurological", "Pediatric", "Geriatric",
    "Sports", "Cardiovascular", "Women's Health", "Musculoskeletal",
    "Respiratory", "Pain Management",
];

const LANGUAGES = [
    "English", "Yoruba", "Igbo", "Hausa", "Pidgin", "French",
];

const REGULATORY_BODIES = [
    "MRTB (Medical Rehabilitation Therapists Board)",
    "HCPC (Health & Care Professions Council)",
    "AHPRA (Australian Health Practitioner Regulation Agency)",
    "Other",
];

/** Turns a Convex/network error into a sentence a person can act on. */
function readableError(error: unknown, fallback: string) {
    const raw = (error as { data?: unknown; message?: string })?.data ?? (error as Error)?.message;
    if (typeof raw !== "string" || !raw) return fallback;
    const cleaned = raw
        .replace(/^\[CONVEX[^\]]*\]\s*/, "")
        .replace(/^.*?Uncaught (Convex)?Error:\s*/, "")
        .split("\n")[0]
        .trim();
    return cleaned && !/server error/i.test(cleaned) ? cleaned : fallback;
}

export default function PhysioRegisterWizard() {
    const searchParams = useSearchParams();
    const referredByLicense = searchParams?.get('ref') || undefined;

    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [specialties, setSpecialties] = useState<string[]>([]);
    const [languages, setLanguages] = useState<string[]>(["English"]);
    const [manualSpecialty, setManualSpecialty] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [registrySlug, setRegistrySlug] = useState('');
    const [registryEntryId, setRegistryEntryId] = useState<Id<"physioRegistry"> | null>(null);
    const [showSignupStep, setShowSignupStep] = useState(false);
    const [copied, setCopied] = useState(false);

    // File states
    const [licenseCertFile, setLicenseCertFile] = useState<File | null>(null);
    const [photoIdFile, setPhotoIdFile] = useState<File | null>(null);
    const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
    const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
    const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);

    // Clerk
    const { user: clerkUser } = useUser();
    // Convex only sees the user once Clerk's token reaches it; link only after that
    const { isAuthenticated: isConvexAuthed } = useConvexAuth();

    // Convex
    const submitRegistration = useMutation(api.physioRegistry.submitRegistration);
    const linkClerkUser = useMutation(api.physioRegistry.linkClerkUser);
    const { uploadFile, isUploading } = useFileUpload();

    const [isSubmitting, setIsSubmitting] = useState(false);

    const { control, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(fullSchema),
        mode: 'onChange',
        defaultValues: {
            fullName: '',
            email: '',
            phone: '',
            practiceName: '',
            practiceAddress: '',
            yearsOfExperience: 0,
            licenseNumber: '',
            regulatoryBody: '',
            licenseCountry: 'Nigeria',
            licenseExpiryDate: '',
            bio: '',
            websiteUrl: '',
            termsAccepted: false,
            specialties: [],
            languages: ["English"],
        }
    });

    // Auto-link the new account to the registry entry after sign-up
    useEffect(() => {
        if (isConvexAuthed && clerkUser && registryEntryId && showSignupStep) {
            linkClerkUser({
                registryEntryId,
                clerkUserId: clerkUser.id,
            }).then(() => {
                setShowSignupStep(false);
                setIsSubmitted(true);
                toast.success('Account linked! Your profile is ready.');
            }).catch((err) => {
                toast.error(readableError(err, 'We saved your registration but couldn’t link it to your account.'));
            });
        }
    }, [isConvexAuthed, clerkUser, registryEntryId, showSignupStep, linkClerkUser]);

    const nextStep = async () => {
        let fieldsToValidate: any[] = [];

        switch (currentStep) {
            case 0:
                fieldsToValidate = ['fullName', 'email', 'phone', 'yearsOfExperience'];
                break;
            case 1:
                fieldsToValidate = ['licenseNumber', 'regulatoryBody', 'licenseCountry', 'licenseExpiryDate'];
                if (!licenseCertFile) {
                    toast.error("Please upload your license certificate");
                    return;
                }
                if (!photoIdFile) {
                    toast.error("Please upload your government-issued photo ID");
                    return;
                }
                break;
            case 2:
                break;
            case 3:
                fieldsToValidate = ['termsAccepted'];
                break;
        }

        if (fieldsToValidate.length > 0) {
            const isStepValid = await trigger(fieldsToValidate);
            if (!isStepValid) return;
        }

        if (currentStep === 3) {
            // Submit data first, then show signup step
            await handleFinalSubmit();
        } else if (currentStep < steps.length - 1) {
            setDirection(1);
            setCurrentStep(prev => prev + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0 && !showSignupStep) {
            setDirection(-1);
            setCurrentStep(prev => prev - 1);
        }
    };

    useEffect(() => {
        return () => {
            if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
        };
    }, [profilePhotoPreview]);

    const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setProfilePhotoFile(file);
            if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
            setProfilePhotoPreview(URL.createObjectURL(file));
        }
    };

    // After the registration is saved: link it to the signed-in account (never blocking), or ask them to sign up
    const finishAfterSave = async (entryId: Id<"physioRegistry">) => {
        if (isConvexAuthed && clerkUser) {
            try {
                await linkClerkUser({ registryEntryId: entryId, clerkUserId: clerkUser.id });
                toast.success("Registration submitted successfully!");
            } catch (linkErr) {
                toast.warning(readableError(linkErr, "You're on the register, but it isn't linked to this account yet."));
            }
            setIsSubmitted(true);
        } else {
            setShowSignupStep(true);
            setDirection(1);
            setCurrentStep(4);
            toast.success("Saved! Create an account to manage your profile.");
        }
    };

    const handleFinalSubmit = async () => {
        // A previous attempt already saved the registration: don't upload or insert again
        if (registryEntryId) {
            setIsSubmitting(true);
            try {
                await finishAfterSave(registryEntryId as Id<"physioRegistry">);
            } finally {
                setIsSubmitting(false);
            }
            return;
        }
        setIsSubmitting(true);
        try {
            if (!licenseCertFile || !photoIdFile) {
                setIsSubmitting(false);
                toast.error("Please upload all required documents.");
                return;
            }

            const licenseCertResult = await uploadFile(licenseCertFile);
            const photoIdResult = await uploadFile(photoIdFile);
            const insuranceResult = insuranceFile ? await uploadFile(insuranceFile) : null;
            const profilePhotoResult = profilePhotoFile ? await uploadFile(profilePhotoFile) : null;

            if (!licenseCertResult.storageId || !photoIdResult.storageId) {
                throw new Error("Failed to upload required documents. Please try again.");
            }

            const formData = watch();

            const result = await submitRegistration({
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                practiceName: formData.practiceName || undefined,
                practiceAddress: formData.practiceAddress || undefined,
                yearsOfExperience: formData.yearsOfExperience,
                licenseNumber: formData.licenseNumber,
                regulatoryBody: formData.regulatoryBody,
                licenseCountry: formData.licenseCountry,
                licenseExpiryDate: formData.licenseExpiryDate,
                specialties,
                languages,
                bio: formData.bio || undefined,
                websiteUrl: formData.websiteUrl || undefined,
                licenseCertStorageId: licenseCertResult.storageId as Id<"_storage">,
                photoIdStorageId: photoIdResult.storageId as Id<"_storage">,
                insuranceStorageId: insuranceResult?.storageId as Id<"_storage"> | undefined,
                profilePhotoStorageId: profilePhotoResult?.storageId as Id<"_storage"> | undefined,
                referredByLicense,
            });

            if (result.success) {
                setRegistryEntryId(result.id);
                setRegistrySlug(result.slug);
                await finishAfterSave(result.id as Id<"physioRegistry">);
            }
        } catch (error: unknown) {
            toast.error(readableError(error, "We couldn't submit your registration. Please try again."));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyProfileLink = () => {
        const url = `${window.location.origin}/physio-register/${registrySlug}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success('Profile link copied!');
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShareWhatsApp = () => {
        const url = `${window.location.origin}/physio-register/${registrySlug}`;
        const text = `I just joined the Physio Register! Check out my profile and verify me: ${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleSkipSignup = () => {
        setShowSignupStep(false);
        setIsSubmitted(true);
    };

    // Animation variants
    const variants = {
        enter: (direction: number) => ({ x: direction > 0 ? 20 : -20, opacity: 0 }),
        center: { zIndex: 1, x: 0, opacity: 1 },
        exit: (direction: number) => ({ zIndex: 0, x: direction < 0 ? 20 : -20, opacity: 0 }),
    };

    // Success screen
    if (isSubmitted) {
        const profileUrl = registrySlug
            ? `${typeof window !== 'undefined' ? window.location.origin : ''}/physio-register/${registrySlug}`
            : '';

        return (
            <div className="w-full max-w-xl mx-auto px-4 py-12 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                    <ShieldCheck className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-[#002e2c] mb-3">You&apos;re on the Register!</h2>
                <p className="text-gray-600 mb-6">
                    Your profile is now live on the Physio Register. Share it with your colleagues to get verified
                    and climb the rankings!
                </p>

                {/* Profile URL */}
                {registrySlug && (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-6">
                        <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wider">Your Profile URL</p>
                        <p className="text-sm text-[#005b57] font-mono break-all mb-3">{profileUrl}</p>
                        <div className="flex gap-2 justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopyProfileLink}
                                className="rounded-xl text-xs"
                            >
                                {copied ? <Check className="w-3 h-3 mr-1.5" /> : <Copy className="w-3 h-3 mr-1.5" />}
                                {copied ? 'Copied!' : 'Copy Link'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleShareWhatsApp}
                                className="rounded-xl text-xs"
                            >
                                <Share2 className="w-3 h-3 mr-1.5" /> WhatsApp
                            </Button>
                        </div>
                    </div>
                )}

                {/* CTA: Get verified by colleagues */}
                <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl p-5 mb-6">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <Award className="w-5 h-5 text-amber-600" />
                        <strong className="text-[#002e2c]">Become a Top Physiotherapist in Nigeria</strong>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                        Share your profile to get your colleagues to verify you.
                        The more verifications, the higher you rank on the register!
                    </p>
                    <Button
                        onClick={handleShareWhatsApp}
                        className="bg-[#005b57] hover:bg-[#00443e] text-white rounded-xl shadow-lg shadow-teal-900/10"
                    >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share to Get Verified
                    </Button>
                </div>

                <div className="flex gap-3 justify-center">
                    {registrySlug && (
                        <Button asChild className="bg-[#005b57] hover:bg-[#00443e]">
                            <Link href={`/physio-register/${registrySlug}`}>View Your Profile</Link>
                        </Button>
                    )}
                    <Button asChild variant="outline">
                        <Link href="/physio-register">Browse the Register</Link>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-xl mx-auto px-4 py-6">
            {/* Referral notice */}
            {referredByLicense && currentStep === 0 && (
                <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-3 text-sm text-teal-800 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>You were referred by a colleague (License: <strong>{referredByLicense}</strong>)</span>
                </div>
            )}

            {/* Progress Bar */}
            <div className="mb-8">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-[#005b57]"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-400 font-medium uppercase tracking-wider">
                    <span>Step {currentStep + 1} of {steps.length}</span>
                    <span>{steps[currentStep].title}</span>
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
                        {/* Step 1: Personal & Practice Info */}
                        {currentStep === 0 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Personal & Practice Info</h2>
                                    <p className="text-gray-500">Tell us about yourself and your practice</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Full Legal Name <span className="text-red-500">*</span></Label>
                                        <Input {...control.register('fullName')} placeholder="Dr. John Doe" className="h-12" />
                                        {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Email <span className="text-red-500">*</span></Label>
                                            <Input {...control.register('email')} placeholder="Email" type="email" className="h-12" />
                                            {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Phone <span className="text-red-500">*</span></Label>
                                            <Input {...control.register('phone')} placeholder="Phone number" className="h-12" />
                                            {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Practice/Clinic Name <span className="text-gray-400 text-xs">(Optional)</span></Label>
                                        <Input {...control.register('practiceName')} placeholder="Practice or clinic name" className="h-12" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Practice Address <span className="text-gray-400 text-xs">(Optional)</span></Label>
                                        <MapboxAddressInput
                                            value={watch('practiceAddress')}
                                            onChange={(address) => setValue('practiceAddress', address)}
                                            placeholder="Search for your practice address..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Years of Experience <span className="text-red-500">*</span></Label>
                                        <Input
                                            {...control.register('yearsOfExperience', { setValueAs: (value) => (value === '' || value === null ? 0 : Number(value)) })}
                                            type="number"
                                            min={0}
                                            placeholder="Years"
                                            className="h-12"
                                        />
                                        {errors.yearsOfExperience && <p className="text-xs text-red-500">{errors.yearsOfExperience.message}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: License & Credentials */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">License & Credentials</h2>
                                    <p className="text-gray-500">Upload your professional credentials</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>MRTB License Number <span className="text-red-500">*</span></Label>
                                        <Input {...control.register('licenseNumber')} placeholder="Enter your license number" className="h-12" />
                                        {errors.licenseNumber && <p className="text-xs text-red-500">{errors.licenseNumber.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Regulatory Body <span className="text-red-500">*</span></Label>
                                        <Controller
                                            control={control}
                                            name="regulatoryBody"
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <SelectTrigger className="h-12">
                                                        <SelectValue placeholder="Select regulatory body" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {REGULATORY_BODIES.map(body => (
                                                            <SelectItem key={body} value={body}>{body}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.regulatoryBody && <p className="text-xs text-red-500">{errors.regulatoryBody.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Country <span className="text-red-500">*</span></Label>
                                            <Input {...control.register('licenseCountry')} placeholder="Country" className="h-12" />
                                            {errors.licenseCountry && <p className="text-xs text-red-500">{errors.licenseCountry.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>License Expiry <span className="text-red-500">*</span></Label>
                                            <Input {...control.register('licenseExpiryDate')} type="date" className="h-12" />
                                            {errors.licenseExpiryDate && <p className="text-xs text-red-500">{errors.licenseExpiryDate.message}</p>}
                                        </div>
                                    </div>

                                    {/* File uploads */}
                                    <div className="space-y-3 pt-2">
                                        <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">Document Uploads</h3>

                                        <div className="space-y-1.5">
                                            <Label className="text-sm">License Certificate <span className="text-red-500">*</span></Label>
                                            <label className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                                                licenseCertFile ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-teal-300 hover:bg-teal-50/30"
                                            )}>
                                                <Upload className={cn("w-5 h-5", licenseCertFile ? "text-green-600" : "text-gray-400")} />
                                                <span className="text-sm text-gray-600 truncate">
                                                    {licenseCertFile ? licenseCertFile.name : "Upload license certificate (PDF or image)"}
                                                </span>
                                                {licenseCertFile && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                                                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setLicenseCertFile(e.target.files?.[0] || null)} />
                                            </label>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-sm">Government-issued Photo ID <span className="text-red-500">*</span></Label>
                                            <label className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                                                photoIdFile ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-teal-300 hover:bg-teal-50/30"
                                            )}>
                                                <Upload className={cn("w-5 h-5", photoIdFile ? "text-green-600" : "text-gray-400")} />
                                                <span className="text-sm text-gray-600 truncate">
                                                    {photoIdFile ? photoIdFile.name : "Upload photo ID (PDF or image)"}
                                                </span>
                                                {photoIdFile && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                                                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setPhotoIdFile(e.target.files?.[0] || null)} />
                                            </label>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-sm">Proof of Insurance <span className="text-gray-400 text-xs">(Optional)</span></Label>
                                            <label className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                                                insuranceFile ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-teal-300 hover:bg-teal-50/30"
                                            )}>
                                                <Upload className={cn("w-5 h-5", insuranceFile ? "text-green-600" : "text-gray-400")} />
                                                <span className="text-sm text-gray-600 truncate">
                                                    {insuranceFile ? insuranceFile.name : "Upload insurance proof (PDF or image)"}
                                                </span>
                                                {insuranceFile && <Check className="w-4 h-4 text-green-600 ml-auto" />}
                                                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setInsuranceFile(e.target.files?.[0] || null)} />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Professional Profile */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Professional Profile</h2>
                                    <p className="text-gray-500">Add details to your public registry listing</p>
                                </div>

                                {/* Profile Photo */}
                                <div className="flex flex-col items-center space-y-3 p-5 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200 border-4 border-white shadow-md">
                                            {profilePhotoPreview ? (
                                                <img src={profilePhotoPreview} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                    <ShieldCheck className="w-8 h-8" />
                                                </div>
                                            )}
                                        </div>
                                        <label className="absolute bottom-0 right-0 bg-[#005b57] text-white p-1.5 rounded-full shadow-lg cursor-pointer hover:bg-[#00443e] transition-colors">
                                            <Plus className="w-3 h-3" />
                                            <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoChange} />
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500">Profile photo (optional)</p>
                                </div>

                                {/* Specialties */}
                                <div className="space-y-3">
                                    <Label>Specialties</Label>
                                    <div className="flex gap-2">
                                        <Select onValueChange={(val) => {
                                            if (!specialties.includes(val)) setSpecialties([...specialties, val]);
                                        }}>
                                            <SelectTrigger className="h-12 flex-1">
                                                <SelectValue placeholder="Select specialty" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {SPECIALIZATIONS.map(spec => (
                                                    <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Or type manually..."
                                            value={manualSpecialty}
                                            onChange={(e) => setManualSpecialty(e.target.value)}
                                            className="h-12"
                                        />
                                        <Button type="button" onClick={() => {
                                            if (manualSpecialty && !specialties.includes(manualSpecialty)) {
                                                setSpecialties([...specialties, manualSpecialty]);
                                                setManualSpecialty('');
                                            }
                                        }} className="h-12 w-12 p-0 bg-[#005b57]">
                                            <Plus className="h-5 w-5" />
                                        </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {specialties.map((spec) => (
                                            <div key={spec} className="bg-teal-50 text-teal-800 px-3 py-1 rounded-full flex items-center gap-2 text-sm border border-teal-100">
                                                {spec}
                                                <button type="button" onClick={() => setSpecialties(specialties.filter(s => s !== spec))}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Languages */}
                                <div className="space-y-3">
                                    <Label>Languages Spoken</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {LANGUAGES.map(lang => (
                                            <button
                                                key={lang}
                                                type="button"
                                                onClick={() => {
                                                    if (languages.includes(lang)) {
                                                        setLanguages(languages.filter(l => l !== lang));
                                                    } else {
                                                        setLanguages([...languages, lang]);
                                                    }
                                                }}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-sm border transition-all",
                                                    languages.includes(lang)
                                                        ? "bg-[#005b57] text-white border-[#005b57]"
                                                        : "bg-white text-gray-600 border-gray-200 hover:border-teal-300"
                                                )}
                                            >
                                                {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Bio */}
                                <div className="space-y-2">
                                    <Label>Short Bio <span className="text-gray-400 text-xs">(Optional, max 500 chars)</span></Label>
                                    <Textarea
                                        {...control.register('bio')}
                                        placeholder="Brief description of your experience and specialities..."
                                        className="min-h-[100px] resize-none"
                                        maxLength={500}
                                    />
                                </div>

                                {/* Website */}
                                <div className="space-y-2">
                                    <Label>Website <span className="text-gray-400 text-xs">(Optional)</span></Label>
                                    <Input {...control.register('websiteUrl')} placeholder="https://..." className="h-12" />
                                </div>
                            </div>
                        )}

                        {/* Step 4: Review & Submit */}
                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Review & Submit</h2>
                                    <p className="text-gray-500">Please confirm your details are correct</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">Personal Info</h3>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div><span className="text-gray-500">Name:</span> <strong>{watch('fullName')}</strong></div>
                                            <div><span className="text-gray-500">Email:</span> <strong>{watch('email')}</strong></div>
                                            <div><span className="text-gray-500">Phone:</span> <strong>{watch('phone')}</strong></div>
                                            <div><span className="text-gray-500">Experience:</span> <strong>{watch('yearsOfExperience')} years</strong></div>
                                            {watch('practiceName') && <div className="col-span-2"><span className="text-gray-500">Practice:</span> <strong>{watch('practiceName')}</strong></div>}
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">License & Credentials</h3>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div><span className="text-gray-500">License #:</span> <strong>{watch('licenseNumber')}</strong></div>
                                            <div><span className="text-gray-500">Body:</span> <strong>{watch('regulatoryBody')}</strong></div>
                                            <div><span className="text-gray-500">Country:</span> <strong>{watch('licenseCountry')}</strong></div>
                                            <div><span className="text-gray-500">Expiry:</span> <strong>{watch('licenseExpiryDate')}</strong></div>
                                        </div>
                                        <div className="flex gap-2 flex-wrap text-xs">
                                            {licenseCertFile && <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ License cert</span>}
                                            {photoIdFile && <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Photo ID</span>}
                                            {insuranceFile && <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Insurance</span>}
                                        </div>
                                    </div>

                                    {(specialties.length > 0 || languages.length > 0) && (
                                        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                            <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider">Profile</h3>
                                            {specialties.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {specialties.map(s => (
                                                        <span key={s} className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-xs">{s}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {languages.length > 0 && (
                                                <p className="text-sm text-gray-600">Languages: {languages.join(', ')}</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Confirmation */}
                                    <div className="flex items-start space-x-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                                        <Controller
                                            control={control}
                                            name="termsAccepted"
                                            render={({ field }) => (
                                                <input
                                                    type="checkbox"
                                                    checked={field.value}
                                                    onChange={(e) => field.onChange(e.target.checked)}
                                                    className="mt-1 h-4 w-4 text-[#005b57] rounded border-gray-300 focus:ring-[#005b57]"
                                                />
                                            )}
                                        />
                                        <div className="text-sm">
                                            <Label className="font-medium text-gray-900">I confirm all submitted information is accurate and up to date</Label>
                                            <p className="text-gray-500 text-xs mt-1">By submitting, you agree to our Terms of Service and Privacy Policy. False information may result in removal from the registry.</p>
                                        </div>
                                    </div>
                                    {errors.termsAccepted && <p className="text-xs text-red-500">{errors.termsAccepted.message}</p>}
                                </div>
                            </div>
                        )}

                        {/* Step 5: Sign Up */}
                        {currentStep === 4 && showSignupStep && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Create Your Account</h2>
                                    <p className="text-gray-500">
                                        Sign up to manage your profile, edit your details, and track your ranking
                                    </p>
                                </div>

                                <div className="flex justify-center">
                                    <SignUp
                                        routing="hash"
                                        appearance={{
                                            elements: {
                                                rootBox: "mx-auto",
                                                card: "shadow-none border border-gray-200 rounded-2xl",
                                                headerTitle: "hidden",
                                                headerSubtitle: "hidden",
                                                formButtonPrimary: "bg-[#005b57] hover:bg-[#00443e]",
                                            }
                                        }}
                                        fallbackRedirectUrl={registrySlug ? `/physio-register/${registrySlug}` : '/physio-register'}
                                    />
                                </div>

                                <div className="text-center">
                                    <button
                                        onClick={handleSkipSignup}
                                        className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        Skip for now — I&apos;ll create an account later
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation Buttons */}
            {currentStep < 4 && (
                <div className="flex justify-between pt-6 mt-6 border-t border-gray-100">
                    <Button
                        type="button"
                        onClick={prevStep}
                        variant="ghost"
                        className={cn("text-gray-500 hover:text-gray-900", currentStep === 0 && "invisible")}
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>

                    <Button
                        type="button"
                        onClick={nextStep}
                        disabled={isSubmitting || isUploading}
                        className="bg-[#005b57] hover:bg-[#00443e] text-white min-w-[120px] h-12 rounded-xl shadow-lg shadow-teal-900/10"
                    >
                        {isSubmitting || isUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : currentStep === 3 ? (
                            <>
                                <ShieldCheck className="w-4 h-4 mr-2" />
                                Submit & Continue
                            </>
                        ) : (
                            <>
                                Next
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}
