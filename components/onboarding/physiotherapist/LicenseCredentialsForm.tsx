import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Controller } from 'react-hook-form';
import { z } from 'zod';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { FileUpload } from '@/components/ui/file-upload';

import { useFormWithZod } from '@/lib/hooks/useFormWithZod';
import { usePhysiotherapistDocuments } from '@/lib/hooks/usePhysiotherapistDocuments';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { ChevronRight, ChevronDown } from '@/components/icons';

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
  }),
  referralSource: z.string().min(1, "Please tell us how you heard about us")
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
  const completeUserProfileMutation = useMutation(api.users.completeUserProfile);
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

        // Trigger admin notification by calling completeUserProfile with finalStep: true
        try {
          await completeUserProfileMutation({
            role: "physiotherapist",
            profileData: {
              certificationBoard: formData.certificationBoard,
              certificationYear: formData.certificationYear,
              licenseExpiryDate: formData.licenseExpiryDate,
              dateOfBirth: physiotherapistData.dateOfBirth,
              gender: physiotherapistData.gender,
              referralSource: formData.referralSource,
            },
            firstName: physiotherapistData.firstName,
            lastName: physiotherapistData.lastName,
            finalStep: true,
          });
        } catch (err) {
          console.error("Failed to finalize user profile:", err);
          setFileError("Failed to complete profile setup. Please try again.");
          return;
        }

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
      referralSource: physiotherapistData.referralSource || "",
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
        stiffness: 260,
        damping: 20,
        mass: 1
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

  const inputClasses = "block w-full h-14 px-4 pt-5 pb-2 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 peer placeholder-transparent";
  const labelClasses = "absolute text-sm text-gray-500 duration-200 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-[#005b57]";

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 sm:pb-0">
      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
        <div className="text-center mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-[#002e2c]">License & Credentials</h2>
          <p className="text-gray-600">Please provide your professional license details and upload relevant documentation.</p>
        </div>

        {displayError && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl">
            {displayError}
          </div>
        )}

        {/* Display Success Messages */}
        {uploadSuccessMessages.license && (
          <div className="p-4 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl">
            {uploadSuccessMessages.license}
          </div>
        )}
        {uploadSuccessMessages.certificates.length > 0 && (
          <div className="p-4 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl">
            <p className="font-semibold">Successfully uploaded certificates:</p>
            <ul className="list-disc list-inside pl-4 mt-1">
              {uploadSuccessMessages.certificates.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {isUploading && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-[#005b57] mb-1 font-medium">
              <span>Uploading documents...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-[#005b57] h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Certification Board */}
        <div className="space-y-1">
          <div className="relative">
            <Controller
              control={control}
              name="certificationBoard"
              render={({ field }) => (
                <input
                  id="certificationBoard"
                  type="text"
                  {...field}
                  placeholder="Certification Board"
                  className={`${inputClasses} ${errors.certificationBoard ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                />
              )}
            />
            <label htmlFor="certificationBoard" className={labelClasses}>
              Certification Board
            </label>
          </div>
          {errors.certificationBoard && (
            <p className="text-xs text-red-500 ml-1">{errors.certificationBoard.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
          {/* Certification Year */}
          <div className="space-y-1">
            <div className="relative">
              <Controller
                control={control}
                name="certificationYear"
                render={({ field }) => (
                  <select
                    id="certificationYear"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                    className={`${inputClasses} pt-4 appearance-none`}
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                )}
              />
              <label htmlFor="certificationYear" className={labelClasses}>
                Certification Year
              </label>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
            </div>
            {errors.certificationYear && (
              <p className="text-xs text-red-500 ml-1">{errors.certificationYear.message}</p>
            )}
          </div>

          {/* License Expiry Date */}
          <div className="space-y-1">
            <div className="relative">
              <Controller
                control={control}
                name="licenseExpiryDate"
                render={({ field }) => (
                  <input
                    id="licenseExpiryDate"
                    type="date"
                    {...field}
                    min={new Date().toISOString().split("T")[0]}
                    className={`${inputClasses} pt-4`}
                  />
                )}
              />
              <label htmlFor="licenseExpiryDate" className="absolute text-xs text-gray-500 top-2 left-4">
                License Expiry Date
              </label>
            </div>
            {errors.licenseExpiryDate && (
              <p className="text-xs text-red-500 ml-1">{errors.licenseExpiryDate.message}</p>
            )}
          </div>
        </div>

        {/* License Document Upload */}
        <div className="space-y-2">
          <Controller
            name="licenseDocument"
            control={control}
            rules={{ required: "License document is required" }}
            render={({ field, fieldState }) => (
              <>
                <FileUpload
                  id="license-upload"
                  label="License Document *"
                  helpText="Upload a scan or photo of your professional license (PDF, PNG, or JPG, max 10MB)"
                  accept="application/pdf,image/jpeg,image/png,image/jpg"
                  onChange={(selectedFiles) => {
                    const file = selectedFiles instanceof File ? selectedFiles : null;
                    field.onChange(file || undefined);
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
                  <p className="text-sm text-green-600 font-medium flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    {licenseFile.name} ({(licenseFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                {fieldState.error && (
                  <p className="text-xs text-red-500 ml-1">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            )}
          />
        </div>

        {/* Additional Certificates */}
        <div className="space-y-2">
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
              <p className="font-medium mb-1">Selected certificates:</p>
              <ul className="space-y-1">
                {certificates.map((cert, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    {cert.name} ({(cert.size / 1024 / 1024).toFixed(2)} MB)
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* How did you hear about us? */}
        <div className="space-y-1">
          <div className="relative">
            <Controller
              control={control}
              name="referralSource"
              render={({ field }) => (
                <select
                  id="referralSource"
                  {...field}
                  className={`${inputClasses} pt-4 appearance-none`}
                >
                  <option value="" disabled>Select an option</option>
                  <option value="Social Media (Instagram, Twitter, LinkedIn)">Social Media (Instagram, Twitter, LinkedIn)</option>
                  <option value="Google Search">Google Search</option>
                  <option value="Friend or Colleague">Friend or Colleague</option>
                  <option value="Event or Conference">Event or Conference</option>
                  <option value="Email Newsletter">Email Newsletter</option>
                  <option value="Other">Other</option>
                </select>
              )}
            />
            <label htmlFor="referralSource" className={labelClasses}>
              How did you hear about us? *
            </label>
            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </div>
          </div>
          {errors.referralSource && (
            <p className="text-xs text-red-500 ml-1">{errors.referralSource.message}</p>
          )}
        </div>

        {/* Terms and Conditions */}
        <div className="flex items-start p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center h-5 mt-1">
            <Controller
              control={control}
              name="termsAccepted"
              render={({ field }) => (
                <input
                  id="termsAccepted"
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="w-5 h-5 text-[#005b57] border-gray-300 rounded focus:ring-[#005b57]"
                />
              )}
            />
          </div>
          <div className="ml-3 text-sm">
            <label
              htmlFor="termsAccepted"
              className={`font-medium block mb-1 ${errors.termsAccepted ? "text-red-500" : "text-gray-900"
                }`}
            >
              I accept the terms and conditions *
            </label>
            <p className="text-gray-500 leading-relaxed">
              By accepting, you agree to our professional standards and data usage policies.
            </p>
            {errors.termsAccepted && (
              <p className="mt-1 text-xs text-red-500">
                {errors.termsAccepted.message}
              </p>
            )}
          </div>
        </div>

        {/* Sticky Mobile / Regular Desktop Buttons */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 sm:static sm:bg-transparent sm:border-0 sm:p-0 z-40">
          <div className="max-w-4xl mx-auto w-full flex gap-4">
            <button
              type="button"
              onClick={onPrev}
              disabled={isSubmitting || isUploading}
              className="hidden sm:flex h-12 px-6 items-center justify-center text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Previous
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isUploading || !physiotherapistProfileId || isLoading}
              className="flex-1 h-14 sm:h-12 flex items-center justify-center gap-2 text-base sm:text-sm font-semibold bg-[#005b57] text-white rounded-xl sm:rounded-lg hover:bg-[#00443e] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 shadow-lg sm:shadow-none"
            >
              {isLoading ? (
                'Setting up profile...'
              ) : isSubmitting || isUploading ? (
                <>
                  Processing...
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </>
              ) : (
                <>
                  Save & Complete
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