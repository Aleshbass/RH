'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Controller } from 'react-hook-form';

import { useOnboardingStore } from '@/stores/onboardingStore';
import { useFormWithZod } from '@/lib/hooks/useFormWithZod';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import LocationSearch from '@/components/marketplace/LocationSearch';
import { ChevronRight, ChevronLeft, Plus, X } from 'lucide-react';

const formSchema = z.object({
  specializations: z.array(z.string()).optional(),
  licenseNumber: z.string().min(1, 'License number is required'),
  yearsOfExperience: z.number().min(0, 'Years of experience must be a positive number'),
  bio: z.string().optional(),
  location: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ProfessionalDetailsFormProps {
  onNext: () => void;
  onPrev: () => void;
}

export default function ProfessionalDetailsForm({ onNext, onPrev }: ProfessionalDetailsFormProps) {
  const { data, updatePhysiotherapistData } = useOnboardingStore();
  const [specialization, setSpecialization] = useState('');
  const [specializations, setSpecializations] = useState<string[]>(data.physiotherapistData.specializations || []);
  const completeUserProfileMutation = useMutation(api.users.completeUserProfile);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);

  const { register, control, handleSubmit, formState: { errors, isSubmitting: isFormSubmitting } } = useFormWithZod(
    formSchema,
    {
      defaultValues: {
        specializations: data.physiotherapistData.specializations || [],
        licenseNumber: data.physiotherapistData.licenseNumber || '',
        yearsOfExperience: data.physiotherapistData.yearsOfExperience || 0,
        bio: data.physiotherapistData.bio || '',
        location: data.physiotherapistData.location || '',
      },
      onSubmit: async (values: FormValues) => {
        setIsSubmittingProfile(true);
        const updatedData = {
          ...values,
          specializations,
        };
        updatePhysiotherapistData(updatedData);

        const profilePayload = {
          role: "physiotherapist" as const,
          profileData: {
            specializations: updatedData.specializations,
            licenseNumber: updatedData.licenseNumber,
            yearsOfExperience: updatedData.yearsOfExperience,
            bio: updatedData.bio,
            location: updatedData.location,
          },
          firstName: data.physiotherapistData.firstName,
          lastName: data.physiotherapistData.lastName,
          finalStep: false, // Indicate this is not the final step
        };

        try {
          console.log("[ProfessionalDetailsForm] Calling completeUserProfile with payload:", profilePayload);
          const result = await completeUserProfileMutation(profilePayload);
          console.log("[ProfessionalDetailsForm] completeUserProfile result:", result);

          if (result.success) {
            toast.success("Professional details saved!", { description: "Proceeding to the next step." });
            onNext();
          } else {
            console.error("[ProfessionalDetailsForm] Failed to complete user profile:", result.message);
            toast.error("Error", { description: result.message || "Failed to save professional details. Please try again." });
          }
        } catch (error) {
          console.error("[ProfessionalDetailsForm] Error calling completeUserProfile:", error);
          toast.error("Error", { description: "An unexpected error occurred while saving your details. Please try again." });
        } finally {
          setIsSubmittingProfile(false);
        }
      },
    }
  );

  const addSpecialization = () => {
    if (specialization && !specializations.includes(specialization)) {
      const newSpecializations = [...specializations, specialization];
      setSpecializations(newSpecializations);
      setSpecialization('');
    }
  };

  const removeSpecialization = (index: number) => {
    const newSpecializations = [...specializations];
    newSpecializations.splice(index, 1);
    setSpecializations(newSpecializations);
  };

  const inputClasses = "block w-full h-14 px-4 pt-5 pb-2 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 peer placeholder-transparent";
  const labelClasses = "absolute text-sm text-gray-500 duration-200 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-[#005b57]";

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 sm:pb-0">
      <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">

        {/* License Number */}
        <div className="space-y-1">
          <div className="relative">
            <input
              id="licenseNumber"
              type="text"
              placeholder="License Number"
              className={`${inputClasses} ${errors.licenseNumber ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
              {...register('licenseNumber')}
            />
            <label htmlFor="licenseNumber" className={labelClasses}>
              License Number
            </label>
          </div>
          {errors.licenseNumber && (
            <p className="text-xs text-red-500 ml-1">{errors.licenseNumber.message}</p>
          )}
        </div>

        {/* Years of Experience */}
        <div className="space-y-1">
          <div className="relative">
            <input
              id="yearsOfExperience"
              type="number"
              min="0"
              placeholder="Years of Experience"
              className={`${inputClasses} ${errors.yearsOfExperience ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
              {...register('yearsOfExperience', { valueAsNumber: true })}
            />
            <label htmlFor="yearsOfExperience" className={labelClasses}>
              Years of Experience
            </label>
          </div>
          {errors.yearsOfExperience && (
            <p className="text-xs text-red-500 ml-1">{errors.yearsOfExperience.message}</p>
          )}
        </div>

        {/* Location */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Practice Location</label>
          <Controller
            control={control}
            name="location"
            render={({ field }) => (
              <LocationSearch
                value={field.value || ''}
                onChange={field.onChange}
                className="w-full"
              />
            )}
          />
        </div>

        {/* Specializations */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 ml-1">Specializations</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className="block w-full h-12 pl-4 pr-10 text-base border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] bg-gray-50 appearance-none"
              >
                <option value="">Select specialization</option>
                <option value="Orthopedic">Orthopedic</option>
                <option value="Neurological">Neurological</option>
                <option value="Pediatric">Pediatric</option>
                <option value="Geriatric">Geriatric</option>
                <option value="Sports">Sports</option>
                <option value="Cardiovascular">Cardiovascular</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <button
              type="button"
              onClick={addSpecialization}
              className="h-12 w-12 flex items-center justify-center bg-[#005b57] text-white rounded-xl hover:bg-[#00443e] transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>

          {specializations.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {specializations.map((spec, index) => (
                <div key={index} className="bg-[#E6F0EF] text-[#005b57] rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm font-medium">
                  <span>{spec}</span>
                  <button
                    type="button"
                    onClick={() => removeSpecialization(index)}
                    className="text-[#005b57]/70 hover:text-[#005b57]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bio */}
        <div className="space-y-1">
          <div className="relative">
            <textarea
              id="bio"
              placeholder="Professional Bio"
              rows={4}
              className={`block w-full px-4 py-4 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 placeholder-gray-400 resize-none ${errors.bio ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
              {...register('bio')}
            />
          </div>
          {errors.bio && (
            <p className="text-xs text-red-500 ml-1">{errors.bio.message}</p>
          )}
        </div>

        {/* Sticky Mobile / Regular Desktop Buttons */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 sm:static sm:bg-transparent sm:border-0 sm:p-0 z-40">
          <div className="max-w-4xl mx-auto w-full flex gap-4">
            <button
              type="button"
              onClick={onPrev}
              disabled={isFormSubmitting || isSubmittingProfile}
              className="hidden sm:flex h-12 px-6 items-center justify-center text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Previous
            </button>

            <button
              type="submit"
              disabled={isFormSubmitting || isSubmittingProfile}
              className="flex-1 h-14 sm:h-12 flex items-center justify-center gap-2 text-base sm:text-sm font-semibold bg-[#005b57] text-white rounded-xl sm:rounded-lg hover:bg-[#00443e] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:active:scale-100 shadow-lg sm:shadow-none"
            >
              {isSubmittingProfile ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isFormSubmitting ? "Validating..." : "Next"}
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