'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Loader2, Upload, Twitter, Instagram, Linkedin, Globe, Users, Search as SearchIcon } from 'lucide-react';
import OnboardingSuccessModal from '@/components/onboarding/common/OnboardingSuccessModal';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/ui/file-upload';
import LocationSearch from '@/components/marketplace/LocationSearch';
import { useClinicDocuments } from '@/lib/hooks/useClinicDocuments';
import { cn } from '@/lib/utils';
import { Id } from '@/convex/_generated/dataModel';
import { useMutationUntyped } from '@/lib/convexUntyped';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { TagInput } from '@/components/ui/tag-input';
import { Copy, Plus, X } from 'lucide-react';
import { AvailabilityScheduler } from '@/components/onboarding/common/AvailabilityScheduler';
import { useFileUpload } from '@/lib/hooks/useFileUpload';

// --- Schemas ---

const personalInfoBaseSchema = z.object({
    firstName: z.string().min(2, "First name must be at least 2 characters"),
    lastName: z.string().min(2, "Last name must be at least 2 characters"),
    email: z.string().email("Please enter a valid personal email address"),
    phoneNumber: z.string().min(10, "Please enter a valid personal phone number"),
    yearsInBusiness: z.number().min(0, "Years cannot be negative").max(150, "Please enter a valid number of years"),
    isOwner: z.boolean(),
    positionIfNotOwner: z.string().optional(),
});

const personalInfoSchema = personalInfoBaseSchema.refine(data => data.isOwner || !!data.positionIfNotOwner, {
    message: "Position is required if you are not the owner.",
    path: ["positionIfNotOwner"],
});

const clinicInfoSchema = z.object({
    clinicName: z.string().min(2, "Clinic name must be at least 2 characters"),
    registrationNumber: z.string().min(2, "Registration number is required"),
    clinicType: z.string().min(2, "Please select a clinic type"),
    yearEstablished: z.number().min(1900, "Please enter a valid year"),
});

const contactInfoSchema = z.object({
    clinicEmail: z.string().email("Please enter a valid clinic email address"),
    clinicPhone: z.string().min(10, "Please enter a valid clinic phone number"),
    website: z.string().optional(),
});

const addressSchema = z.object({
    clinicLocation: z.string().optional(), // For LocationSearch
    address: z.string().min(5, "Please enter a valid address"),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
});

const servicesSchema = z.object({
    services: z.array(z.string()).min(1, 'Please select at least one service'),
    specialties: z.array(z.string()).min(1, 'Please select at least one specialty'),
});

const facilitiesSchema = z.object({
    facilities: z.array(z.string()).min(1, 'Please select at least one facility'),
    equipmentAvailable: z.array(z.string()).optional(),
});

const operationsSchema = z.object({
    operatingHours: z.any(), // Structured object
    additionalNotes: z.string().optional(),
});

const documentsSchema = z.object({
    referralSource: z.string().min(1, "Please tell us how you heard about us"),
    acceptTerms: z.boolean().refine(val => val === true, {
        message: "You must accept the terms and conditions"
    }),
});

// Combined Schema
const fullSchema = z.object({
    ...personalInfoBaseSchema.shape,
    ...clinicInfoSchema.shape,
    ...contactInfoSchema.shape,
    ...addressSchema.shape,
    ...servicesSchema.shape,
    ...facilitiesSchema.shape,
    ...operationsSchema.shape,
    ...documentsSchema.shape,
}).refine(data => data.isOwner || !!data.positionIfNotOwner, {
    message: "Position is required if you are not the owner.",
    path: ["positionIfNotOwner"],
});

type FormValues = z.infer<typeof fullSchema>;

// --- Steps Configuration ---

const steps = [
    { id: 'personal', title: 'Owner Info' },
    { id: 'clinic', title: 'Clinic Details' },
    { id: 'contact', title: 'Contact Info' },
    { id: 'address', title: 'Location' },
    { id: 'services', title: 'Services' },
    { id: 'facilities', title: 'Facilities' },
    { id: 'operations', title: 'Operations' },
    { id: 'documents', title: 'Documents' },
    { id: 'review', title: 'Review & Submit' },
];

export default function ClinicOwnerOnboardingWizard() {
    const router = useRouter();
    const { data, updateClinicOwnerData, setActualClinicId, completeOnboarding } = useOnboardingStore();
    const { clinicOwnerData, actualClinicId } = data;
    const currentUser = useQuery(api.users.getMyUser);

    const createClinicMutation = useMutation(api.clinics.createClinic);
    const completeUserProfileMutation = useMutation(api.users.completeUserProfile);
    const generateUploadUrl = useMutationUntyped((api as unknown as { files: { generateUploadUrl: unknown } }).files.generateUploadUrl);


    const [currentStep, setCurrentStep] = useState(0);
    const [direction, setDirection] = useState(0);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);


    // Document State
    const [businessLicense, setBusinessLicense] = useState<File[]>([]);
    const [taxRegistration, setTaxRegistration] = useState<File[]>([]);
    const [insuranceProof, setInsuranceProof] = useState<File[]>([]);
    const [ownerIdentification, setOwnerIdentification] = useState<File[]>([]);
    const [additionalDocuments, setAdditionalDocuments] = useState<File[]>([]);

    // Clinic Images State
    const [clinicImageOutside, setClinicImageOutside] = useState<File | null>(null);
    const [clinicImageInside, setClinicImageInside] = useState<File | null>(null);

    // Profile Photo Upload
    const updateProfileImage = useMutation(api.users.updateProfileImageFromStorage);
    const { uploadFile: uploadProfilePhoto, isUploading: isProfilePhotoUploading } = useFileUpload();

    const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const { storageId } = await uploadProfilePhoto(file);
            if (storageId) {
                await updateProfileImage({ storageId });
                toast.success("Profile photo updated successfully");
            }
        } catch (error) {
            console.error("Failed to upload profile photo:", error);
            toast.error("Failed to upload profile photo");
        }
    };

    const { uploadClinicDocument } = useClinicDocuments({ clinicId: actualClinicId as Id<"clinics"> });

    const { control, handleSubmit, trigger, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
        resolver: zodResolver(fullSchema),
        mode: 'onChange',
        defaultValues: {
            firstName: clinicOwnerData.firstName || '',
            lastName: clinicOwnerData.lastName || '',
            email: clinicOwnerData.email || '',
            phoneNumber: clinicOwnerData.phoneNumber || '',
            yearsInBusiness: clinicOwnerData.yearsInBusiness || undefined,
            isOwner: clinicOwnerData.isOwner ?? true,
            positionIfNotOwner: clinicOwnerData.positionIfNotOwner || '',

            clinicName: clinicOwnerData.clinicName || '',
            registrationNumber: clinicOwnerData.registrationNumber || '',
            clinicType: clinicOwnerData.clinicType || '',
            yearEstablished: clinicOwnerData.yearEstablished || new Date().getFullYear(),

            clinicEmail: clinicOwnerData.clinicEmail || '',
            clinicPhone: clinicOwnerData.clinicPhone || '',
            website: clinicOwnerData.website || '',

            address: clinicOwnerData.address || '',
            clinicLocation: clinicOwnerData.clinicLocation || '',
            city: clinicOwnerData.city || '',
            state: clinicOwnerData.state || '',

            services: clinicOwnerData.services || [],
            specialties: clinicOwnerData.specialties || [],
            facilities: clinicOwnerData.facilities || [],
            equipmentAvailable: clinicOwnerData.equipmentAvailable || [],

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

    // Simulate loading for availability step
    useEffect(() => {
        if (currentStep === 6) { // Operations step
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
            case 0: fieldsToValidate = ['firstName', 'lastName', 'email', 'phoneNumber', 'yearsInBusiness', 'isOwner', 'positionIfNotOwner']; break;
            case 1: fieldsToValidate = ['clinicName', 'registrationNumber', 'clinicType', 'yearEstablished']; break;
            case 2: fieldsToValidate = ['clinicEmail', 'clinicPhone', 'website']; break;
            case 3: fieldsToValidate = ['address', 'city', 'state']; break;
            case 4: fieldsToValidate = ['services', 'specialties']; break;
            case 5: fieldsToValidate = ['facilities', 'equipmentAvailable']; break;
            case 6: fieldsToValidate = ['operatingHours', 'additionalNotes']; break;
            case 7:
                if (businessLicense.length === 0 || taxRegistration.length === 0 || insuranceProof.length === 0 || ownerIdentification.length === 0) {
                    toast.error("Please upload all required documents");
                    return;
                }
                break;
            case 8: fieldsToValidate = ['referralSource', 'acceptTerms']; break;
        }

        if (currentStep !== 7) {
            const isStepValid = await trigger(fieldsToValidate);
            if (!isStepValid) return;
        }

        // Special handling for clinic creation after step 3 (Address)
        if (currentStep === 3 && !actualClinicId) {
            const values = watch();
            try {
                const result = await createClinicMutation({
                    name: values.clinicName,
                    address: values.address,
                    city: values.city,
                    contactEmail: values.clinicEmail,
                    contactPhone: values.clinicPhone,
                });
                if (result.success && result.clinicId) {
                    setActualClinicId(result.clinicId);
                } else {
                    toast.error("Failed to create clinic record");
                    return;
                }
            } catch (error) {
                console.error("Clinic creation error:", error);
                toast.error("Failed to create clinic record");
                return;
            }
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

    const handleFinalSubmit = async () => {
        const formData = watch();

        try {
            // Helper to upload image and get storageId
            const uploadImage = async (file: File) => {
                const uploadUrl = await generateUploadUrl({
                    fileType: file.type || "application/octet-stream",
                    fileName: file.name,
                });
                const res = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": file.type || "application/octet-stream" },
                    body: file,
                });
                if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
                const { storageId } = await res.json();
                return storageId;
            };

            let outsideImageId, insideImageId;
            if (clinicImageOutside) outsideImageId = await uploadImage(clinicImageOutside);
            if (clinicImageInside) insideImageId = await uploadImage(clinicImageInside);

            // Ensure clinic exists
            let clinicId = actualClinicId;
            if (!clinicId) {
                console.log("Clinic ID missing, creating clinic...");
                const result = await createClinicMutation({
                    name: formData.clinicName,
                    address: formData.address,
                    city: formData.city,
                    contactEmail: formData.clinicEmail,
                    contactPhone: formData.clinicPhone,
                });
                if (result.success && result.clinicId) {
                    clinicId = result.clinicId;
                    setActualClinicId(result.clinicId);
                } else {
                    throw new Error("Failed to create clinic record");
                }
            }

            // 2. Upload Documents
            if (clinicId) {
                const uploadPromises = [
                    ...businessLicense.map(f => uploadClinicDocument(f, "businessLicense", clinicId!)),
                    ...taxRegistration.map(f => uploadClinicDocument(f, "taxRegistration", clinicId!)),
                    ...insuranceProof.map(f => uploadClinicDocument(f, "insuranceProof", clinicId!)),
                    ...ownerIdentification.map(f => uploadClinicDocument(f, "ownerIdentification", clinicId!)),
                    ...additionalDocuments.map(f => uploadClinicDocument(f, "additionalDocument", clinicId!)),
                ];

                await Promise.all(uploadPromises);
            }



            // 3. Submit Profile Data
            await completeUserProfileMutation({
                role: "clinic_owner",
                profileData: {
                    referralSource: formData.referralSource,
                    yearsInBusiness: formData.yearsInBusiness,
                    gender: 'prefer_not_to_say', // Default or add to form if needed
                    clinicLocation: formData.clinicLocation,
                    clinicImageOutside: outsideImageId,
                    clinicImageInside: insideImageId,
                },
                firstName: formData.firstName,
                lastName: formData.lastName,
                finalStep: true,
            });

            // 4. Show Success Modal FIRST
            setShowSuccessModal(true);

            // 5. Update Store & Complete Onboarding (Delayed to allow modal to appear)
            // We don't want to trigger the layout redirect immediately
            updateClinicOwnerData({
                ...formData,
                onboardingCompleted: true,
            });
            completeOnboarding();

            // The modal's onContinue will handle the redirect
            // router.push('/dashboard'); 


        } catch (error: any) {
            console.error("Submission error:", error);
            toast.error(error.message || "Failed to complete onboarding");
        }
    };

    // Animation variants
    const variants = {
        enter: (direction: number) => ({ x: direction > 0 ? 20 : -20, opacity: 0 }),
        center: { zIndex: 1, x: 0, opacity: 1 },
        exit: (direction: number) => ({ zIndex: 0, x: direction < 0 ? 20 : -20, opacity: 0 }),
    };

    const serviceOptions = ['Physical Therapy', 'Occupational Therapy', 'Speech Therapy', 'Massage Therapy', 'Chiropractic Care', 'Sports Medicine'];
    const specialtyOptions = ['Back & Neck Pain', 'Sports Injuries', 'Post-Surgical', 'Stroke Rehab', 'Balance & Vestibular', 'Orthopedic'];
    const facilityOptions = ['Private Rooms', 'Open Gym', 'Hydrotherapy Pool', 'Accessible Entrance', 'Parking', 'Waiting Area'];

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
            <OnboardingSuccessModal
                isOpen={showSuccessModal}
                userRole="clinic_owner"
                onContinue={() => router.push('/dashboard')}
            />
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
                        {/* Step 1: Owner Info */}
                        {currentStep === 0 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Owner Information</h2>
                                    <p className="text-gray-500">Tell us about yourself</p>
                                </div>

                                {/* Profile Photo Section */}
                                <div className="flex flex-col items-center space-y-4 p-6 bg-gray-50 rounded-xl border border-gray-100 mb-6">
                                    <div className="relative group">
                                        <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-4 border-white shadow-md">
                                            {currentUser?.data?.imageUrl ? (
                                                <img
                                                    src={currentUser.data.imageUrl}
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
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>First Name</Label>
                                            <Input {...control.register('firstName')} placeholder="First Name" />
                                            {errors.firstName && <p className="text-red-500 text-sm">{errors.firstName.message as string}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Last Name</Label>
                                            <Input {...control.register('lastName')} placeholder="Last Name" />
                                            {errors.lastName && <p className="text-red-500 text-sm">{errors.lastName.message as string}</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Personal Email</Label>
                                        <Input {...control.register('email')} placeholder="Email" type="email" />
                                        {errors.email && <p className="text-red-500 text-sm">{errors.email.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Personal Phone</Label>
                                        <Input {...control.register('phoneNumber')} placeholder="Phone Number" />
                                        {errors.phoneNumber && <p className="text-red-500 text-sm">{errors.phoneNumber.message as string}</p>}
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="yearsInBusiness">Years of Operation</Label>
                                        <Input
                                            id="yearsInBusiness"
                                            type="number"
                                            placeholder="e.g. 5"
                                            {...control.register("yearsInBusiness", { valueAsNumber: true })}
                                            className={cn("h-12 rounded-xl", errors.yearsInBusiness && "border-red-500")}
                                        />
                                        {errors.yearsInBusiness && <p className="text-red-500 text-sm">{errors.yearsInBusiness.message as string}</p>}
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
                                            <Label>Your Position</Label>
                                            <Input {...control.register('positionIfNotOwner')} placeholder="e.g. Manager" />
                                            {errors.positionIfNotOwner && <p className="text-red-500 text-sm">{errors.positionIfNotOwner.message as string}</p>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Clinic Details */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Clinic Details</h2>
                                    <p className="text-gray-500">Basic information about your clinic</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Clinic Name</Label>
                                        <Input {...control.register('clinicName')} placeholder="Clinic Name" />
                                        {errors.clinicName && <p className="text-xs text-red-500">{errors.clinicName.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Registration Number</Label>
                                        <Input {...control.register('registrationNumber')} placeholder="Reg. Number" />
                                        {errors.registrationNumber && <p className="text-xs text-red-500">{errors.registrationNumber.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Clinic Type</Label>
                                        <Select onValueChange={(val) => setValue('clinicType', val)} defaultValue={watch('clinicType')}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Private Clinic">Private Clinic</SelectItem>
                                                <SelectItem value="Hospital">Hospital</SelectItem>
                                                <SelectItem value="Rehab Center">Rehab Center</SelectItem>
                                                <SelectItem value="Other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {errors.clinicType && <p className="text-xs text-red-500">{errors.clinicType.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Year Established</Label>
                                        <Input {...control.register('yearEstablished', { valueAsNumber: true })} type="number" placeholder="Year" />
                                        {errors.yearEstablished && <p className="text-xs text-red-500">{errors.yearEstablished.message as string}</p>}
                                    </div>

                                </div>

                                <div className="space-y-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <UploadDropzone
                                            label="Clinic Outside Picture"
                                            value={clinicImageOutside}
                                            onFileSelected={setClinicImageOutside}
                                            maxSizeMb={10}
                                            variant="image"
                                            name="clinicImageOutside"
                                            id="clinicImageOutside"
                                        />
                                        <UploadDropzone
                                            label="Clinic Inside Picture"
                                            value={clinicImageInside}
                                            onFileSelected={setClinicImageInside}
                                            maxSizeMb={10}
                                            variant="image"
                                            name="clinicImageInside"
                                            id="clinicImageInside"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Contact Info */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Contact Info</h2>
                                    <p className="text-gray-500">How can patients reach the clinic?</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Clinic Email</Label>
                                        <Input {...control.register('clinicEmail')} type="email" placeholder="Clinic Email" />
                                        {errors.clinicEmail && <p className="text-xs text-red-500">{errors.clinicEmail.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Clinic Phone</Label>
                                        <Input {...control.register('clinicPhone')} placeholder="Clinic Phone" />
                                        {errors.clinicPhone && <p className="text-xs text-red-500">{errors.clinicPhone.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Website (Optional)</Label>
                                        <Input {...control.register('website')} placeholder="https://..." />
                                        {errors.website && <p className="text-xs text-red-500">{errors.website.message as string}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Location */}
                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Location</h2>
                                    <p className="text-gray-500">Where is the clinic located?</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Search Location</Label>
                                        <LocationSearch
                                            value={watch('clinicLocation') || ''}
                                            onChange={(val) => setValue('clinicLocation', val)}
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Address</Label>
                                        <Input {...control.register('address')} placeholder="Street Address" />
                                        {errors.address && <p className="text-xs text-red-500">{errors.address.message as string}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>City</Label>
                                            <Input {...control.register('city')} placeholder="City" />
                                            {errors.city && <p className="text-xs text-red-500">{errors.city.message as string}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>State</Label>
                                            <Input {...control.register('state')} placeholder="State" />
                                            {errors.state && <p className="text-xs text-red-500">{errors.state.message as string}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 5: Services */}
                        {currentStep === 4 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Services</h2>
                                    <p className="text-gray-500">What do you offer?</p>
                                </div>
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <Label>Services Offered</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {serviceOptions.map(opt => (
                                                <div key={opt} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`srv-${opt}`}
                                                        checked={watch('services')?.includes(opt)}
                                                        onCheckedChange={(checked) => {
                                                            const current = watch('services') || [];
                                                            setValue('services', checked ? [...current, opt] : current.filter(s => s !== opt));
                                                        }}
                                                    />
                                                    <label htmlFor={`srv-${opt}`} className="text-sm cursor-pointer">{opt}</label>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3">
                                            <Label className="text-xs text-gray-500">Other Services</Label>
                                            <TagInput
                                                placeholder="Type and press Enter..."
                                                tags={watch('services').filter(s => !serviceOptions.includes(s))}
                                                setTags={(newTags) => {
                                                    const current = watch('services').filter(s => serviceOptions.includes(s));
                                                    setValue('services', [...current, ...newTags]);
                                                }}
                                            />
                                        </div>
                                        {errors.services && <p className="text-xs text-red-500">{errors.services.message as string}</p>}
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Specialties</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {specialtyOptions.map(opt => (
                                                <div key={opt} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`spec-${opt}`}
                                                        checked={watch('specialties')?.includes(opt)}
                                                        onCheckedChange={(checked) => {
                                                            const current = watch('specialties') || [];
                                                            setValue('specialties', checked ? [...current, opt] : current.filter(s => s !== opt));
                                                        }}
                                                    />
                                                    <label htmlFor={`spec-${opt}`} className="text-sm cursor-pointer">{opt}</label>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3">
                                            <Label className="text-xs text-gray-500">Other Specialties</Label>
                                            <TagInput
                                                placeholder="Type and press Enter..."
                                                tags={watch('specialties').filter(s => !specialtyOptions.includes(s))}
                                                setTags={(newTags) => {
                                                    const current = watch('specialties').filter(s => specialtyOptions.includes(s));
                                                    setValue('specialties', [...current, ...newTags]);
                                                }}
                                            />
                                        </div>
                                        {errors.specialties && <p className="text-xs text-red-500">{errors.specialties.message as string}</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 6: Facilities */}
                        {currentStep === 5 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Facilities</h2>
                                    <p className="text-gray-500">Your clinic amenities</p>
                                </div>
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <Label>Facilities Available</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {facilityOptions.map(opt => (
                                                <div key={opt} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`fac-${opt}`}
                                                        checked={watch('facilities')?.includes(opt)}
                                                        onCheckedChange={(checked) => {
                                                            const current = watch('facilities') || [];
                                                            setValue('facilities', checked ? [...current, opt] : current.filter(s => s !== opt));
                                                        }}
                                                    />
                                                    <label htmlFor={`fac-${opt}`} className="text-sm cursor-pointer">{opt}</label>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3">
                                            <Label className="text-xs text-gray-500">Other Facilities</Label>
                                            <TagInput
                                                placeholder="Type and press Enter..."
                                                tags={watch('facilities').filter(f => !facilityOptions.includes(f))}
                                                setTags={(newTags) => {
                                                    const current = watch('facilities').filter(f => facilityOptions.includes(f));
                                                    setValue('facilities', [...current, ...newTags]);
                                                }}
                                            />
                                        </div>
                                        {errors.facilities && <p className="text-xs text-red-500">{errors.facilities.message as string}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Equipment (Optional)</Label>
                                        <TagInput
                                            placeholder="Type and press Enter to add equipment..."
                                            tags={watch('equipmentAvailable') || []}
                                            setTags={(tags) => setValue('equipmentAvailable', tags)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 7: Operations */}
                        {currentStep === 6 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Set your availability</h2>
                                    <p className="text-gray-500">Define ranges of time when you are available.</p>
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
                                        <Label>Additional Notes (Optional)</Label>
                                        <Textarea {...control.register('additionalNotes')} placeholder="Any other info..." />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 8: Documents */}
                        {currentStep === 7 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Documents</h2>
                                    <p className="text-gray-500">Upload verification documents</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Business License *</Label>
                                        <FileUpload id="doc-license" label="Upload" accept="application/pdf,image/*" multiple onChange={(f) => setBusinessLicense((Array.isArray(f) ? f : [f]).filter((file): file is File => file !== null))} value={businessLicense} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tax Registration *</Label>
                                        <FileUpload id="doc-tax" label="Upload" accept="application/pdf,image/*" multiple onChange={(f) => setTaxRegistration((Array.isArray(f) ? f : [f]).filter((file): file is File => file !== null))} value={taxRegistration} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Insurance Proof *</Label>
                                        <FileUpload id="doc-insurance" label="Upload" accept="application/pdf,image/*" multiple onChange={(f) => setInsuranceProof((Array.isArray(f) ? f : [f]).filter((file): file is File => file !== null))} value={insuranceProof} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Owner ID *</Label>
                                        <FileUpload id="doc-id" label="Upload" accept="application/pdf,image/*" multiple onChange={(f) => setOwnerIdentification((Array.isArray(f) ? f : [f]).filter((file): file is File => file !== null))} value={ownerIdentification} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Additional (Optional)</Label>
                                        <FileUpload id="doc-add" label="Upload" accept="application/pdf,image/*" multiple onChange={(f) => setAdditionalDocuments((Array.isArray(f) ? f : [f]).filter((file): file is File => file !== null))} value={additionalDocuments} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 9: Review */}
                        {currentStep === 8 && (
                            <div className="space-y-6">
                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-[#002e2c]">Review & Submit</h2>
                                    <p className="text-gray-500">Finalize your registration</p>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-3">
                                        <Label>How did you hear about us?</Label>
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

                                        {errors.referralSource && <p className="text-xs text-red-500">{errors.referralSource.message as string}</p>}
                                    </div>
                                    <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-xl">
                                        <Controller
                                            control={control}
                                            name="acceptTerms"
                                            render={({ field }) => (
                                                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                                            )}
                                        />
                                        <div className="text-sm">
                                            <Label>I accept the terms and conditions</Label>
                                        </div>
                                    </div>
                                    {errors.acceptTerms && <p className="text-xs text-red-500">{errors.acceptTerms.message as string}</p>}
                                </div>
                            </div>
                        )}

                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation Buttons */}
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
                    disabled={isSubmitting}
                    className="bg-[#005b57] hover:bg-[#00443e] text-white min-w-[120px] h-12 rounded-xl shadow-lg shadow-teal-900/10"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : currentStep === steps.length - 1 ? (
                        'Complete'
                    ) : (
                        <>
                            Next
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </>
                    )}
                </Button>
            </div>
        </div >
    );
}
