"use client";

import { z } from "zod";
import { motion } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Image from "next/image";

// Form schema for Clinic Owner Personal Info
const clinicOwnerPersonalInfoSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Please enter a valid personal email address"),
  phoneNumber: z.string().min(10, "Please enter a valid personal phone number"),
  profilePhotoUrl: z.string().url({ message: "Please enter a valid URL or leave empty." }).optional().or(z.literal('')) ,
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
      profilePhotoUrl: clinicOwnerData?.profilePhotoUrl || "",
      isOwner: clinicOwnerData?.isOwner === undefined ? true : clinicOwnerData.isOwner,
      positionIfNotOwner: clinicOwnerData?.positionIfNotOwner || "",
    },
  });

  const onSubmit = (values: ClinicOwnerPersonalInfoValues) => {
    updateClinicOwnerData({
      // Spread existing data to not lose other parts of clinicOwnerData
      ...clinicOwnerData,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phoneNumber: values.phoneNumber,
      profilePhotoUrl: values.profilePhotoUrl,
      isOwner: values.isOwner,
      positionIfNotOwner: values.isOwner ? undefined : values.positionIfNotOwner,
    });
    onNext();
  };

  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: "easeOut",
      },
    }),
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.5 }}
      className="w-full max-w-lg p-8 space-y-6 bg-white rounded-lg shadow-xl"
    >
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[#005b57]">Owner Information</h1>
        <p className="text-gray-600">Tell us a bit about yourself.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* First Name */}
        <motion.div custom={0} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
          <Label htmlFor="firstName" className="block text-sm font-medium text-[#002e2c]">First Name *</Label>
          <Controller
            name="firstName"
            control={control}
            render={({ field }) => (
              <Input id="firstName" {...field} placeholder="Enter your first name" className={errors.firstName ? "border-red-500" : ""} />
            )}
          />
          {errors.firstName && <p className="mt-1 text-sm text-red-500">{errors.firstName.message}</p>}
        </motion.div>

        {/* Last Name */}
        <motion.div custom={1} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
          <Label htmlFor="lastName" className="block text-sm font-medium text-[#002e2c]">Last Name *</Label>
          <Controller
            name="lastName"
            control={control}
            render={({ field }) => (
              <Input id="lastName" {...field} placeholder="Enter your last name" className={errors.lastName ? "border-red-500" : ""} />
            )}
          />
          {errors.lastName && <p className="mt-1 text-sm text-red-500">{errors.lastName.message}</p>}
        </motion.div>

        {/* Personal Email */}
        <motion.div custom={2} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
          <Label htmlFor="email" className="block text-sm font-medium text-[#002e2c]">Personal Email *</Label>
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <Input id="email" type="email" {...field} placeholder="Enter your personal email" className={errors.email ? "border-red-500" : ""} />
            )}
          />
          {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>}
        </motion.div>

        {/* Profile Photo URL (Can be enhanced with actual upload later) */}
        <motion.div custom={2.5} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
          <Label htmlFor="profilePhotoUrl" className="block text-sm font-medium text-[#002e2c]">Profile Photo URL (Optional)</Label>
          <Controller
            name="profilePhotoUrl"
            control={control}
            render={({ field }) => (
              <Input id="profilePhotoUrl" {...field} placeholder="Enter URL to profile photo" className={errors.profilePhotoUrl ? "border-red-500" : ""} />
            )}
          />
          {errors.profilePhotoUrl && <p className="mt-1 text-sm text-red-500">{errors.profilePhotoUrl.message}</p>}
          {/* Display image if URL exists */}
          {watch("profilePhotoUrl") && (
            <Image src={watch("profilePhotoUrl")!} alt="Profile Preview" width={96} height={96} className="mt-2 rounded-full object-cover" />
          )}
        </motion.div>

        {/* Personal Phone Number */}
        <motion.div custom={3} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
          <Label htmlFor="phoneNumber" className="block text-sm font-medium text-[#002e2c]">Personal Phone Number *</Label>
          <Controller
            name="phoneNumber"
            control={control}
            render={({ field }) => (
              <Input id="phoneNumber" {...field} placeholder="Enter your personal phone number" className={errors.phoneNumber ? "border-red-500" : ""} />
            )}
          />
          {errors.phoneNumber && <p className="mt-1 text-sm text-red-500">{errors.phoneNumber.message}</p>}
        </motion.div>

        {/* Is Owner? */}
        <motion.div custom={3.5} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
          <Label className="block text-sm font-medium text-[#002e2c]">Are you the clinic owner? *</Label>
          <Controller
            name="isOwner"
            control={control}
            render={({ field }) => (
              <div className="flex items-center space-x-4 mt-1">
                <label className="flex items-center">
                  <input type="radio" {...field} value="true" checked={field.value === true} onChange={() => field.onChange(true)} className="form-radio" />
                  <span className="ml-2">Yes</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" {...field} value="false" checked={field.value === false} onChange={() => field.onChange(false)} className="form-radio" />
                  <span className="ml-2">No</span>
                </label>
              </div>
            )}
          />
        </motion.div>

        {/* Position if Not Owner (Conditional) */}
        {watch("isOwner") === false && (
          <motion.div custom={3.7} initial="hidden" animate="visible" variants={fadeInVariants} className="space-y-2">
            <Label htmlFor="positionIfNotOwner" className="block text-sm font-medium text-[#002e2c]">Your Position/Title *</Label>
            <Controller
              name="positionIfNotOwner"
              control={control}
              render={({ field }) => (
                <Input id="positionIfNotOwner" {...field} placeholder="E.g., Clinic Manager, Lead Therapist" className={errors.positionIfNotOwner ? "border-red-500" : ""} />
              )}
            />
            {errors.positionIfNotOwner && <p className="mt-1 text-sm text-red-500">{errors.positionIfNotOwner.message}</p>}
          </motion.div>
        )}

        <motion.div custom={4} initial="hidden" animate="visible" variants={fadeInVariants}>
          <Button type="submit" disabled={isSubmitting} className="w-full bg-[#005b57] text-white hover:bg-[#00443e]">
            {isSubmitting ? "Saving..." : "Next"}
          </Button>
        </motion.div>
      </form>
    </motion.div>
  );
}
