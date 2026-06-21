'use client';

import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, Plus, X, Loader2, Twitter, Instagram, Linkedin, Globe, Users, Search as SearchIcon, SkipForward } from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileUpload } from '@/components/ui/file-upload';
import LocationSearch from '@/components/marketplace/LocationSearch';
import dynamic from 'next/dynamic';
import { usePhysiotherapistDocuments, PhysioDocumentType } from '@/lib/hooks/usePhysiotherapistDocuments';
import { cn } from '@/lib/utils';
import { AvailabilityScheduler } from '@/components/onboarding/common/AvailabilityScheduler';
import { Skeleton } from '@/components/ui/skeleton';
import { useFileUpload } from '@/lib/hooks/useFileUpload';

const MapboxLocationPicker = dynamic(
    () => import('@/components/onboarding/physiotherapist/MapboxLocationPicker'),
    { ssr: false, loading: () => <div className="h-[340px] bg-gray-100 rounded-xl animate-pulse" /> }
);


// --- Schemas ---

const personalInfoSchema = z.object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    phoneNumber: z.string().min(10, "Please enter a valid phone number"),
});

const demographicsSchema = z.object({
    age: z.number().min(17, "You must be at least 17 years old").max(99, "Please enter a valid age"),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"], {
        required_error: "Please select your gender",
    }),
});

const professionalInfoSchema = z.object({
    licenseNumber: z.string().min(1, 'License number is required'),
    yearsOfExperience: z.number().min(0, 'Years of experience must be a positive number'),
});

const locationSchema = z.object({
    location: z.string().min(2, 'Location is required'),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
});

const bioSchema = z.object({
    bio: z.string().min(10, "Please provide a brief professional bio"),
});

const credentialsSchema = z.object({
    certificationBoard: z.string().min(2, "Certification board is required"),
    certificationYear: z.number().min(1900, "Please enter a valid year"),
    licenseExpiryDate: z.string().min(1, "Expiry date is required"),
});

const referralSchema = z.object({
    referralSource: z.string().min(1, "Please tell us how you heard about us"),
    termsAccepted: z.boolean().refine(val => val === true, {
        message: "You must accept the terms and conditions"
    }),
});

// Combined Schema for type definition
const fullSchema = z.object({
    ...personalInfoSchema.shape,
    ...demographicsSchema.shape,
    ...professionalInfoSchema.shape,
    ...locationSchema.shape,
    ...bioSchema.shape,
    ...credentialsSchema.shape,
    ...referralSchema.shape,
    specializations: z.array(z.string()).min(1, "Select at least one specialization"),
    operatingHours: z.any(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
});

type FormValues = z.infer<typeof fullSchema>;

// --- Steps Configuration ---

// Steps 0-3 are required, steps 4-8 can be skipped and completed later
const SKIPPABLE_FROM_STEP = 4;

const steps = [
    { id: 'personal', title: 'Personal Info' },
    { id: 'demographics', title: 'Demographics' },
    { id: 'professional', title: 'Professional Info' },
    { id: 'location', title: 'Location' },
    { id: 'specializations', title: 'Specializations' },
    { id: 'bio', title: 'Bio' },
    { id: 'credentials', title: 'Credentials' },
    { id: 'availability', title: 'Availability' },
    { id: 'documents', title: 'Documents' },
    { id: 'review', title: 'Review & Submit' },
];

export default function PhysiotherapistOnboardingWizard() {
    const router = useRouter();
    const { data, updatePhysiotherapistData, completeOnboarding } = useOnboardingStore();
    const { physiotherapistData } = data;
    const { user, isSignedIn } = useUser();
    const currentUser = useQuery(api.users.getMyUser);
    const hasRestoredRef = useRef(false);
    const completeUserProfileMutation = useMutation(api.users.completeUserProfile);

    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [specializations, setSpecializations] = useState<string[]>(physiotherapistData.specializations || []);
    const [manualSpecialization, setManualSpecialization] = useState('');
    const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);
    const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
    const [isSkipping, setIsSkipping] = useState(false);
    const [registrySlug, setRegistrySlug] = useState<string | null>(null);

    // Fetch registry profile if we have a slug
    const registryProfile = useQuery(
        api.physioRegistry.getPublicProfile,
        registrySlug ? { slug: registrySlug } : "skip"
    );

    useEffect(() => {
        try {
            const slug = localStorage.getItem('physioOnboardingRegistrySlug');
            if (slug) setRegistrySlug(slug);
        } catch {}
    }, []);


    // Document State
    const [licenseFile, setLicenseFile] = useState<File | null>(null);
    const [certificates, setCertificates] = useState<File[]>([]);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // New document states for Nigerian professional documents
    const [degreeCertFile, setDegreeCertFile] = useState<File | null>(null);
    const [nyscCertFile, setNyscCertFile] = useState<File | null>(null);
    const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
    const [mrtbLicenseFile, setMrtbLicenseFile] = useState<File | null>(null);
    const [npaMembershipFile, setNpaMembershipFile] = useState<File | null>(null);
    const [practicingLicenseFile, setPracticingLicenseFile] = useState<File | null>(null);
    const [nationalIdFile, setNationalIdFile] = useState<File | null>(null);
    const [passportPhotoFile, setPassportPhotoFile] = useState<File | null>(null);
    const [proofOfAddressFile, setProofOfAddressFile] = useState<File | null>(null);

    // Guest Profile Photo handling
    const [guestProfilePhotoId, setGuestProfilePhotoId] = useState<string | null>(null);
    const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            if (profilePhotoPreviewUrl) {
                URL.revokeObjectURL(profilePhotoPreviewUrl);
            }
        };
    }, [profilePhotoPreviewUrl]);

    const {
        uploadDocument,
        isUploading,
        uploadProgress,
    } = usePhysiotherapistDocuments(currentUser?.physiotherapistProfileId ?? null);

    // Profile Photo Upload
    const updateProfileImage = useMutation(api.users.updateProfileImageFromStorage);
    const { uploadFile: uploadProfilePhoto, isUploading: isProfilePhotoUploading } = useFileUpload();

    const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const { storageId } = await uploadProfilePhoto(file);
            if (storageId) {
                if (isSignedIn) {
                    await updateProfileImage({ storageId });
                    toast.success("Profile photo updated successfully");
                } else {
                    setGuestProfilePhotoId(storageId);
                    if (profilePhotoPreviewUrl) {
                        URL.revokeObjectURL(profilePhotoPreviewUrl);
                    }
                    setProfilePhotoPreviewUrl(URL.createObjectURL(file));
                    toast.success("Profile photo uploaded! It will be linked after you sign up.");
                }
            }
        } catch (error: any) {
            console.error("Failed to upload profile photo:", error);
            if (error.message?.includes("logged in") || error.message?.includes("authenticated")) {
                toast.error("Please sign in to upload your profile photo");
            } else {
                toast.error("Failed to upload profile photo");
            }
        }
    };

    const { control, handleSubmit, trigger, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
        resolver: zodResolver(fullSchema),
        mode: 'onChange',
        defaultValues: {
            firstName: physiotherapistData.firstName || '',
            lastName: physiotherapistData.lastName || '',
            email: physiotherapistData.email || '',
            phoneNumber: physiotherapistData.phoneNumber || '',
            age: physiotherapistData.age || undefined,
            gender: physiotherapistData.gender || undefined,
            licenseNumber: physiotherapistData.licenseNumber || '',
            yearsOfExperience: physiotherapistData.yearsOfExperience || 0,
            location: physiotherapistData.location || '',
            latitude: physiotherapistData.latitude || undefined,
            longitude: physiotherapistData.longitude || undefined,
            bio: physiotherapistData.bio || '',
            certificationBoard: physiotherapistData.certificationBoard || '',
            certificationYear: physiotherapistData.certificationYear || new Date().getFullYear(),
            licenseExpiryDate: physiotherapistData.licenseExpiryDate || '',
            referralSource: physiotherapistData.referralSource || '',
            termsAccepted: physiotherapistData.termsAccepted || false,
            specializations: physiotherapistData.specializations || [],
            operatingHours: physiotherapistData.operatingHours || {
                monday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                tuesday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                wednesday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                thursday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                friday: { isOpen: true, slots: [{ start: '09:00', end: '17:00' }] },
                saturday: { isOpen: false, slots: [{ start: '09:00', end: '17:00' }] },
                sunday: { isOpen: false, slots: [{ start: '09:00', end: '17:00' }] },
            },
        }
    });

    // Pre-fill user data & registry data
    useEffect(() => {
        let hasChanges = false;
        if (currentUser && !physiotherapistData.firstName) {
            setValue('firstName', currentUser.firstName || '');
            setValue('lastName', currentUser.lastName || '');
            setValue('email', currentUser.email || '');
            hasChanges = true;
        }
        
        if (registryProfile && !physiotherapistData.licenseNumber) {
            // Split name into first/last if needed and not already set
            if (registryProfile.fullName && !currentUser?.firstName) {
                const parts = registryProfile.fullName.split(' ');
                setValue('firstName', parts[0] || '');
                setValue('lastName', parts.slice(1).join(' ') || '');
            }
            if (registryProfile.email && !currentUser?.email) setValue('email', registryProfile.email);
            if (registryProfile.phone) setValue('phoneNumber', registryProfile.phone);
            if (registryProfile.licenseNumber) setValue('licenseNumber', registryProfile.licenseNumber);
            if (registryProfile.yearsOfExperience) setValue('yearsOfExperience', registryProfile.yearsOfExperience);
            if (registryProfile.practiceAddress) setValue('location', registryProfile.practiceAddress);
            if (registryProfile.bio) setValue('bio', registryProfile.bio);
            if (registryProfile.specialties?.length) setSpecializations(registryProfile.specialties);
            if (registryProfile.licenseExpiryDate) setValue('licenseExpiryDate', registryProfile.licenseExpiryDate);
            if (registryProfile.regulatoryBody) setValue('certificationBoard', registryProfile.regulatoryBody);
            hasChanges = true;
        }
        
        if (hasChanges) {
            // Trigger an update so UI re-renders if necessary
        }
    }, [currentUser, registryProfile, setValue, physiotherapistData.firstName, physiotherapistData.licenseNumber]);

    // Restore saved onboarding data after sign-up redirect
    useEffect(() => {
        if (!isSignedIn || hasRestoredRef.current) return;
        try {
            const saved = localStorage.getItem('physioOnboardingData');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Only restore if less than 24 hours old
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                    hasRestoredRef.current = true;
                    const fd = parsed.formData;
                    // Restore all form fields
                    if (fd.firstName) setValue('firstName', fd.firstName);
                    if (fd.lastName) setValue('lastName', fd.lastName);
                    if (fd.email) setValue('email', fd.email);
                    if (fd.phoneNumber) setValue('phoneNumber', fd.phoneNumber);
                    if (fd.age) setValue('age', fd.age);
                    if (fd.gender) setValue('gender', fd.gender);
                    if (fd.licenseNumber) setValue('licenseNumber', fd.licenseNumber);
                    if (fd.yearsOfExperience) setValue('yearsOfExperience', fd.yearsOfExperience);
                    if (fd.location) setValue('location', fd.location);
                    if (fd.bio) setValue('bio', fd.bio);
                    if (fd.certificationBoard) setValue('certificationBoard', fd.certificationBoard);
                    if (fd.certificationYear) setValue('certificationYear', fd.certificationYear);
                    if (fd.licenseExpiryDate) setValue('licenseExpiryDate', fd.licenseExpiryDate);
                    if (fd.referralSource) setValue('referralSource', fd.referralSource);
                    if (fd.termsAccepted) setValue('termsAccepted', fd.termsAccepted);
                    if (fd.operatingHours) setValue('operatingHours', fd.operatingHours);
                    if (parsed.specializations?.length) {
                        setSpecializations(parsed.specializations);
                    }
                    if (parsed.guestProfilePhotoId) {
                        setGuestProfilePhotoId(parsed.guestProfilePhotoId);
                    }
                    
                    if (parsed.onboardingSkipped) {
                        // They skipped as a guest, so automatically submit the skipped profile now
                        completeUserProfileMutation({
                            role: 'physiotherapist',
                            profileData: {
                                specializations: parsed.specializations?.length > 0 ? parsed.specializations : undefined,
                                licenseNumber: fd.licenseNumber || undefined,
                                yearsOfExperience: fd.yearsOfExperience || undefined,
                                bio: fd.bio || undefined,
                                location: fd.location || undefined,
                                latitude: fd.latitude,
                                longitude: fd.longitude,
                                dateOfBirth: fd.age ? `${new Date().getFullYear() - fd.age}-01-01` : undefined,
                                gender: fd.gender,
                            },
                            firstName: fd.firstName,
                            lastName: fd.lastName,
                            finalStep: true,
                            onboardingSkipped: true,
                        }).then(() => {
                            try { localStorage.removeItem('physioOnboardingData'); } catch { }
                            toast.success('Welcome! Your skipped profile has been saved.');
                            router.push('/dashboard');
                        });
                        return; // Prevent normal restore flow
                    }
                    
                    // Jump to the review step so they can re-submit
                    setCurrentStep(steps.length - 1);
                    toast.success('Welcome back! Your onboarding data has been restored.');
                }
            }
        } catch { }
    }, [isSignedIn, setValue, completeUserProfileMutation, router]);

    // Simulate loading for availability step
    useEffect(() => {
        if (currentStep === 7) { // Availability step
            setIsAvailabilityLoading(true);
            const timer = setTimeout(() => {
                setIsAvailabilityLoading(false);
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [currentStep]);

    const nextStep = async () => {
        let fieldsToValidate: any[] = [];

        switch (currentStep) {
            case 0: fieldsToValidate = ['firstName', 'lastName', 'email', 'phoneNumber']; break;
            case 1: fieldsToValidate = ['age', 'gender']; break;
            case 2: fieldsToValidate = ['licenseNumber', 'yearsOfExperience']; break;
            case 3: fieldsToValidate = ['location']; break;
            case 4:
                if (specializations.length === 0) {
                    toast.error("Please select at least one specialization");
                    return;
                }
                setValue('specializations', specializations);
                fieldsToValidate = ['specializations'];
                break;
            case 5: fieldsToValidate = ['bio']; break;
            case 6: fieldsToValidate = ['certificationBoard', 'certificationYear', 'licenseExpiryDate']; break;
            case 7: fieldsToValidate = ['operatingHours']; break;
            case 8:
                // Validate required documents
                if (!degreeCertFile) {
                    toast.error("Please upload your degree certificate");
                    return;
                }
                if (!nyscCertFile) {
                    toast.error("Please upload your NYSC discharge certificate");
                    return;
                }
                if (!nationalIdFile) {
                    toast.error("Please upload your National ID or driver's license");
                    return;
                }
                if (!passportPhotoFile) {
                    toast.error("Please upload your passport photograph");
                    return;
                }
                // No zod validation for files here, handled manually
                break;
            case 9: fieldsToValidate = ['referralSource', 'termsAccepted']; break;
        }

        if (currentStep !== 8 && currentStep !== 4) { // Skip trigger for manual validation steps
            const isStepValid = await trigger(fieldsToValidate);
            if (!isStepValid) return;
        }

        if (currentStep < steps.length - 1) {
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

    const handleAddSpecialization = () => {
        if (manualSpecialization && !specializations.includes(manualSpecialization)) {
            setSpecializations([...specializations, manualSpecialization]);
            setManualSpecialization('');
        }
    };

    const handleRemoveSpecialization = (spec: string) => {
        setSpecializations(specializations.filter(s => s !== spec));
    };

    const handleFinalSubmit = async () => {
        const formData = watch();

        // ── If not signed in, save form data and redirect to sign-up ──
        if (!isSignedIn) {
            try {
                localStorage.setItem(
                    'physioOnboardingData',
                    JSON.stringify({
                        formData: {
                            firstName: formData.firstName,
                            lastName: formData.lastName,
                            email: formData.email,
                            phoneNumber: formData.phoneNumber,
                            age: formData.age,
                            gender: formData.gender,
                            licenseNumber: formData.licenseNumber,
                            yearsOfExperience: formData.yearsOfExperience,
                            location: formData.location,
                            latitude: formData.latitude,
                            longitude: formData.longitude,
                            bio: formData.bio,
                            certificationBoard: formData.certificationBoard,
                            certificationYear: formData.certificationYear,
                            licenseExpiryDate: formData.licenseExpiryDate,
                            referralSource: formData.referralSource,
                            termsAccepted: formData.termsAccepted,
                            operatingHours: formData.operatingHours,
                        },
                        specializations,
                        guestProfilePhotoId,
                        timestamp: Date.now(),
                    })
                );
            } catch { }
            toast.info('Create your account to complete onboarding');
            router.push('/sign-up?redirect=/physiotherapist');
            return;
        }

        try {
            // 1. Create/Update Profile FIRST to get the ID
            setIsFinalSubmitting(true);
            const result = await completeUserProfileMutation({
                role: "physiotherapist",
                profileData: {
                    specializations,
                    licenseNumber: formData.licenseNumber,
                    yearsOfExperience: formData.yearsOfExperience,
                    bio: formData.bio,
                    location: formData.location,
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    certificationBoard: formData.certificationBoard,
                    certificationYear: formData.certificationYear,
                    licenseExpiryDate: formData.licenseExpiryDate,
                    dateOfBirth: `${new Date().getFullYear() - (formData.age || 0)}-01-01`,
                    gender: formData.gender,
                    referralSource: formData.referralSource,
                    availabilitySchedule: formData.operatingHours,
                },
                firstName: formData.firstName,
                lastName: formData.lastName,
                finalStep: false, // Not final yet, we need to upload docs
            });

            if (!result.success || !result.physiotherapistProfileId) {
                throw new Error("Failed to create profile: " + result.message);
            }

            const profileId = result.physiotherapistProfileId;

            // 2. Upload Documents using the profileId
            // Helper to upload a file with a specific document type
            const uploadDoc = async (file: File | null, docType: PhysioDocumentType) => {
                if (file) {
                    const success = await uploadDocument(file, docType, profileId);
                    if (!success) throw new Error(`Failed to upload ${docType}`);
                }
            };

            // Academic credentials
            await uploadDoc(degreeCertFile, "degreeCertificate");
            await uploadDoc(nyscCertFile, "nyscCertificate");
            await uploadDoc(transcriptFile, "transcript");

            // Professional registration
            await uploadDoc(mrtbLicenseFile, "mrtbLicense");
            await uploadDoc(npaMembershipFile, "npaMembership");
            await uploadDoc(practicingLicenseFile, "practicingLicense");

            // Identity documents
            await uploadDoc(nationalIdFile, "nationalId");
            await uploadDoc(passportPhotoFile, "passportPhoto");
            await uploadDoc(proofOfAddressFile, "proofOfAddress");

            // Legacy: also upload licenseFile and certificates if set
            if (licenseFile) {
                await uploadDocument(licenseFile, "licenseDocument", profileId);
            }
            for (const cert of certificates) {
                await uploadDocument(cert, "additionalCertificate", profileId);
            }

            // If they uploaded a profile photo as a guest, link it to their user record NOW
            if (guestProfilePhotoId && typeof guestProfilePhotoId === 'string') {
                try {
                    await updateProfileImage({ storageId: guestProfilePhotoId as Id<"_storage"> });
                } catch (e: any) {
                    console.error("Failed to link guest profile photo", e);
                    toast.error("Could not link your profile photo. Please upload it again later.");
                }
            }

            // 3. Update Store with all data needed for finalization
            updatePhysiotherapistData({
                ...formData,
                specializations,
            });

            // Clear any saved onboarding data
            try { localStorage.removeItem('physioOnboardingData'); } catch { }

            // 4. Redirect to completion page to handle finalization
            router.push('/onboarding-complete');

        } catch (error: any) {
            console.error("Submission error:", error);
            toast.error(error.message || "Failed to complete onboarding");
            setUploadError(error.message);
        } finally {
            setIsFinalSubmitting(false);
        }
    };

    // --- Skip & Complete Later ---
    const handleSkipAndContinue = async () => {
        const formData = watch();
        setIsSkipping(true);

        if (!isSignedIn) {
            try {
                localStorage.setItem(
                    'physioOnboardingData',
                    JSON.stringify({
                        formData: {
                            firstName: formData.firstName,
                            lastName: formData.lastName,
                            email: formData.email,
                            phoneNumber: formData.phoneNumber,
                            age: formData.age,
                            gender: formData.gender,
                            licenseNumber: formData.licenseNumber,
                            yearsOfExperience: formData.yearsOfExperience,
                            location: formData.location,
                            latitude: formData.latitude,
                            longitude: formData.longitude,
                            dateOfBirth: formData.age ? `${new Date().getFullYear() - formData.age}-01-01` : undefined,
                        },
                        specializations,
                        guestProfilePhotoId,
                        onboardingSkipped: true,
                        timestamp: Date.now(),
                    })
                );
            } catch { }
            toast.info('Create your account to save your profile');
            router.push('/sign-up?redirect=/physiotherapist');
            return;
        }

        try {
            // Save the required data (steps 0-5) to create/update the profile
            await completeUserProfileMutation({
                role: 'physiotherapist',
                profileData: {
                    specializations: specializations.length > 0 ? specializations : undefined,
                    licenseNumber: formData.licenseNumber || undefined,
                    yearsOfExperience: formData.yearsOfExperience || undefined,
                    bio: formData.bio || undefined,
                    location: formData.location || undefined,
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    dateOfBirth: formData.age ? `${new Date().getFullYear() - formData.age}-01-01` : undefined,
                    gender: formData.gender,
                },
                firstName: formData.firstName,
                lastName: formData.lastName,
                finalStep: true,
                onboardingSkipped: true,
            });

            // Update the store
            updatePhysiotherapistData({
                ...formData,
                specializations,
            });

            // Clear any saved localStorage data
            try { localStorage.removeItem('physioOnboardingData'); } catch { }

            toast.success('Profile saved! You can complete the remaining steps from your settings.');
            router.push('/dashboard');
        } catch (error: any) {
            console.error('Skip & continue error:', error);
            toast.error(error.message || 'Failed to save profile. Please try again.');
        } finally {
            setIsSkipping(false);
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

    return (
        <div className="w-full max-w-xl mx-auto px-4 py-6">


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
                        {/* Step 1: Personal Info */}
                        {currentStep === 0 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Personal Information</h2>
                                    <p className="text-gray-500">Let's start with the basics</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>First Name</Label>
                                            <Input {...control.register('firstName')} placeholder="First Name" />
                                            {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Last Name</Label>
                                            <Input {...control.register('lastName')} placeholder="Last Name" />
                                            {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Email</Label>
                                        <Input {...control.register('email')} placeholder="Email" type="email" />
                                        {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Phone Number</Label>
                                        <Input {...control.register('phoneNumber')} placeholder="Phone Number" />
                                        {errors.phoneNumber && <p className="text-xs text-red-500">{errors.phoneNumber.message}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Demographics */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Demographics</h2>
                                    <p className="text-gray-500">Tell us a bit more about yourself</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Age</Label>
                                        <Input
                                            {...control.register('age', { valueAsNumber: true })}
                                            type="number"
                                            min={17}
                                            max={99}
                                            placeholder="Age"
                                            className="h-12"
                                        />
                                        {errors.age && <p className="text-xs text-red-500">{errors.age.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Gender</Label>
                                        <Controller
                                            control={control}
                                            name="gender"
                                            render={({ field }) => (
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <SelectTrigger className="h-12">
                                                        <SelectValue placeholder="Select gender" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="male">Male</SelectItem>
                                                        <SelectItem value="female">Female</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        />
                                        {errors.gender && <p className="text-xs text-red-500">{errors.gender.message}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Professional Info */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Professional Info</h2>
                                    <p className="text-gray-500">Your professional background</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>License Number</Label>
                                        <Input {...control.register('licenseNumber')} placeholder="License Number" className="h-12" />
                                        {errors.licenseNumber && <p className="text-xs text-red-500">{errors.licenseNumber.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Years of Experience</Label>
                                        <Input
                                            {...control.register('yearsOfExperience', { valueAsNumber: true })}
                                            type="number"
                                            placeholder="Years"
                                            className="h-12"
                                        />
                                        {errors.yearsOfExperience && <p className="text-xs text-red-500">{errors.yearsOfExperience.message}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Location */}
                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Practice Location</h2>
                                    <p className="text-gray-500">Pin your practice location on the map</p>
                                </div>
                                <div className="space-y-4">
                                    <MapboxLocationPicker
                                        value={{
                                            location: watch('location') || '',
                                            latitude: watch('latitude'),
                                            longitude: watch('longitude'),
                                        }}
                                        onChange={(data) => {
                                            setValue('location', data.location);
                                            setValue('latitude', data.latitude);
                                            setValue('longitude', data.longitude);
                                        }}
                                    />
                                    {errors.location && <p className="text-xs text-red-500">{errors.location.message}</p>}
                                </div>
                            </div>
                        )}

                        {/* Step 5: Specializations */}
                        {currentStep === 4 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Specializations</h2>
                                    <p className="text-gray-500">What are your areas of expertise?</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex gap-2">
                                        <Select onValueChange={(val) => {
                                            if (!specializations.includes(val)) setSpecializations([...specializations, val]);
                                        }}>
                                            <SelectTrigger className="h-12 flex-1">
                                                <SelectValue placeholder="Select specialization" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Orthopedic">Orthopedic</SelectItem>
                                                <SelectItem value="Neurological">Neurological</SelectItem>
                                                <SelectItem value="Pediatric">Pediatric</SelectItem>
                                                <SelectItem value="Geriatric">Geriatric</SelectItem>
                                                <SelectItem value="Sports">Sports</SelectItem>
                                                <SelectItem value="Cardiovascular">Cardiovascular</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Or type manually..."
                                            value={manualSpecialization}
                                            onChange={(e) => setManualSpecialization(e.target.value)}
                                            className="h-12"
                                        />
                                        <Button type="button" onClick={handleAddSpecialization} className="h-12 w-12 p-0 bg-[#005b57]">
                                            <Plus className="h-5 w-5" />
                                        </Button>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {specializations.map((spec) => (
                                            <div key={spec} className="bg-teal-50 text-teal-800 px-3 py-1 rounded-full flex items-center gap-2 text-sm border border-teal-100">
                                                {spec}
                                                <button type="button" onClick={() => handleRemoveSpecialization(spec)}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 6: Bio & Profile Photo */}
                        {currentStep === 5 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Professional Profile</h2>
                                    <p className="text-gray-500">Tell patients about yourself</p>
                                </div>

                                {/* Profile Photo Section */}
                                <div className="flex flex-col items-center space-y-4 p-6 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="relative group">
                                        <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-4 border-white shadow-md">
                                            {profilePhotoPreviewUrl || currentUser?.imageUrl ? (
                                                <img
                                                    src={profilePhotoPreviewUrl || currentUser?.imageUrl}
                                                    alt="Profile"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                    <Users className="w-10 h-10" />
                                                </div>
                                            )}

                                            {/* Loading Overlay */}
                                            {isProfilePhotoUploading && (
                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                                                </div>
                                            )}
                                        </div>

                                        <label
                                            htmlFor="profile-photo-upload"
                                            className="absolute bottom-0 right-0 bg-[#005b57] text-white p-2 rounded-full shadow-lg cursor-pointer hover:bg-[#00443e] transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            <input
                                                id="profile-photo-upload"
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleProfilePhotoUpload}
                                                disabled={isProfilePhotoUploading}
                                            />
                                        </label>
                                    </div>

                                    <div className="text-center space-y-1">
                                        <h3 className="font-medium text-gray-900">Profile Photo</h3>
                                        <p className="text-xs text-gray-500 max-w-[200px]">
                                            Please use a professional profile photo. This helps build trust with patients.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Professional Bio</Label>
                                        <Textarea
                                            {...control.register('bio')}
                                            placeholder="Write a short bio about your experience, approach to treatment, and what patients can expect..."
                                            className="min-h-[150px] resize-none"
                                        />
                                        {errors.bio && <p className="text-xs text-red-500">{errors.bio.message}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 7: Credentials */}
                        {currentStep === 6 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Credentials</h2>
                                    <p className="text-gray-500">Verify your qualifications</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Certification Board</Label>
                                        <Input {...control.register('certificationBoard')} placeholder="Board Name" className="h-12" />
                                        {errors.certificationBoard && <p className="text-xs text-red-500">{errors.certificationBoard.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Certification Year</Label>
                                            <Input
                                                {...control.register('certificationYear', { valueAsNumber: true })}
                                                type="number"
                                                placeholder="Year"
                                                className="h-12"
                                            />
                                            {errors.certificationYear && <p className="text-xs text-red-500">{errors.certificationYear.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Expiry Date</Label>
                                            <Input {...control.register('licenseExpiryDate')} type="date" className="h-12" />
                                            {errors.licenseExpiryDate && <p className="text-xs text-red-500">{errors.licenseExpiryDate.message}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        )}

                        {/* Step 8: Availability */}
                        {currentStep === 7 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Availability</h2>
                                    <p className="text-gray-500">Set your weekly schedule</p>
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
                                </div>
                            </div>
                        )}

                        {/* Step 9: Documents */}
                        {currentStep === 8 && (
                            <div className="space-y-6">
                                <div className="text-center mb-4">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Required Documents</h2>
                                    <p className="text-gray-500">Upload your professional credentials</p>
                                </div>

                                {/* Academic Credentials */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center text-xs font-bold text-[#005b57]">1</span>
                                        Academic Credentials
                                    </h3>
                                    <div className="space-y-3 pl-8">
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">Degree Certificate (BSc/MSc Physiotherapy) <span className="text-red-500">*</span></Label>
                                            <FileUpload
                                                id="degree-cert-upload"
                                                label="Upload Degree Certificate"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setDegreeCertFile(file as File)}
                                                value={degreeCertFile}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">NYSC Discharge Certificate <span className="text-red-500">*</span></Label>
                                            <FileUpload
                                                id="nysc-cert-upload"
                                                label="Upload NYSC Certificate"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setNyscCertFile(file as File)}
                                                value={nyscCertFile}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">Transcript of Records <span className="text-gray-400 text-xs">(Optional)</span></Label>
                                            <FileUpload
                                                id="transcript-upload"
                                                label="Upload Transcript"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setTranscriptFile(file as File)}
                                                value={transcriptFile}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Professional Registration */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center text-xs font-bold text-[#005b57]">2</span>
                                        Professional Registration
                                    </h3>
                                    <div className="space-y-3 pl-8">
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">
                                                MRTB License{' '}
                                                <span className="text-gray-400 text-xs">(If available)</span>
                                            </Label>
                                            <p className="text-[11px] text-gray-400 leading-snug">
                                                The national license issued by the Medical Rehabilitation Therapists Board (MRTB) of Nigeria.
                                            </p>
                                            <FileUpload
                                                id="mrtb-upload"
                                                label="Upload MRTB License"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setMrtbLicenseFile(file as File)}
                                                value={mrtbLicenseFile}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">
                                                NPA (Nigeria Physiotherapy Association) Membership{' '}
                                                <span className="text-gray-400 text-xs">(If available)</span>
                                            </Label>
                                            <FileUpload
                                                id="npa-upload"
                                                label="Upload NPA Membership"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setNpaMembershipFile(file as File)}
                                                value={npaMembershipFile}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">
                                                Practicing License from Facility{' '}
                                                <span className="text-gray-400 text-xs">(If employed by a clinic or hospital)</span>
                                            </Label>
                                            <p className="text-[11px] text-gray-400 leading-snug">
                                                Only required if you are employed. This is different from your MRTB national license.
                                            </p>
                                            <FileUpload
                                                id="practicing-license-upload"
                                                label="Upload Practicing License"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setPracticingLicenseFile(file as File)}
                                                value={practicingLicenseFile}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Identity */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-[#005b57] uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center text-xs font-bold text-[#005b57]">3</span>
                                        Identity Documents
                                    </h3>
                                    <div className="space-y-3 pl-8">
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">National ID or Driver&apos;s License <span className="text-red-500">*</span></Label>
                                            <FileUpload
                                                id="national-id-upload"
                                                label="Upload National ID"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setNationalIdFile(file as File)}
                                                value={nationalIdFile}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">Passport Photograph <span className="text-red-500">*</span></Label>
                                            <FileUpload
                                                id="passport-photo-upload"
                                                label="Upload Passport Photo"
                                                accept="image/*"
                                                onChange={(file) => setPassportPhotoFile(file as File)}
                                                value={passportPhotoFile}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-sm">Proof of Address <span className="text-gray-400 text-xs">(Optional)</span></Label>
                                            <FileUpload
                                                id="proof-address-upload"
                                                label="Upload Proof of Address"
                                                accept="application/pdf,image/*"
                                                onChange={(file) => setProofOfAddressFile(file as File)}
                                                value={proofOfAddressFile}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 10: Review & Submit */}
                        {currentStep === 9 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Final Step</h2>
                                    <p className="text-gray-500">How did you hear about us?</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <Label>Referral Source</Label>
                                        <Controller
                                            control={control}
                                            name="referralSource"
                                            render={({ field }) => (
                                                <div className="grid grid-cols-3 gap-3">
                                                    {socialOptions.map((option) => {
                                                        const Icon = option.icon;
                                                        const isSelected = field.value === option.label || (option.id === 'other' && !socialOptions.slice(0, 5).some(o => o.label === field.value) && field.value !== '');

                                                        return (
                                                            <div
                                                                key={option.id}
                                                                onClick={() => {
                                                                    if (option.id !== 'other') {
                                                                        field.onChange(option.label);
                                                                    } else {
                                                                        field.onChange(''); // Clear for manual input
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    "flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:border-teal-200 hover:bg-teal-50/50",
                                                                    isSelected ? "border-[#005b57] bg-teal-50 text-[#005b57]" : "border-gray-100 bg-white text-gray-500"
                                                                )}
                                                            >
                                                                <Icon className="w-6 h-6 mb-2" />
                                                                <span className="text-xs font-medium text-center">{option.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        />

                                        {/* Manual Input if "Other" is selected or value doesn't match predefined options */}
                                        {(!socialOptions.slice(0, 5).some(o => o.label === watch('referralSource')) && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="pt-2"
                                            >
                                                <Label className="text-xs text-gray-500 mb-1.5 block">Please specify</Label>
                                                <Input
                                                    placeholder="e.g. Conference, Flyer, etc."
                                                    value={watch('referralSource') === 'Search Engine' || watch('referralSource') === 'Friend/Colleague' || watch('referralSource') === 'X (Twitter)' || watch('referralSource') === 'Instagram' || watch('referralSource') === 'LinkedIn' ? '' : watch('referralSource')}
                                                    onChange={(e) => setValue('referralSource', e.target.value)}
                                                    className="h-11"
                                                />
                                            </motion.div>
                                        ))}

                                        {errors.referralSource && <p className="text-xs text-red-500">{errors.referralSource.message}</p>}
                                    </div>

                                    <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-xl">
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
                                            <Label className="font-medium text-gray-900">
                                                I accept the{' '}
                                                <a href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="text-[#005b57] underline hover:text-[#00443e]">Terms &amp; Conditions</a>
                                                {' '}and{' '}
                                                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-[#005b57] underline hover:text-[#00443e]">Privacy Policy</a>
                                            </Label>
                                            <p className="text-gray-500 text-xs mt-1">Please read and agree before completing your registration.</p>
                                        </div>
                                    </div>
                                    {errors.termsAccepted && <p className="text-xs text-red-500">{errors.termsAccepted.message}</p>}
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

                <div className="flex items-center gap-3">
                    {/* Skip & Complete Later button — shown on optional steps (6-8) */}
                    {currentStep >= SKIPPABLE_FROM_STEP && currentStep < steps.length - 1 && (
                        <Button
                            type="button"
                            onClick={handleSkipAndContinue}
                            disabled={isSkipping || isFinalSubmitting || isUploading}
                            variant="outline"
                            className="h-12 rounded-xl border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-400"
                        >
                            {isSkipping ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    <SkipForward className="w-4 h-4 mr-2" />
                                    Skip & Complete Later
                                </>
                            )}
                        </Button>
                    )}

                    <Button
                        type="button"
                        onClick={nextStep}
                        disabled={isFinalSubmitting || isUploading || isSkipping}
                        className="bg-[#005b57] hover:bg-[#00443e] text-white min-w-[120px] h-12 rounded-xl shadow-lg shadow-teal-900/10"
                    >
                        {isFinalSubmitting || isUploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : currentStep === steps.length - 1 ? (
                            isSignedIn ? 'Complete' : 'Create Account & Complete'
                        ) : (
                            <>
                                Next
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div >
    );
}
