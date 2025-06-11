import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useOnboardingStore } from '@/stores/onboardingStore';
import FileUpload from '@/components/ui/FileUpload';
import { useFormWithZod } from '@/lib/hooks/useFormWithZod';
import { usePhysiotherapistDocuments } from '@/lib/hooks/usePhysiotherapistDocuments';
import { springConfig } from '@/lib/animations/animations';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

// Form schema - removed file validation since files are handled separately
const licenseCredentialsSchema = z.object({
  certificationBoard: z.string().min(2, "Certification board is required"),
  certificationYear: z.number().min(1900, "Please enter a valid year"),
  licenseExpiryDate: z.string().min(1, "Expiry date is required"),
  licenseDocument: z.instanceof(File, { message: "License document is required" })
    .refine(file => file.size <= 10 * 1024 * 1024, `File size must be less than 10MB`)
    .refine(
      file => ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type),
      "License document must be PDF, JPG, or PNG format"
    ).nullable().optional(), // Make it optional at schema level, Controller will enforce requirement
  termsAccepted: z.boolean().refine(val => val === true, {
    message: "You must accept the terms and conditions"
  })
});

interface LicenseCredentialsFormProps {
  onComplete: () => void;
  onPrev: () => void;
}

export default function LicenseCredentialsForm({ onComplete, onPrev }: LicenseCredentialsFormProps) {
  const store = useOnboardingStore();
  const physiotherapistData = store.data.physiotherapistData || {}; 
  const { updatePhysiotherapistData, completeOnboarding } = store;
  
  // Get the current user and profile
  const currentUser = useQuery(api.queries.getCurrentUser, {});
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  // Get the physiotherapist profile ID
  const physiotherapistProfileId = currentUser?.profileData?._id || null;
  
  // Check if we're still loading the user or creating a profile
  const isLoading = !currentUser || isCreatingProfile;
  
  // Use document upload hook
  const {
    uploadDocument,
    isUploading,
    uploadProgress,
    error: uploadError,
    clearError,
    refreshDocuments
  } = usePhysiotherapistDocuments(physiotherapistProfileId);
  
  // File state for UI display before upload
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [certificates, setCertificates] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [uploadSuccessMessages, setUploadSuccessMessages] = useState<{ 
    license?: string; 
    certificates: string[] 
  }>({ certificates: [] });
  
  // File validation function
  const validateFiles = (): boolean => {
    setFileError("");
    
    if (!licenseFile) {
      setFileError("License document is required");
      return false;
    }
    
    // Validate file types and sizes
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(licenseFile.type)) {
      setFileError("License document must be PDF, JPG, or PNG format");
      return false;
    }
    
    if (licenseFile.size > maxSize) {
      setFileError("License document must be less than 10MB");
      return false;
    }
    
    // Validate additional certificates if any
    for (const cert of certificates) {
      if (!validTypes.includes(cert.type)) {
        setFileError(`Certificate "${cert.name}" must be PDF, JPG, or PNG format`);
        return false;
      }
      
      if (cert.size > maxSize) {
        setFileError(`Certificate "${cert.name}" must be less than 10MB`);
        return false;
      }
    }
    
    return true;
  };
  
  // Define onSubmit function
  const onSubmit = async (formData: z.infer<typeof licenseCredentialsSchema>) => {
    console.log('Form submission started', { formData, licenseFile, certificates });
    
    setFileError("");
    setUploadSuccessMessages({ certificates: [] });

    // Validate files first
    if (!validateFiles()) {
      console.log('File validation failed');
      return;
    }

    if (!physiotherapistProfileId) {
      console.error('Physiotherapist profile ID is not available.');
      setFileError("Please complete your profile setup first before uploading documents.");
      return;
    }

    try {
      let hasUploadError = false;

      // Upload license document if provided
      if (licenseFile) {
        console.log('Uploading license document:', licenseFile.name);
        const uploadSuccess = await uploadDocument(licenseFile, "licenseDocument");
        
        if (!uploadSuccess) {
          hasUploadError = true;
          console.error('License document upload failed');
          setFileError(uploadError || "Failed to upload license document. Please try again.");
        } else {
          console.log('License document uploaded successfully');
          setUploadSuccessMessages(prev => ({ 
            ...prev, 
            license: `${licenseFile.name} uploaded successfully` 
          }));
        }
      }

      // Upload certificates if license upload was successful
      if (!hasUploadError && certificates.length > 0) {
        console.log('Uploading certificates:', certificates.map(c => c.name));
        const successfulUploads: string[] = [];
        
        for (const certificate of certificates) {
          console.log('Uploading certificate:', certificate.name);
          const uploadSuccess = await uploadDocument(certificate, "additionalCertificate");
          
          if (!uploadSuccess) {
            hasUploadError = true;
            console.error(`Failed to upload ${certificate.name}`);
            setFileError(uploadError || `Failed to upload ${certificate.name}. Please try again.`);
            break;
          }
          
          successfulUploads.push(certificate.name);
        }

        if (successfulUploads.length > 0) {
          setUploadSuccessMessages(prev => ({
            ...prev,
            certificates: successfulUploads.map(name => `${name} uploaded successfully`)
          }));
        }
      }

      // Only proceed with form submission if all uploads were successful
      if (!hasUploadError) {
        console.log('All uploads successful, completing onboarding');
        
        // Update the store with form data (not files, as they're handled separately)
        // Convert null to undefined for licenseDocument to match PhysiotherapistData type
        const formDataForStore = {
          ...formData,
          licenseDocument: formData.licenseDocument || undefined
        };
        updatePhysiotherapistData(formDataForStore);
        completeOnboarding();
        onComplete();
      }
    } catch (error) {
      console.error('Error in form submission:', error);
      setFileError(error instanceof Error ? error.message : "An unexpected error occurred. Please try again.");
    }
  };
  
  // Use custom form hook with Zod validation
  const { 
    control, 
    handleSubmit, 
    formState: { errors, isSubmitting },
    submitError,
    clearSubmitError,
    setValue // <-- Add setValue from useFormWithZod
  } = useFormWithZod(licenseCredentialsSchema, {
    defaultValues: {
      certificationBoard: physiotherapistData.certificationBoard || "",
      certificationYear: physiotherapistData.certificationYear || new Date().getFullYear(),
      licenseExpiryDate: physiotherapistData.licenseExpiryDate || "",
      licenseDocument: undefined, // Initialize as undefined
      termsAccepted: physiotherapistData.termsAccepted || false,
    },
    onSubmit,
  });
  
  // Clear errors when component unmounts
  useEffect(() => {
    return () => {
      clearError();
      clearSubmitError();
    };
  }, [clearError, clearSubmitError]);
  
  // Handle profile creation and document refresh
  useEffect(() => {
    const handleProfileSetup = async () => {
      if (!currentUser) return;
      
      // If user is a physiotherapist but has no profile ID, try to create one
      if (currentUser.role === 'physiotherapist' && !currentUser.profileData?._id) {
        try {
          setIsCreatingProfile(true);
          setProfileError(null);
          // The getCurrentUser query will automatically create a profile
          // We just need to wait for it to be created
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit for the profile to be created
        } catch (error) {
          console.error('Error creating profile:', error);
          setProfileError('Failed to create profile. Please refresh the page and try again.');
        } finally {
          setIsCreatingProfile(false);
        }
      }
    };
    
    handleProfileSetup();
  }, [currentUser]);
  
  // Refresh documents when physiotherapistProfileId changes
  useEffect(() => {
    if (physiotherapistProfileId) {
      refreshDocuments();
    }
  }, [physiotherapistProfileId, refreshDocuments]);

  const handleCertificatesChange = (files: File | File[] | null) => {
    console.log('Certificates changed:', files);
    if (Array.isArray(files)) {
      setCertificates(files);
    } else if (files instanceof File) {
      setCertificates([files]);
    } else {
      setCertificates([]);
    }
    setFileError("");
  };

  const handleFileError = (error: string) => {
    console.error('File error:', error);
    setFileError(error);
  };
  
  // Display any errors
  const displayError = profileError || fileError || uploadError || submitError;
  
  // Animation variants
  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        ...springConfig
      }
    })
  };

  // Generate year options for the certification year dropdown
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 50 }, (_, i) => currentYear - i);

  // Show loading state while setting up profile
  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600">Setting up your profile...</p>
        </div>
      </div>
    );
  }

  if (currentUser?.role !== "physiotherapist") {
    return <div className="p-6 text-center text-red-600">Access denied. This page is for physiotherapists only.</div>;
  }

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">License & Credentials</h2>
        <p className="text-gray-600 mb-6">Please provide your professional license details and upload relevant documentation.</p>
        
        {displayError && (
          <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
            {displayError}
          </div>
        )}

        {/* Display Success Messages */}
        {uploadSuccessMessages.license && (
          <div className="p-3 mb-4 text-sm text-green-700 bg-green-100 rounded-lg">
            {uploadSuccessMessages.license}
          </div>
        )}
        {uploadSuccessMessages.certificates.length > 0 && (
          <div className="p-3 mb-4 text-sm text-green-700 bg-green-100 rounded-lg">
            <p className="font-semibold">Successfully uploaded certificates:</p>
            <ul className="list-disc list-inside pl-4">
              {uploadSuccessMessages.certificates.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        )}
        
        {isUploading && (
          <div className="mb-4">
            <div className="text-sm text-[#005b57] mb-1">Uploading: {uploadProgress}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-[#005b57] h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {/* Certification Board */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="space-y-2"
        >
          <label
            htmlFor="certificationBoard"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Certification Board *
          </label>
          <Controller
            control={control}
            name="certificationBoard"
            render={({ field }) => (
              <input
                id="certificationBoard"
                name="certificationBoard"
                value={field.value}
                onBlur={field.onBlur}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder="e.g., Medical Rehabilitation Therapists Board of Nigeria"
                className={`block w-full px-3 py-2 rounded-md border shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
                  errors.certificationBoard ? "border-red-500" : "border-[#E3DFD2]"
                }`}
              />
            )}
          />
          {errors.certificationBoard && (
            <p className="mt-1 text-sm text-red-500">
              {errors.certificationBoard.message}
            </p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* Certification Year */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <label
              htmlFor="certificationYear"
              className="block text-sm font-medium text-[#002e2c]"
            >
              Certification Year *
            </label>
            <Controller
              control={control}
              name="certificationYear"
              render={({ field }) => (
                <select
                  id="certificationYear"
                  name="certificationYear"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                  className={`block w-full px-3 py-2 rounded-md border shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
                    errors.certificationYear ? "border-red-500" : "border-[#E3DFD2]"
                  }`}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              )}
            />
            {errors.certificationYear && (
              <p className="mt-1 text-sm text-red-500">
                {errors.certificationYear.message}
              </p>
            )}
          </motion.div>

          {/* License Expiry Date */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <label
              htmlFor="licenseExpiryDate"
              className="block text-sm font-medium text-[#002e2c]"
            >
              License Expiry Date *
            </label>
            <Controller
              control={control}
              name="licenseExpiryDate"
              render={({ field }) => (
                <input
                  id="licenseExpiryDate"
                  name="licenseExpiryDate"
                  type="date"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className={`block w-full px-3 py-2 rounded-md border shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
                    errors.licenseExpiryDate ? "border-red-500" : "border-[#E3DFD2]"
                  }`}
                />
              )}
            />
            {errors.licenseExpiryDate && (
              <p className="mt-1 text-sm text-red-500">
                {errors.licenseExpiryDate.message}
              </p>
            )}
          </motion.div>
        </div>

        {/* License Document Upload */}
        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="space-y-2"
        >
          <Controller
            name="licenseDocument"
            control={control}
            rules={{ required: "License document is required" }} // This rule enforces the requirement
            render={({ field, fieldState }) => (
              <>
                <FileUpload
                  id="license-upload"
                  label="License Document *"
                  helpText="Upload a scan or photo of your professional license (PDF, PNG, or JPG, max 10MB)"
                  accept="application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={(selectedFiles) => {
                    const file = selectedFiles instanceof File ? selectedFiles : null;
                    field.onChange(file || undefined); // Pass file or undefined to RHF
                    // setLicenseFile is called via field.onChange -> which should trigger re-render and thus the value for licenseFile for UI
                    // To be certain, we can also call setLicenseFile here if needed, but RHF should handle the state.
                    // For direct UI update and other logic, we can still use handleLicenseFileChange or parts of it.
                    // Let's ensure local state is also updated for immediate UI feedback if RHF update is not direct enough.
                    setLicenseFile(file); 
                    if (file) {
                      setValue('licenseDocument', file, { shouldValidate: true });
                    } else {
                      setValue('licenseDocument', undefined, { shouldValidate: true });
                    }
                  }}
                  onError={handleFileError}
                />
                {licenseFile && (
                  <p className="text-sm text-green-600">
                    Selected: {licenseFile.name} ({(licenseFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                {fieldState.error && (
                  <p className="mt-1 text-sm text-red-500">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />
        </motion.div>

        {/* Additional Certificates */}
        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="space-y-2"
        >
          <FileUpload
            id="certificates-upload"
            label="Additional Certifications"
            helpText="Upload additional certifications or qualifications (optional, PDF, PNG, or JPG, max 10MB each)"
            accept="application/pdf,image/jpeg,image/png,image/jpg"
            multiple
            onChange={handleCertificatesChange}
            onError={handleFileError}
          />
          {certificates.length > 0 && (
            <div className="text-sm text-green-600">
              <p>Selected certificates:</p>
              <ul className="list-disc list-inside pl-4">
                {certificates.map((cert, idx) => (
                  <li key={idx}>
                    {cert.name} ({(cert.size / 1024 / 1024).toFixed(2)} MB)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>

        {/* Terms and Conditions */}
        <motion.div
          custom={5}
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="flex items-start mt-6"
        >
          <div className="flex items-center h-5">
            <Controller
              control={control}
              name="termsAccepted"
              render={({ field }) => (
                <input
                  id="termsAccepted"
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="w-4 h-4 text-[#005b57] border-[#E3DFD2] rounded focus:ring-[#005b57]"
                />
              )}
            />
          </div>
          <div className="ml-3 text-sm">
            <label
              htmlFor="termsAccepted"
              className={`font-medium ${
                errors.termsAccepted ? "text-red-500" : "text-[#002e2c]"
              }`}
            >
              I accept the terms and conditions *
            </label>
            <p className="text-gray-500">
              By accepting, you agree to our professional standards and data usage policies.
            </p>
            {errors.termsAccepted && (
              <p className="mt-1 text-sm text-red-500">
                {errors.termsAccepted.message}
              </p>
            )}
          </div>
        </motion.div>

        <div className="mt-10 flex justify-between">
          <button
            type="button"
            onClick={onPrev}
            disabled={isSubmitting || isUploading}
            className="rounded-md bg-white px-5 py-2 text-sm font-medium text-[#002e2c] border border-[#E3DFD2] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#005b57] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isUploading || !physiotherapistProfileId || isLoading}
            className="rounded-md bg-[#005b57] px-5 py-2 text-sm font-medium text-white hover:bg-[#002e2c] focus:outline-none focus:ring-2 focus:ring-[#005b57] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              'Setting up profile...'
            ) : isSubmitting || isUploading ? (
              'Processing...'
            ) : (
              'Save & Complete'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}