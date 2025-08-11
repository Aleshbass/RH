"use client";

import { z } from "zod";
import { motion } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import OnboardingProgress from "@/components/onboarding/OnboardingProgress";
import { api } from "@/convex/_generated/api";
import { useMutationUntyped } from "@/lib/convexUntyped";

// Form schema for Clinic Owner Personal Info
const clinicOwnerPersonalInfoSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid personal email address"),
  phoneNumber: z.string().min(10, "Please enter a valid personal phone number"),
  // Removed profilePhotoUrl - will be handled by file upload later
  isOwner: z.boolean(),
  positionIfNotOwner: z.string().optional(),
}).refine(data => data.isOwner || !!data.positionIfNotOwner, {
  message: "Position is required if you are not the owner.",
  path: ["positionIfNotOwner"],
});

type ClinicOwnerPersonalInfoValues = z.infer<typeof clinicOwnerPersonalInfoSchema>;

interface ClinicOwnerPersonalInfoFormProps {
  onNext: () => void;
}

export default function ClinicOwnerPersonalInfoForm({ onNext }: ClinicOwnerPersonalInfoFormProps) {
  const { data, updateClinicOwnerData } = useOnboardingStore();
  const { clinicOwnerData } = data;
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const generateUploadUrl = useMutationUntyped((api as any).files.generateUploadUrl);
  const updateProfileImageFromStorage = useMutationUntyped((api as any).users.updateProfileImageFromStorage);

  const {
    control,
    handleSubmit,
    watch, // Added watch here
    formState: { errors, isSubmitting },
  } = useForm<ClinicOwnerPersonalInfoValues>({
    resolver: zodResolver(clinicOwnerPersonalInfoSchema),
    defaultValues: {
      firstName: clinicOwnerData?.firstName || "",
      lastName: clinicOwnerData?.lastName || "",
      email: clinicOwnerData?.email || "", // Personal email
      phoneNumber: clinicOwnerData?.phoneNumber || "", // Personal phone number
      // profilePhotoUrl removed for better UX
      isOwner: clinicOwnerData?.isOwner === undefined ? true : clinicOwnerData.isOwner,
      positionIfNotOwner: clinicOwnerData?.positionIfNotOwner || "",
    },
  });

  const onSubmit = async (values: ClinicOwnerPersonalInfoValues) => {
    try {
      // If a photo was selected, upload to Convex storage and update user image
      if (profilePhoto) {
        const uploadUrl: string = await generateUploadUrl({
          fileType: profilePhoto.type || "application/octet-stream",
          fileName: profilePhoto.name || "profile-photo",
        });

        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": profilePhoto.type || "application/octet-stream" },
          body: profilePhoto,
        });
        if (!res.ok) throw new Error("Failed to upload profile photo");
        const { storageId } = await res.json();

        await updateProfileImageFromStorage({ storageId });
      }

      updateClinicOwnerData({
        // Spread existing data to not lose other parts of clinicOwnerData
        ...clinicOwnerData,
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phoneNumber: values.phoneNumber,
        // profilePhotoUrl removed
        isOwner: values.isOwner,
        positionIfNotOwner: values.isOwner ? undefined : values.positionIfNotOwner,
      });
      onNext();
    } catch (err) {
      console.error("Error saving owner info:", err);
      // Optional: surface UI toast here
    }
  };

  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,

      },
    }),
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl p-10 space-y-8 bg-white rounded-xl shadow-xl"
    >
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[#005b57]">Owner Information</h1>
        <p className="text-gray-600">Tell us a bit about yourself.</p>
        <OnboardingProgress current={data.currentStep} total={4} className="mt-4" />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* First Name */}
        <motion.div custom={0} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
          <Label htmlFor="firstName" className="block text-base font-semibold text-[#002e2c]">First Name *</Label>
          <Controller
            name="firstName"
            control={control}
            render={({ field }) => (
              <Input 
                id="firstName" 
                {...field} 
                placeholder="Enter your first name" 
                className={`h-12 text-base px-4 ${errors.firstName ? "border-red-500" : "border-gray-300"} focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20`} 
              />
            )}
          />
          {errors.firstName && <p className="mt-2 text-sm text-red-500">{errors.firstName.message}</p>}
        </motion.div>

        {/* Last Name */}
        <motion.div custom={1} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
          <Label htmlFor="lastName" className="block text-base font-semibold text-[#002e2c]">Last Name *</Label>
          <Controller
            name="lastName"
            control={control}
            render={({ field }) => (
              <Input 
                id="lastName" 
                {...field} 
                placeholder="Enter your last name" 
                className={`h-12 text-base px-4 ${errors.lastName ? "border-red-500" : "border-gray-300"} focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20`} 
              />
            )}
          />
          {errors.lastName && <p className="mt-2 text-sm text-red-500">{errors.lastName.message}</p>}
        </motion.div>

        {/* Personal Email */}
        <motion.div custom={2} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
          <Label htmlFor="email" className="block text-base font-semibold text-[#002e2c]">Personal Email *</Label>
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input 
                id="email" 
                type="email" 
                {...field} 
                placeholder="Enter your personal email" 
                className={`h-12 text-base px-4 ${errors.email ? "border-red-500" : "border-gray-300"} focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20`} 
              />
            )}
          />
          {errors.email && <p className="mt-2 text-sm text-red-500">{errors.email.message}</p>}
        </motion.div>

        {/* Profile Photo (optional) */}
        <motion.div custom={2.5} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
          <UploadDropzone
            label="Profile Photo (Optional)"
            helperText="PNG or JPG up to 5MB. You can also skip and upload later from your dashboard."
            accept="image/*"
            maxSizeMb={5}
            value={profilePhoto}
            onFileSelected={setProfilePhoto}
            variant="image"
            name="profilePhoto"
            id="profilePhoto"
          />
        </motion.div>

        {/* Personal Phone Number */}
        <motion.div custom={3} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
          <Label htmlFor="phoneNumber" className="block text-base font-semibold text-[#002e2c]">Personal Phone Number *</Label>
          <Controller
            name="phoneNumber"
            control={control}
            render={({ field }) => (
              <Input 
                id="phoneNumber" 
                {...field} 
                placeholder="Enter your personal phone number" 
                className={`h-12 text-base px-4 ${errors.phoneNumber ? "border-red-500" : "border-gray-300"} focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20`} 
              />
            )}
          />
          {errors.phoneNumber && <p className="mt-2 text-sm text-red-500">{errors.phoneNumber.message}</p>}
        </motion.div>

        {/* Is Owner? */}
        <motion.div custom={3.5} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
          <Label className="block text-base font-semibold text-[#002e2c]">Are you the clinic owner? *</Label>
          <Controller
            name="isOwner"
            control={control}
            render={({ field }) => (
              <div className="flex items-center space-x-6 mt-2">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    {...field} 
                    value="true" 
                    checked={field.value === true} 
                    onChange={() => field.onChange(true)} 
                    className="w-5 h-5 text-[#005b57] border-gray-300 focus:ring-[#005b57] focus:ring-2" 
                  />
                  <span className="ml-3 text-base">Yes</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    {...field} 
                    value="false" 
                    checked={field.value === false} 
                    onChange={() => field.onChange(false)} 
                    className="w-5 h-5 text-[#005b57] border-gray-300 focus:ring-[#005b57] focus:ring-2" 
                  />
                  <span className="ml-3 text-base">No</span>
                </label>
              </div>
            )}
          />
        </motion.div>

        {/* Position if Not Owner (Conditional) */}
        {watch("isOwner") === false && (
          <motion.div custom={3.7} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-3">
            <Label htmlFor="positionIfNotOwner" className="block text-base font-semibold text-[#002e2c]">Your Position/Title *</Label>
            <Controller
              name="positionIfNotOwner"
              control={control}
              render={({ field }) => (
                <Input 
                  id="positionIfNotOwner" 
                  {...field} 
                  placeholder="E.g., Clinic Manager, Lead Therapist" 
                  className={`h-12 text-base px-4 ${errors.positionIfNotOwner ? "border-red-500" : "border-gray-300"} focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20`} 
                />
              )}
            />
            {errors.positionIfNotOwner && <p className="mt-2 text-sm text-red-500">{errors.positionIfNotOwner.message}</p>}
          </motion.div>
        )}

        <motion.div custom={4} initial="hidden" animate="visible" variants={fadeInVariants} className="pt-4">
          <Button 
            type="submit" 
            disabled={isSubmitting} 
            className="w-full h-12 text-base font-semibold bg-[#005b57] text-white hover:bg-[#00443e] transition-colors duration-200"
          >
            {isSubmitting ? "Saving..." : "Continue to Clinic Information"}
          </Button>
        </motion.div>
      </form>
    </motion.div>
  );
}
