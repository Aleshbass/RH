'use client';

import React from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PatientData } from '@/stores/onboardingStore';

// Form schema with Zod validation - matched to PatientData in onboardingStore
const patientInfoSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phoneNumber: z.string().min(10, 'Please enter a valid phone number'),
  dateOfBirth: z.string().optional(),
  medicalHistory: z.string().optional(),
  emergencyContact: z.string().optional(),
});

export type PatientInfoValues = z.infer<typeof patientInfoSchema>;

interface PersonalInfoFormProps {
  initialData?: Partial<PatientData>;
  invitationInfo?: {
    isValid: boolean;
    message: string;
    physiotherapist?: {
      name: string;
      type: 'private' | 'clinic';
      clinicName?: string;
    };
  };
  invitationCode?: string | null;
  onSubmit: (data: PatientInfoValues) => void;
  onBack: () => void;
}

export default function PersonalInfoForm({
  initialData,
  invitationInfo,
  invitationCode,
  onSubmit,
  onBack
}: PersonalInfoFormProps) {
  // Define form with React Hook Form and Zod validation
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<PatientInfoValues>({
    resolver: zodResolver(patientInfoSchema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      email: initialData?.email || '',
      phoneNumber: initialData?.phoneNumber || '',
      dateOfBirth: initialData?.dateOfBirth || '',
      medicalHistory: initialData?.medicalHistory || '',
      emergencyContact: initialData?.emergencyContact || '',
    }
  });

  // Animation variants
  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: 'easeOut',
      },
    }),
  };

  // If invalid invitation, show error
  if (!invitationInfo?.isValid && !invitationCode) {
    return (
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-xl">
        <div className="p-4 border border-red-300 bg-red-50 rounded-md text-red-800">
          <h3 className="font-bold text-lg">Invalid Invitation</h3>
          <p>{invitationInfo?.message || 'No invitation code provided.'}</p>
        </div>
        <Button onClick={onBack} className="w-full">Back to Homepage</Button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Referring Physiotherapist Information */}
      {invitationInfo?.isValid && invitationInfo.physiotherapist && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <h3 className="text-lg font-medium text-teal-800">You&apos;ve been invited by:</h3>
          <p className="text-teal-700">
            <span className="font-bold">{invitationInfo.physiotherapist.name}</span>
            {invitationInfo.physiotherapist.type === 'clinic' && (
              <> from {invitationInfo.physiotherapist.clinicName}</>
            )}
          </p>
        </div>
      )}

      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-[#002e2c]">
          Patient Registration
        </h1>
        <p className="text-[#005b57]">
          Please complete your profile to continue
        </p>
      </div>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* First Name */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <Label htmlFor="firstName">First Name *</Label>
            <Controller
              control={control}
              name="firstName"
              render={({ field }) => (
                <Input
                  id="firstName"
                  placeholder="Enter your first name"
                  {...field}
                  className={errors.firstName ? "border-red-500" : ""}
                />
              )}
            />
            {errors.firstName && (
              <p className="text-sm text-red-500">{errors.firstName.message}</p>
            )}
          </motion.div>

          {/* Last Name */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <Label htmlFor="lastName">Last Name *</Label>
            <Controller
              control={control}
              name="lastName"
              render={({ field }) => (
                <Input
                  id="lastName"
                  placeholder="Enter your last name"
                  {...field}
                  className={errors.lastName ? "border-red-500" : ""}
                />
              )}
            />
            {errors.lastName && (
              <p className="text-sm text-red-500">{errors.lastName.message}</p>
            )}
          </motion.div>

          {/* Email */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <Label htmlFor="email">Email *</Label>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  {...field}
                  className={errors.email ? "border-red-500" : ""}
                />
              )}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </motion.div>

          {/* Phone Number */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <Label htmlFor="phoneNumber">Phone Number *</Label>
            <Controller
              control={control}
              name="phoneNumber"
              render={({ field }) => (
                <Input
                  id="phoneNumber"
                  placeholder="Enter your phone number"
                  {...field}
                  className={errors.phoneNumber ? "border-red-500" : ""}
                />
              )}
            />
            {errors.phoneNumber && (
              <p className="text-sm text-red-500">{errors.phoneNumber.message}</p>
            )}
          </motion.div>

          {/* Date of Birth */}
          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Controller
              control={control}
              name="dateOfBirth"
              render={({ field }) => (
                <Input
                  id="dateOfBirth"
                  type="date"
                  {...field}
                  className={errors.dateOfBirth ? "border-red-500" : ""}
                />
              )}
            />
            {errors.dateOfBirth && (
              <p className="text-sm text-red-500">{errors.dateOfBirth.message}</p>
            )}
          </motion.div>

          {/* Medical History */}
          <motion.div
            custom={6}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2 md:col-span-2"
          >
            <Label htmlFor="medicalHistory">Medical History</Label>
            <Controller
              control={control}
              name="medicalHistory"
              render={({ field }) => (
                <textarea
                  id="medicalHistory"
                  placeholder="Enter any relevant medical history"
                  {...field}
                  className={`w-full px-3 py-2 border rounded-md ${errors.medicalHistory ? "border-red-500" : "border-gray-300"} focus:outline-none focus:ring-1 focus:ring-sky-500`}
                  rows={4}
                />
              )}
            />
            {errors.medicalHistory && (
              <p className="text-sm text-red-500">{errors.medicalHistory.message}</p>
            )}
          </motion.div>

          {/* Emergency Contact */}
          <motion.div
            custom={6}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2 md:col-span-2"
          >
            <Label htmlFor="emergencyContact">Emergency Contact</Label>
            <Controller
              control={control}
              name="emergencyContact"
              render={({ field }) => (
                <Input
                  id="emergencyContact"
                  placeholder="Name and phone number of emergency contact"
                  {...field}
                  className={errors.emergencyContact ? "border-red-500" : ""}
                />
              )}
            />
            {errors.emergencyContact && (
              <p className="text-sm text-red-500">{errors.emergencyContact.message}</p>
            )}
          </motion.div>
        </div>

        <div className="flex justify-between pt-4 mt-6">
          <Button
            type="button" 
            onClick={onBack}
            variant="outline"
          >
            Back
          </Button>
          <Button 
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Next'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
