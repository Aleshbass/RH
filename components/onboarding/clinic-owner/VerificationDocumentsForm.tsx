'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload } from '@/components/ui/file-upload';
import { useClinicDocuments, ClinicDocumentType } from '@/lib/hooks/useClinicDocuments';
import { Id } from '@/convex/_generated/dataModel';
import { Loader2, ChevronRight, ChevronDown } from '@/components/icons';

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/jpg',
];

// Validation schema
const verificationDocumentsSchema = z.object({
  businessLicense: z
    .array(z.instanceof(File))
    .min(1, 'Business license is required')
    .refine(
      (files) => files.every((file) => file.size <= MAX_FILE_SIZE),
      'File size should be less than 5MB'
    ),
  taxRegistration: z
    .array(z.instanceof(File))
    .min(1, 'Tax registration document is required')
    .refine(
      (files) => files.every((file) => file.size <= MAX_FILE_SIZE),
      'File size should be less than 5MB'
    ),
  insuranceProof: z
    .array(z.instanceof(File))
    .min(1, 'Insurance proof is required')
    .refine(
      (files) => files.every((file) => file.size <= MAX_FILE_SIZE),
      'File size should be less than 5MB'
    ),
  ownerIdentification: z
    .array(z.instanceof(File))
    .min(1, 'Owner identification is required')
    .refine(
      (files) => files.every((file) => file.size <= MAX_FILE_SIZE),
      'File size should be less than 5MB'
    ),
  additionalDocuments: z
    .array(z.instanceof(File))
    .optional()
    .nullable()
    .refine(
      (files) => !files || files.every((file) => file.size <= MAX_FILE_SIZE),
      'File size should be less than 5MB'
    ),
  comments: z.string().optional(),
  acceptTerms: z.boolean().refine((value) => value === true, {
    message: 'You must accept the terms and conditions',
  }),
  referralSource: z.string().min(1, "Please tell us how you heard about us"),
});

type VerificationDocumentsData = z.infer<typeof verificationDocumentsSchema>;

interface VerificationDocumentsFormProps {
  onNext: () => void;
  onBack: () => void;
}

export default function VerificationDocumentsForm({
  onNext,
  onBack,
}: VerificationDocumentsFormProps) {
  const { data, updateClinicOwnerData } = useOnboardingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Use the new actualClinicId field
  const clinicId = data.actualClinicId;

  const {
    uploadClinicDocument
  } = useClinicDocuments({ clinicId: clinicId as Id<"clinics"> }); // Cast as Id<"clinics"> if sure

  // Initialize form with data from store or defaults
  const defaultValues: VerificationDocumentsData = {
    businessLicense: [],
    taxRegistration: [],

    insuranceProof: [],
    ownerIdentification: [],
    additionalDocuments: [],
    comments: data.clinicOwnerData?.comments || '',
    acceptTerms: data.clinicOwnerData?.acceptTerms || false,
    referralSource: data.clinicOwnerData?.referralSource || '',
  };

  const { control, handleSubmit, formState: { errors } } = useForm<VerificationDocumentsData>({
    defaultValues,
    resolver: zodResolver(verificationDocumentsSchema)
  });

  const uploadDocumentsToConvex = async (formData: VerificationDocumentsData): Promise<boolean> => {
    // The check for clinicId is now at the top of the component
    console.log('Uploading documents for actualClinicId:', clinicId);

    if (!clinicId) {
      console.error('Clinic ID is not available for uploading documents.');
      // Display this error to the user
      alert('Cannot upload documents: Clinic information is missing. Please go back and complete the clinic details step.');
      return false;
    }

    const newUploadStatus: Record<string, { success: number; total: number; errors: string[] }> = {};
    const allUploadTasks: Promise<void>[] = [];
    let overallSuccess = true;

    const processDocumentType = (files: File[] | undefined | null, docType: ClinicDocumentType) => {
      if (files && files.length > 0) {
        newUploadStatus[docType] = { success: 0, total: files.length, errors: [] };
        files.forEach(file => {
          const task = uploadClinicDocument(file, docType, clinicId as Id<"clinics">)
            .then(() => {
              newUploadStatus[docType].success++;
            })
            .catch(err => {
              console.error(`Error uploading ${docType} - ${file.name}:`, err);
              newUploadStatus[docType].errors.push(err.message || `Failed to upload ${file.name}`);
              overallSuccess = false;
            });
          allUploadTasks.push(task);
        });
      }
    };

    try {
      processDocumentType(formData.businessLicense, "businessLicense");
      processDocumentType(formData.taxRegistration, "taxRegistration");
      processDocumentType(formData.insuranceProof, "insuranceProof");
      processDocumentType(formData.ownerIdentification, "ownerIdentification");
      processDocumentType(formData.additionalDocuments, "additionalDocument");

      await Promise.all(allUploadTasks);

      // Check if any specific docType had errors even if overallSuccess remained true due to an empty error array initially
      for (const key in newUploadStatus) {
        if (newUploadStatus[key].errors.length > 0) {
          overallSuccess = false;
          break;
        }
      }

    } catch (error) {
      console.error("Error in document upload process:", error);
      alert("A critical error occurred during the document upload process. Please try again.");
      overallSuccess = false; // Ensure success is false on critical error
    } finally {
      // newUploadStatus contains detailed status, could be logged or used for more specific feedback if needed
      console.log('Upload status:', newUploadStatus);
    }
    return overallSuccess;
  };

  const onSubmit = async (formData: VerificationDocumentsData) => {
    setIsSubmitting(true);

    try {
      // Debug logging
      console.log('Form data submitted:', {
        businessLicense: formData.businessLicense?.length || 0,
        taxRegistration: formData.taxRegistration?.length || 0,
        insuranceProof: formData.insuranceProof?.length || 0,
        ownerIdentification: formData.ownerIdentification?.length || 0,
        additionalDocuments: formData.additionalDocuments?.length || 0,
      });

      // First upload all documents to Convex
      const uploadSuccess = await uploadDocumentsToConvex(formData);

      if (uploadSuccess) {
        // Update Zustand store with form data and document references
        updateClinicOwnerData({
          ...data.clinicOwnerData,
          // Store just metadata; actual files are in Convex
          businessLicense: formData.businessLicense.map((file: File) => file.name),
          taxRegistration: formData.taxRegistration.map((file: File) => file.name),
          insuranceProof: formData.insuranceProof.map((file: File) => file.name),
          ownerIdentification: formData.ownerIdentification.map((file: File) => file.name),
          additionalDocuments: formData.additionalDocuments?.map((file: File) => file.name) || [],
          comments: formData.comments,
          acceptTerms: formData.acceptTerms,
          referralSource: formData.referralSource,
          onboardingCompleted: true,
        });

        // Move to next step
        onNext();
      } else {
        // Show error - uploads failed
        alert("Some documents failed to upload. Please try again.");
      }
    } catch (error) {
      console.error('Form submission error:', error);
      alert("An error occurred while submitting the form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 100,
      },
    },
  };

  const inputClasses = "block w-full px-4 py-3 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 placeholder-gray-400";
  const labelClasses = "block text-sm font-semibold text-[#002e2c] mb-2";

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 sm:pb-0">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="space-y-6"
      >
        <motion.div variants={itemVariants} className="text-center mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-[#005b57] mb-1">
            Verification & Documents
          </h2>
          <p className="text-gray-600 mt-2">
            Please upload the required documents for verification
          </p>
        </motion.div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-8"
        >
          {/* Business License */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label className={labelClasses}>
              Business License <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="businessLicense"
              render={({ field }) => (
                <FileUpload
                  id="businessLicense"
                  label="Business License"
                  value={field.value}
                  onChange={field.onChange}
                  accept={ACCEPTED_FILE_TYPES.join(',')}
                  multiple={true}
                  maxSizeInMB={MAX_FILE_SIZE / 1024 / 1024}
                  helpText="Upload your clinic's business license (PDF, JPG, PNG, HEIC)"
                  required
                />
              )}
            />
            {errors.businessLicense && (
              <p className="text-red-500 text-sm mt-1">{errors.businessLicense.message as string}</p>
            )}
          </motion.div>

          {/* Tax Registration */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label className={labelClasses}>
              Tax Registration Document <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="taxRegistration"
              render={({ field }) => (
                <FileUpload
                  id="taxRegistration"
                  label="Tax Registration Document"
                  value={field.value}
                  onChange={field.onChange}
                  accept={ACCEPTED_FILE_TYPES.join(',')}
                  multiple={true}
                  maxSizeInMB={MAX_FILE_SIZE / 1024 / 1024}
                  helpText="Upload your clinic's tax registration document (PDF, JPG, PNG, HEIC)"
                  required
                />
              )}
            />
            {errors.taxRegistration && (
              <p className="text-red-500 text-sm mt-1">{errors.taxRegistration.message as string}</p>
            )}
          </motion.div>

          {/* Insurance Proof */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label className={labelClasses}>
              Insurance Proof <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="insuranceProof"
              render={({ field }) => (
                <FileUpload
                  id="insuranceProof"
                  label="Insurance Proof"
                  value={field.value}
                  onChange={field.onChange}
                  accept={ACCEPTED_FILE_TYPES.join(',')}
                  multiple={true}
                  maxSizeInMB={MAX_FILE_SIZE / 1024 / 1024}
                  helpText="Upload proof of clinic insurance (PDF, JPG, PNG, HEIC)"
                  required
                />
              )}
            />
            {errors.insuranceProof && (
              <p className="text-red-500 text-sm mt-1">{errors.insuranceProof.message as string}</p>
            )}
          </motion.div>

          {/* Owner Identification */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label className={labelClasses}>
              Owner Identification <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="ownerIdentification"
              render={({ field }) => (
                <FileUpload
                  id="ownerIdentification"
                  label="Owner Identification"
                  value={field.value}
                  onChange={field.onChange}
                  accept={ACCEPTED_FILE_TYPES.join(',')}
                  multiple={true}
                  maxSizeInMB={MAX_FILE_SIZE / 1024 / 1024}
                  helpText="Upload owner identification document (PDF, JPG, PNG, HEIC)"
                  required
                />
              )}
            />
            {errors.ownerIdentification && (
              <p className="text-red-500 text-sm mt-1">{errors.ownerIdentification.message as string}</p>
            )}
          </motion.div>

          {/* Additional Documents (Optional) */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label className={labelClasses}>
              Additional Documents{' '}
              <span className="text-sm font-normal text-gray-500">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="additionalDocuments"
              render={({ field }) => (
                <FileUpload
                  id="additionalDocuments"
                  label="Additional Documents"
                  value={field.value || []}
                  onChange={field.onChange}
                  accept={ACCEPTED_FILE_TYPES.join(',')}
                  multiple={true}
                  maxSizeInMB={MAX_FILE_SIZE / 1024 / 1024}
                  helpText="Upload any additional relevant documents (PDF, JPG, PNG, HEIC)"
                />
              )}
            />
            {errors.additionalDocuments && (
              <p className="text-red-500 text-sm mt-1">{errors.additionalDocuments.message as string}</p>
            )}
          </motion.div>

          {/* Comments */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="comments" className={labelClasses}>
              Additional Comments{' '}
              <span className="text-sm font-normal text-gray-500">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="comments"
              render={({ field }) => (
                <Textarea
                  id="comments"
                  placeholder="Any additional information about your documents or clinic verification"
                  className={`${inputClasses} min-h-[100px] resize-none`}
                  {...field}
                />
              )}
            />
          </motion.div>

          {/* How did you hear about us? */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="referralSource" className={labelClasses}>
              How did you hear about us? <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="referralSource"
              render={({ field }) => (
                <div className="relative">
                  <select
                    id="referralSource"
                    {...field}
                    className={`${inputClasses} appearance-none`}
                  >
                    <option value="" disabled>Select an option</option>
                    <option value="Social Media (Instagram, Twitter, LinkedIn)">Social Media (Instagram, Twitter, LinkedIn)</option>
                    <option value="Google Search">Google Search</option>
                    <option value="Friend or Colleague">Friend or Colleague</option>
                    <option value="Event or Conference">Event or Conference</option>
                    <option value="Email Newsletter">Email Newsletter</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              )}
            />
            {errors.referralSource && (
              <p className="text-red-500 text-sm mt-1">{errors.referralSource.message as string}</p>
            )}
          </motion.div>

          {/* Accept Terms */}
          <motion.div variants={itemVariants} className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <div className="flex items-start space-x-3">
              <Controller
                control={control}
                name="acceptTerms"
                render={({ field }) => (
                  <Checkbox
                    id="acceptTerms"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-1"
                  />
                )}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="acceptTerms"
                  className="font-normal text-sm leading-relaxed text-gray-600"
                >
                  I certify that all information provided is true and correct. I
                  understand that providing false information may result in
                  rejection of my application. I agree to Rehabify Health&apos;s{' '}
                  <a
                    href="/terms"
                    className="text-[#005b57] hover:underline font-medium"
                    target="_blank"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    className="text-[#005b57] hover:underline font-medium"
                    target="_blank"
                  >
                    Privacy Policy
                  </a>
                  .
                </Label>
                {errors.acceptTerms && (
                  <p className="text-red-500 text-sm">
                    {errors.acceptTerms.message as string}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Sticky Mobile / Regular Desktop Buttons */}
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 sm:static sm:bg-transparent sm:border-0 sm:p-0 z-40">
            <div className="max-w-4xl mx-auto w-full flex gap-4">
              <button
                type="button"
                onClick={onBack}
                disabled={isSubmitting}
                className="hidden sm:flex h-12 px-6 items-center justify-center text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-14 sm:h-12 flex items-center justify-center gap-2 text-base sm:text-sm font-semibold bg-[#005b57] text-white rounded-xl sm:rounded-lg hover:bg-[#00443e] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 shadow-lg sm:shadow-none"
              >
                {isSubmitting ? (
                  <>
                    Submitting...
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  </>
                ) : (
                  <>
                    Complete Registration
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
