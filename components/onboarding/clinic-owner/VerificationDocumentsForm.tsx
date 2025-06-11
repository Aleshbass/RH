'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import FileUpload from '@/components/ui/FileUpload';
import { useClinicDocuments, ClinicDocumentType } from '@/lib/hooks/useClinicDocuments';
import { Id } from '@/convex/_generated/dataModel'; // Ensure Id is imported

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/heic',
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
  // Use the new actualClinicId field
  const clinicId = data.actualClinicId;
  
  // Clinic ID would typically come from authentication context or state
  // For this demo/practice, we'll assume it's already created or mocked
  // In a real implementation, you would get this from your app's state 
  // Remove or comment out the mockClinicId
  // const mockClinicId = "clinic123" as Id<"clinics">; // This is a placeholder
  
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
  // Debug logging
  console.log('Form data submitted:', {
    businessLicense: formData.businessLicense?.length || 0,
    taxRegistration: formData.taxRegistration?.length || 0,
    insuranceProof: formData.insuranceProof?.length || 0,
    ownerIdentification: formData.ownerIdentification?.length || 0,
    additionalDocuments: formData.additionalDocuments?.length || 0,
  });
  
  // Zod validation should handle required fields before onSubmit is called.
  // The custom check for missingFields has been removed to rely solely on Zod.
  
  // Continue with your existing upload logic
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
      onboardingCompleted: true,
    });
    
    // Move to next step
    onNext();
  } else {
    // Show error - uploads failed
    alert("Some documents failed to upload. Please try again.");
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
        type: 'spring',
        stiffness: 100,
      },
    },
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-sm">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="space-y-8"
      >
        <motion.div variants={itemVariants}>
          <h2 className="text-2xl font-bold text-[#005b57] mb-1">
            Verification & Documents
          </h2>
          <p className="text-[#002e2c] mb-6">
            Please upload the required documents for verification
          </p>
        </motion.div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-8"
        >
          {/* Business License */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label>
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
            <Label>
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
            <Label>
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
            <Label>
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
            <Label>
              Additional Documents{' '}
              <span className="text-sm text-gray-500">(optional)</span>
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
            <Label htmlFor="comments">
              Additional Comments{' '}
              <span className="text-sm text-gray-500">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="comments"
              render={({ field }) => (
                <Textarea
                  id="comments"
                  placeholder="Any additional information about your documents or clinic verification"
                  className="min-h-[100px]"
                  {...field}
                />
              )}
            />
          </motion.div>

          {/* Accept Terms */}
          <motion.div variants={itemVariants} className="space-y-2">
            <div className="flex items-start space-x-3">
              <Controller
                control={control}
                name="acceptTerms"
                render={({ field }) => (
                  <Checkbox
                    id="acceptTerms"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="acceptTerms"
                  className="font-normal text-sm leading-relaxed"
                >
                  I certify that all information provided is true and correct. I
                  understand that providing false information may result in
                  rejection of my application. I agree to Rehabify Health&apos;s{' '}
                  <a
                    href="/terms"
                    className="text-[#005b57] hover:underline"
                    target="_blank"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    className="text-[#005b57] hover:underline"
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

          {/* Form Navigation */}
          <motion.div
            variants={itemVariants}
            className="flex justify-between items-center pt-4"
          >
            <Button
              type="button"
              onClick={onBack}
              variant="outline"
              className="border-[#005b57] text-[#005b57] hover:bg-[#F1FFE9]"
            >
              Back
            </Button>
            <Button
              type="submit"
              className="bg-[#005b57] hover:bg-[#002e2c] text-white"
            >
              Complete Registration
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}
