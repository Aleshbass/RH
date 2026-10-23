"use client";

import { z } from "zod";
import { motion } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useState } from "react";
import { UploadDropzone } from "@/components/ui/UploadDropzone";
import { api } from "@/convex/_generated/api";
import { useMutationUntyped } from "@/lib/convexUntyped";
import { ChevronRight } from "@/components/icons";

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
  const generateUploadUrl = useMutationUntyped((api as unknown as { files: { generateUploadUrl: unknown } }).files.generateUploadUrl);
  const updateProfileImageFromStorage = useMutationUntyped((api as unknown as { users: { updateProfileImageFromStorage: unknown } }).users.updateProfileImageFromStorage);

  const {
    control,
    handleSubmit,
    watch,
    register,
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

  const inputClasses = "block w-full h-14 px-4 pt-5 pb-2 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 peer placeholder-transparent";
  const labelClasses = "absolute text-sm text-gray-500 duration-200 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-[#005b57]";

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 sm:pb-0">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 sm:space-y-8">
        <div className="text-center mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-[#002e2c]">Owner Information</h2>
          <p className="text-gray-600">Tell us a bit about yourself.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
          {/* First Name */}
          <div className="space-y-1">
            <div className="relative">
              <input
                id="firstName"
                type="text"
                placeholder="First Name"
                className={`${inputClasses} ${errors.firstName ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('firstName')}
              />
              <label htmlFor="firstName" className={labelClasses}>
                First Name
              </label>
            </div>
            {errors.firstName && (
              <p className="text-xs text-red-500 ml-1">{errors.firstName.message}</p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-1">
            <div className="relative">
              <input
                id="lastName"
                type="text"
                placeholder="Last Name"
                className={`${inputClasses} ${errors.lastName ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('lastName')}
              />
              <label htmlFor="lastName" className={labelClasses}>
                Last Name
              </label>
            </div>
            {errors.lastName && (
              <p className="text-xs text-red-500 ml-1">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Personal Email */}
        <div className="space-y-1">
          <div className="relative">
            <input
              id="email"
              type="email"
              placeholder="Personal Email"
              className={`${inputClasses} ${errors.email ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
              {...register('email')}
            />
            <label htmlFor="email" className={labelClasses}>
              Personal Email
            </label>
          </div>
          {errors.email && (
            <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>
          )}
        </div>

        {/* Personal Phone Number */}
        <div className="space-y-1">
          <div className="relative">
            <input
              id="phoneNumber"
              type="tel"
              placeholder="Personal Phone Number"
              className={`${inputClasses} ${errors.phoneNumber ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
              {...register('phoneNumber')}
            />
            <label htmlFor="phoneNumber" className={labelClasses}>
              Personal Phone Number
            </label>
          </div>
          {errors.phoneNumber && (
            <p className="text-xs text-red-500 ml-1">{errors.phoneNumber.message}</p>
          )}
        </div>

        {/* Profile Photo (optional) */}
        <div className="space-y-3">
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
        </div>

        {/* Is Owner? */}
        <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
          <label className="block text-sm font-medium text-[#002e2c]">Are you the clinic owner?</label>
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
                  <span className="ml-3 text-sm font-medium text-gray-700">Yes</span>
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
                  <span className="ml-3 text-sm font-medium text-gray-700">No</span>
                </label>
              </div>
            )}
          />
        </div>

        {/* Position if Not Owner (Conditional) */}
        {watch("isOwner") === false && (
          <div className="space-y-1">
            <div className="relative">
              <input
                id="positionIfNotOwner"
                type="text"
                placeholder="Your Position/Title"
                className={`${inputClasses} ${errors.positionIfNotOwner ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('positionIfNotOwner')}
              />
              <label htmlFor="positionIfNotOwner" className={labelClasses}>
                Your Position/Title
              </label>
            </div>
            {errors.positionIfNotOwner && (
              <p className="text-xs text-red-500 ml-1">{errors.positionIfNotOwner.message}</p>
            )}
          </div>
        )}

        {/* Sticky Mobile / Regular Desktop Buttons */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 sm:static sm:bg-transparent sm:border-0 sm:p-0 z-40">
          <div className="max-w-4xl mx-auto w-full">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto sm:min-w-[200px] h-14 sm:h-12 flex items-center justify-center gap-2 text-base sm:text-sm font-semibold bg-[#005b57] text-white rounded-xl sm:rounded-lg hover:bg-[#00443e] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 shadow-lg sm:shadow-none ml-auto"
            >
              {isSubmitting ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Continue to Clinic Information
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
