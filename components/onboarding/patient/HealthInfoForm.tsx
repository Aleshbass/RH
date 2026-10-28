'use client';

import React from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

// Form schema with Zod validation
const patientHealthInfoSchema = z.object({
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  hasMedicalConditions: z.boolean(),
  medicalConditionsDetails: z.string().optional(),
  painLevel: z.string().optional(),
  painLocations: z.string().optional(),
  mobilityLimitations: z.string().optional(),
  treatmentGoals: z.string().optional(),
  previousPhysiotherapy: z.boolean(),
  previousPhysiotherapyDetails: z.string().optional(),
  consentToTreatment: z.boolean().refine(val => val === true, {
    message: "You must consent to treatment to continue",
  }),
  consentToShareMedicalInfo: z.boolean().refine(val => val === true, {
    message: "You must consent to sharing medical information to continue",
  }),
});

export type PatientHealthInfoValues = z.infer<typeof patientHealthInfoSchema>;

interface HealthInfoFormProps {
  onSubmit: (data: PatientHealthInfoValues) => void;
  onBack: () => void;
  isExternallySubmitting?: boolean;
}

export default function HealthInfoForm({ onSubmit, onBack, isExternallySubmitting }: HealthInfoFormProps) {
  // Define form with React Hook Form and Zod validation
  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<PatientHealthInfoValues>({
    resolver: zodResolver(patientHealthInfoSchema),
    defaultValues: {
      insuranceProvider: '',
      insurancePolicyNumber: '',
      hasMedicalConditions: false,
      medicalConditionsDetails: '',
      painLevel: '',
      painLocations: '',
      mobilityLimitations: '',
      treatmentGoals: '',
      previousPhysiotherapy: false,
      previousPhysiotherapyDetails: '',
      consentToTreatment: false,
      consentToShareMedicalInfo: false,
    }
  });

  // Watch for checkbox values to conditionally show/hide fields
  const hasMedicalConditions = watch('hasMedicalConditions');
  const previousPhysiotherapy = watch('previousPhysiotherapy');

  // Animation variants
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
      className="space-y-4"
    >
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-[#002e2c]">
          Health Information
        </h1>
        <p className="text-[#005b57]">
          Please provide additional health details to help your physiotherapist
        </p>
      </div>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-6">
          {/* Health Insurance Section */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-4 p-4 bg-gray-50 rounded-lg"
          >
            <h2 className="font-medium text-lg text-[#002e2c]">Insurance Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Insurance Provider */}
              <div className="space-y-2">
                <Label htmlFor="insuranceProvider">Insurance Provider</Label>
                <Controller
                  control={control}
                  name="insuranceProvider"
                  render={({ field }) => (
                    <Input
                      id="insuranceProvider"
                      placeholder="Enter insurance provider name"
                      {...field}
                      className={errors.insuranceProvider ? "border-red-500" : ""}
                    />
                  )}
                />
                {errors.insuranceProvider && (
                  <p className="text-sm text-red-500">{errors.insuranceProvider.message}</p>
                )}
              </div>

              {/* Insurance Policy Number */}
              <div className="space-y-2">
                <Label htmlFor="insurancePolicyNumber">Policy Number</Label>
                <Controller
                  control={control}
                  name="insurancePolicyNumber"
                  render={({ field }) => (
                    <Input
                      id="insurancePolicyNumber"
                      placeholder="Enter policy number"
                      {...field}
                      className={errors.insurancePolicyNumber ? "border-red-500" : ""}
                    />
                  )}
                />
                {errors.insurancePolicyNumber && (
                  <p className="text-sm text-red-500">{errors.insurancePolicyNumber.message}</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Medical Conditions Section */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-4 p-4 bg-gray-50 rounded-lg"
          >
            <h2 className="font-medium text-lg text-[#002e2c]">Medical Conditions</h2>
            
            <div className="space-y-4">
              {/* Has Medical Conditions Checkbox */}
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="hasMedicalConditions"
                  render={({ field }) => (
                    <Checkbox
                      id="hasMedicalConditions"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label
                  htmlFor="hasMedicalConditions"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I have relevant medical conditions or diagnoses
                </Label>
              </div>

              {/* Conditional Medical Conditions Details */}
              {hasMedicalConditions && (
                <div className="space-y-2">
                  <Label htmlFor="medicalConditionsDetails">Medical Conditions Details</Label>
                  <Controller
                    control={control}
                    name="medicalConditionsDetails"
                    render={({ field }) => (
                      <textarea
                        id="medicalConditionsDetails"
                        placeholder="Please describe your relevant medical conditions or diagnoses"
                        {...field}
                        className={`w-full px-3 py-2 border rounded-md ${
                          errors.medicalConditionsDetails ? "border-red-500" : "border-gray-300"
                        } focus:outline-none focus:ring-1 focus:ring-sky-500`}
                        rows={3}
                      />
                    )}
                  />
                  {errors.medicalConditionsDetails && (
                    <p className="text-sm text-red-500">{errors.medicalConditionsDetails.message}</p>
                  )}
                </div>
              )}

              {/* Pain Level */}
              <div className="space-y-2">
                <Label htmlFor="painLevel">Current Pain Level (1-10)</Label>
                <Controller
                  control={control}
                  name="painLevel"
                  render={({ field }) => (
                    <Input
                      id="painLevel"
                      type="number"
                      min="0"
                      max="10"
                      placeholder="Rate your pain level from 0 (none) to 10 (severe)"
                      {...field}
                      className={errors.painLevel ? "border-red-500" : ""}
                    />
                  )}
                />
                {errors.painLevel && (
                  <p className="text-sm text-red-500">{errors.painLevel.message}</p>
                )}
              </div>

              {/* Pain Locations */}
              <div className="space-y-2">
                <Label htmlFor="painLocations">Pain Locations</Label>
                <Controller
                  control={control}
                  name="painLocations"
                  render={({ field }) => (
                    <Input
                      id="painLocations"
                      placeholder="Where do you experience pain? (e.g., lower back, right knee)"
                      {...field}
                      className={errors.painLocations ? "border-red-500" : ""}
                    />
                  )}
                />
                {errors.painLocations && (
                  <p className="text-sm text-red-500">{errors.painLocations.message}</p>
                )}
              </div>

              {/* Mobility Limitations */}
              <div className="space-y-2">
                <Label htmlFor="mobilityLimitations">Mobility Limitations</Label>
                <Controller
                  control={control}
                  name="mobilityLimitations"
                  render={({ field }) => (
                    <textarea
                      id="mobilityLimitations"
                      placeholder="Describe any limitations in your mobility or daily activities"
                      {...field}
                      className={`w-full px-3 py-2 border rounded-md ${
                        errors.mobilityLimitations ? "border-red-500" : "border-gray-300"
                      } focus:outline-none focus:ring-1 focus:ring-sky-500`}
                      rows={3}
                    />
                  )}
                />
                {errors.mobilityLimitations && (
                  <p className="text-sm text-red-500">{errors.mobilityLimitations.message}</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Treatment History & Goals Section */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-4 p-4 bg-gray-50 rounded-lg"
          >
            <h2 className="font-medium text-lg text-[#002e2c]">Treatment History & Goals</h2>
            
            <div className="space-y-4">
              {/* Treatment Goals */}
              <div className="space-y-2">
                <Label htmlFor="treatmentGoals">Treatment Goals</Label>
                <Controller
                  control={control}
                  name="treatmentGoals"
                  render={({ field }) => (
                    <textarea
                      id="treatmentGoals"
                      placeholder="What are your goals for physiotherapy treatment?"
                      {...field}
                      className={`w-full px-3 py-2 border rounded-md ${
                        errors.treatmentGoals ? "border-red-500" : "border-gray-300"
                      } focus:outline-none focus:ring-1 focus:ring-sky-500`}
                      rows={3}
                    />
                  )}
                />
                {errors.treatmentGoals && (
                  <p className="text-sm text-red-500">{errors.treatmentGoals.message}</p>
                )}
              </div>

              {/* Previous Physiotherapy Checkbox */}
              <div className="flex items-center space-x-2">
                <Controller
                  control={control}
                  name="previousPhysiotherapy"
                  render={({ field }) => (
                    <Checkbox
                      id="previousPhysiotherapy"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label
                  htmlFor="previousPhysiotherapy"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I have received physiotherapy in the past
                </Label>
              </div>

              {/* Conditional Previous Physiotherapy Details */}
              {previousPhysiotherapy && (
                <div className="space-y-2">
                  <Label htmlFor="previousPhysiotherapyDetails">Previous Physiotherapy Details</Label>
                  <Controller
                    control={control}
                    name="previousPhysiotherapyDetails"
                    render={({ field }) => (
                      <textarea
                        id="previousPhysiotherapyDetails"
                        placeholder="Please describe your previous physiotherapy experience and outcomes"
                        {...field}
                        className={`w-full px-3 py-2 border rounded-md ${
                          errors.previousPhysiotherapyDetails ? "border-red-500" : "border-gray-300"
                        } focus:outline-none focus:ring-1 focus:ring-sky-500`}
                        rows={3}
                      />
                    )}
                  />
                  {errors.previousPhysiotherapyDetails && (
                    <p className="text-sm text-red-500">{errors.previousPhysiotherapyDetails.message}</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* Consent Section */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-4 p-4 bg-gray-50 rounded-lg"
          >
            <h2 className="font-medium text-lg text-[#002e2c]">Consent</h2>
            
            <div className="space-y-4">
              {/* Consent to Treatment */}
              <div className="flex items-start space-x-2">
                <Controller
                  control={control}
                  name="consentToTreatment"
                  render={({ field }) => (
                    <Checkbox
                      id="consentToTreatment"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-1"
                    />
                  )}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="consentToTreatment"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I consent to receive physiotherapy treatment *
                  </Label>
                  <p className="text-xs text-gray-500">
                    I understand that physiotherapy involves physical examination and various treatment techniques.
                  </p>
                </div>
              </div>
              {errors.consentToTreatment && (
                <p className="text-sm text-red-500">{errors.consentToTreatment.message}</p>
              )}

              {/* Consent to Share Medical Info */}
              <div className="flex items-start space-x-2">
                <Controller
                  control={control}
                  name="consentToShareMedicalInfo"
                  render={({ field }) => (
                    <Checkbox
                      id="consentToShareMedicalInfo"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-1"
                    />
                  )}
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="consentToShareMedicalInfo"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I consent to share my medical information *
                  </Label>
                  <p className="text-xs text-gray-500">
                    I understand that my information will only be shared with healthcare providers involved in my care.
                  </p>
                </div>
              </div>
              {errors.consentToShareMedicalInfo && (
                <p className="text-sm text-red-500">{errors.consentToShareMedicalInfo.message}</p>
              )}
            </div>
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
            disabled={isSubmitting || !!isExternallySubmitting || !watch('consentToTreatment') || !watch('consentToShareMedicalInfo')}
          >
            {isSubmitting ? 'Saving...' : 'Complete'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}