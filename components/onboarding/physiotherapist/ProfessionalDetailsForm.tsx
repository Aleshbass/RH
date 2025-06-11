'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useFormWithZod } from '@/lib/hooks/useFormWithZod';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner'; // Changed to sonner

const formSchema = z.object({
  specializations: z.array(z.string()).optional(),
  licenseNumber: z.string().min(1, 'License number is required'),
  yearsOfExperience: z.number().min(0, 'Years of experience must be a positive number'),
  bio: z.string().optional(),
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

  const { register, handleSubmit, formState: { errors, isSubmitting: isFormSubmitting } } = useFormWithZod(
    formSchema,
    {
      defaultValues: {
        specializations: data.physiotherapistData.specializations || [],
        licenseNumber: data.physiotherapistData.licenseNumber || '',
        yearsOfExperience: data.physiotherapistData.yearsOfExperience || 0,
        bio: data.physiotherapistData.bio || '',
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
            toast.success("Professional details saved!", { description: "Proceeding to the next step." }); // Changed to sonner toast
            onNext();
          } else {
            console.error("[ProfessionalDetailsForm] Failed to complete user profile:", result.message);
            toast.error("Error", { description: result.message || "Failed to save professional details. Please try again." }); // Changed to sonner toast
          }
        } catch (error) {
          console.error("[ProfessionalDetailsForm] Error calling completeUserProfile:", error);
          toast.error("Error", { description: "An unexpected error occurred while saving your details. Please try again." }); // Changed to sonner toast
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

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Professional Details</CardTitle>
        <CardDescription>
          Please provide your professional information to complete your profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <Label htmlFor="licenseNumber">License Number</Label>
            <Input
              id="licenseNumber"
              placeholder="Enter your license number"
              {...register('licenseNumber')}
              aria-invalid={!!errors.licenseNumber}
            />
            {errors.licenseNumber && (
              <p className="text-sm text-red-500 mt-1">{errors.licenseNumber.message}</p>
            )}
          </div>

          <div className="space-y-4">
            <Label htmlFor="yearsOfExperience">Years of Experience</Label>
            <Input
              id="yearsOfExperience"
              type="number"
              min="0"
              placeholder="Years of experience"
              {...register('yearsOfExperience', { valueAsNumber: true })}
              aria-invalid={!!errors.yearsOfExperience}
            />
            {errors.yearsOfExperience && (
              <p className="text-sm text-red-500 mt-1">{errors.yearsOfExperience.message}</p>
            )}
          </div>

          <div className="space-y-4">
            <Label>Specializations</Label>
            <div className="flex gap-2">
              <Select
                value={specialization}
                onValueChange={setSpecialization}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select specialization" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Orthopedic">Orthopedic</SelectItem>
                  <SelectItem value="Neurological">Neurological</SelectItem>
                  <SelectItem value="Pediatric">Pediatric</SelectItem>
                  <SelectItem value="Geriatric">Geriatric</SelectItem>
                  <SelectItem value="Sports">Sports</SelectItem>
                  <SelectItem value="Cardiovascular">Cardiovascular</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={addSpecialization}>Add</Button>
            </div>
            {specializations.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {specializations.map((spec, index) => (
                  <div key={index} className="bg-gray-100 rounded-md px-3 py-1 flex items-center gap-2">
                    <span>{spec}</span>
                    <button
                      type="button"
                      onClick={() => removeSpecialization(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Label htmlFor="bio">Professional Bio</Label>
            <Textarea
              id="bio"
              placeholder="Tell us about your professional background"
              rows={4}
              {...register('bio')}
              aria-invalid={!!errors.bio}
            />
            {errors.bio && (
              <p className="text-sm text-red-500 mt-1">{errors.bio.message}</p>
            )}
          </div>

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" onClick={onPrev} disabled={isFormSubmitting || isSubmittingProfile}>
              Previous
            </Button>
            <Button type="submit" disabled={isFormSubmitting || isSubmittingProfile}>
              {isSubmittingProfile ? "Saving..." : (isFormSubmitting ? "Validating..." : "Next")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}