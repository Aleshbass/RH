'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, Loader2 } from '@/components/icons';
import LocationSearch from '@/components/marketplace/LocationSearch';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PatientData } from '@/stores/onboardingStore';
import { POLICIES } from '@/lib/policies';
import { cn } from '@/lib/utils';
import { MONTHS, toMonthDay } from '@/convex/helpers/careMoments';

const policyLink = 'font-medium text-rh-ink underline underline-offset-2 hover:text-black';

// Form schema with Zod validation
const patientInfoSchema = z.object({
  // Required at sign-up: Terms and Privacy. Recorded in Convex (users.completeUserProfile acceptedPolicies).
  acceptTerms: z.boolean().refine((value) => value === true, 'Please agree to the Terms of Service and Privacy Policy'),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phoneNumber: z.string().min(10, 'Please enter a valid phone number'),
  // A real birthday, not an age: care teams use it to wish them a happy birthday (convex/careMoments.ts)
  birthDay: z.coerce.number({ invalid_type_error: 'Choose the day' }).int().min(1, 'Choose the day').max(31),
  birthMonth: z.coerce.number({ invalid_type_error: 'Choose the month' }).int().min(1, 'Choose the month').max(12),
  birthYear: z.coerce.number({ invalid_type_error: 'Choose the year' }).int().min(1900, 'Choose the year'),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say'], {
    required_error: "Please select your gender",
  }),
  location: z.string().min(2, 'Location is required'),
  therapyFor: z.string().min(1, 'Please select who this therapy is for'),
});

export type PatientInfoValues = z.infer<typeof patientInfoSchema>;

/** Why a birthday can't be used, or null: a real date, and 17 to 99 years old. */
function birthdayProblem(day?: number, month?: number, year?: number): string | null {
  if (!day || !month || !year) return 'Choose your day, month and year of birth';
  const monthDay = toMonthDay(month, day, year);
  if (!monthDay) return 'That date doesn’t exist. Please check the day.';
  const today = new Date();
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  if (age < 17) return 'You must be at least 17 years old';
  if (age > 99) return 'Please check the year';
  return null;
}

const THIS_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 99 - 17 + 1 }, (_, i) => THIS_YEAR - 17 - i);
const selectClass = 'h-14 w-full rounded-xl border-2 bg-white px-3 text-base text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-teal-500';

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

const steps = [
  { id: 'personal', title: 'Personal Info' },
  { id: 'therapy-for', title: 'Therapy For' },
  { id: 'gender', title: 'Gender' },
  { id: 'birthday', title: 'Birthday' },
  { id: 'location', title: 'Location' },
  { id: 'consent', title: 'Consent' },
];

export default function PersonalInfoForm({
  initialData,
  invitationInfo,
  invitationCode,
  onSubmit,
  onBack
}: PersonalInfoFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  // A birthday they already entered (going back a step keeps it in the onboarding store)
  const savedBirthday = /^\d{4}-\d{2}-\d{2}$/.test(initialData?.dateOfBirth ?? '')
    ? initialData!.dateOfBirth!.split('-').map(Number)
    : null;

  const { control, handleSubmit, trigger, watch, setValue, setError, getValues, formState: { errors, isSubmitting } } = useForm<PatientInfoValues>({
    resolver: zodResolver(patientInfoSchema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      email: initialData?.email || '',
      phoneNumber: initialData?.phoneNumber || '',
      birthDay: savedBirthday?.[2],
      birthMonth: savedBirthday?.[1],
      birthYear: savedBirthday?.[0],
      gender: initialData?.gender || undefined,
      location: initialData?.location || '',
      therapyFor: initialData?.therapyFor || '',
      acceptTerms: false,
    }
  });

  // Update form values when initialData changes (e.g. when user data is fetched)
  useEffect(() => {
    if (initialData) {
      const currentValues = control._formValues;
      // Only reset if we have new data and the fields are currently empty
      // This prevents overwriting user input if they started typing before data loaded
      const shouldReset =
        (initialData.firstName && !currentValues.firstName) ||
        (initialData.lastName && !currentValues.lastName) ||
        (initialData.email && !currentValues.email);

      if (shouldReset) {
        control._reset({
          firstName: initialData.firstName || '',
          lastName: initialData.lastName || '',
          email: initialData.email || '',
          phoneNumber: initialData.phoneNumber || '',
          birthDay: currentValues.birthDay,
          birthMonth: currentValues.birthMonth,
          birthYear: currentValues.birthYear,
          gender: initialData.gender || undefined,
          location: initialData.location || '',
          therapyFor: initialData.therapyFor || '',
          acceptTerms: Boolean(currentValues.acceptTerms),
        });
      }
    }
  }, [initialData, control]);

  // Watch values for conditional rendering or auto-advancing (optional)
  const therapyForValue = watch('therapyFor');
  const genderValue = watch('gender');

  const nextStep = async () => {
    let fieldsToValidate: (keyof PatientInfoValues)[] = [];

    switch (currentStep) {
      case 0: // Personal Info
        fieldsToValidate = ['firstName', 'lastName', 'email', 'phoneNumber'];
        break;
      case 1: // Therapy For
        fieldsToValidate = ['therapyFor'];
        break;
      case 2: // Gender
        fieldsToValidate = ['gender'];
        break;
      case 3: // Birthday
        fieldsToValidate = ['birthDay', 'birthMonth', 'birthYear'];
        break;
      case 4: // Location
        fieldsToValidate = ['location'];
        break;
      case 5: // Consent
        fieldsToValidate = ['acceptTerms'];
        break;
    }

    let isStepValid = await trigger(fieldsToValidate);
    if (isStepValid && currentStep === 3) {
      const { birthDay, birthMonth, birthYear } = getValues();
      const problem = birthdayProblem(birthDay, birthMonth, birthYear);
      if (problem) {
        setError('birthDay', { type: 'validate', message: problem });
        isStepValid = false;
      }
    }

    if (isStepValid) {
      if (currentStep < steps.length - 1) {
        setDirection(1);
        setCurrentStep(prev => prev + 1);
      } else {
        handleSubmit(onSubmit)();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    } else {
      onBack();
    }
  };

  // Animation variants
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 50 : -50,
      opacity: 0,
    }),
  };

  // If invalid invitation AND code was provided, show error
  if (invitationCode && !invitationInfo?.isValid) {
    return (
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-xl">
        <div className="p-4 border border-red-300 bg-red-50 rounded-md text-red-800">
          <h3 className="font-bold text-lg">Invalid Invitation</h3>
          <p>{invitationInfo?.message || 'Invalid invitation code.'}</p>
        </div>
        <Button onClick={onBack} className="w-full">Back to Homepage</Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-teal-600"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400 font-medium uppercase tracking-wider">
          <span>Step {currentStep + 1} of {steps.length}</span>
          <span>{steps[currentStep].title}</span>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        <div className="min-h-[300px] relative overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentStep}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              className="w-full"
            >
              {/* Step 1: Personal Info */}
              {currentStep === 0 && (
                <div className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Let's get to know you</h2>
                    <p className="text-gray-500">Please confirm your personal details</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Controller
                        control={control}
                        name="firstName"
                        render={({ field }) => (
                          <Input {...field} placeholder="First Name" className={errors.firstName ? "border-red-500" : ""} />
                        )}
                      />
                      {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Controller
                        control={control}
                        name="lastName"
                        render={({ field }) => (
                          <Input {...field} placeholder="Last Name" className={errors.lastName ? "border-red-500" : ""} />
                        )}
                      />
                      {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Controller
                      control={control}
                      name="email"
                      render={({ field }) => (
                        <Input {...field} type="email" placeholder="Email Address" className={errors.email ? "border-red-500" : ""} />
                      )}
                    />
                    {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">Phone Number</Label>
                    <Controller
                      control={control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <Input {...field} placeholder="Phone Number" className={errors.phoneNumber ? "border-red-500" : ""} />
                      )}
                    />
                    {errors.phoneNumber && <p className="text-xs text-red-500">{errors.phoneNumber.message}</p>}
                  </div>
                </div>
              )}

              {/* Step 2: Therapy For */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Who is this therapy for?</h2>
                    <p className="text-gray-500">Select the best option that describes your needs</p>
                  </div>

                  <Controller
                    control={control}
                    name="therapyFor"
                    render={({ field }) => (
                      <div className="grid grid-cols-1 gap-3">
                        {[
                          { value: 'myself', label: 'For myself', desc: 'I need physiotherapy myself' },
                          { value: 'partner', label: 'For my partner', desc: 'My husband or wife needs physiotherapy' },
                          { value: 'child', label: 'For my child', desc: 'My child needs physiotherapy' },
                          { value: 'family_member', label: 'For a family member', desc: 'A parent or relative needs physiotherapy' }
                        ].map((option) => (
                          <div
                            key={option.value}
                            onClick={() => field.onChange(option.value)}
                            className={cn(
                              "p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 flex items-center justify-between group hover:border-teal-200 hover:bg-teal-50/50",
                              field.value === option.value
                                ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600"
                                : "border-gray-100 bg-white"
                            )}
                          >
                            <div>
                              <h3 className={cn(
                                "font-semibold text-lg",
                                field.value === option.value ? "text-teal-900" : "text-gray-900"
                              )}>{option.label}</h3>
                              <p className="text-sm text-gray-500">{option.desc}</p>
                            </div>
                            {field.value === option.value && (
                              <div className="h-6 w-6 bg-teal-600 rounded-full flex items-center justify-center text-white">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  />
                  {errors.therapyFor && <p className="text-center text-sm text-red-500">{errors.therapyFor.message}</p>}
                </div>
              )}

              {/* Step 3: Gender */}
              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">How do you identify?</h2>
                    <p className="text-gray-500">This helps us personalize your experience</p>
                  </div>

                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <div className="grid grid-cols-1 gap-3">
                        {['male', 'female', 'other', 'prefer_not_to_say'].map((option) => (
                          <div
                            key={option}
                            onClick={() => field.onChange(option)}
                            className={cn(
                              "p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 flex items-center justify-between hover:border-teal-200 hover:bg-teal-50/50",
                              field.value === option
                                ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600"
                                : "border-gray-100 bg-white"
                            )}
                          >
                            <span className="capitalize font-medium text-lg text-gray-900">
                              {option.replace(/_/g, ' ')}
                            </span>
                            {field.value === option && (
                              <div className="h-6 w-6 bg-teal-600 rounded-full flex items-center justify-center text-white">
                                <Check className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  />
                  {errors.gender && <p className="text-center text-sm text-red-500">{errors.gender.message}</p>}
                </div>
              )}

              {/* Step 4: Birthday */}
              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">When&apos;s your birthday?</h2>
                    <p className="text-gray-500">It helps us give you age-appropriate care, and your care team can celebrate with you</p>
                  </div>

                  <div className="mx-auto grid max-w-md grid-cols-[1fr_1.6fr_1.2fr] gap-2">
                    {([
                      { name: 'birthDay', label: 'Day', options: Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })) },
                      { name: 'birthMonth', label: 'Month', options: MONTHS.map((month, i) => ({ value: i + 1, label: month })) },
                      { name: 'birthYear', label: 'Year', options: BIRTH_YEARS.map((year) => ({ value: year, label: String(year) })) },
                    ] as const).map(({ name, label, options }) => (
                      <Controller
                        key={name}
                        control={control}
                        name={name}
                        render={({ field }) => (
                          <label className="block">
                            <span className="sr-only">{label}</span>
                            <select
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              onBlur={field.onBlur}
                              className={cn(selectClass, errors[name] || errors.birthDay ? 'border-red-500' : 'border-gray-200')}
                            >
                              <option value="">{label}</option>
                              {options.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      />
                    ))}
                  </div>
                  {(errors.birthDay || errors.birthMonth || errors.birthYear) && (
                    <p className="text-center text-sm text-red-500">
                      {(errors.birthDay ?? errors.birthMonth ?? errors.birthYear)?.message}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 text-center">
                    You must be 17 or older. Only your care team sees your birthday.
                  </p>
                </div>
              )}

              {/* Step 5: Location */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-gray-900">Where are you located?</h2>
                    <p className="text-gray-500">To find physiotherapists near you</p>
                  </div>

                  <div className="max-w-sm mx-auto">
                    <Controller
                      control={control}
                      name="location"
                      render={({ field }) => (
                        <div className="relative">
                          <LocationSearch
                            value={field.value}
                            onChange={(value) => field.onChange(value)}
                            className="w-full"
                          />
                        </div>
                      )}
                    />
                    {errors.location && <p className="text-center text-sm text-red-500 mt-2">{errors.location.message}</p>}
                    <p className="text-xs text-gray-400 text-center mt-4">
                      We'll use this to show you relevant results in your area.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 6: Terms and Privacy (required) */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">Before you start</h2>
                    <p className="text-gray-500">Please read and agree to continue.</p>
                  </div>

                  <Controller
                    control={control}
                    name="acceptTerms"
                    render={({ field }) => (
                      <label
                        htmlFor="acceptTerms"
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors',
                          field.value ? 'border-rh-lime bg-rh-honeydew' : 'border-gray-100 bg-white hover:bg-gray-50'
                        )}
                      >
                        <Checkbox
                          id="acceptTerms"
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          className="mt-0.5"
                        />
                        <span className="text-sm leading-relaxed text-gray-800">
                          I agree to the{' '}
                          <a href={POLICIES.terms.href} target="_blank" rel="noopener noreferrer" className={policyLink}>
                            Terms of Service
                          </a>{' '}
                          and the{' '}
                          <a href={POLICIES.privacy.href} target="_blank" rel="noopener noreferrer" className={policyLink}>
                            Privacy Policy
                          </a>
                          .
                        </span>
                      </label>
                    )}
                  />
                  {errors.acceptTerms && <p className="text-sm text-red-500">{errors.acceptTerms.message}</p>}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6 mt-6 border-t border-gray-100">
          <Button
            type="button"
            onClick={prevStep}
            variant="ghost"
            className="text-gray-500 hover:text-gray-900 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button
            type="button"
            onClick={nextStep}
            disabled={isSubmitting || (currentStep === 5 && !watch('acceptTerms'))}
            className="bg-teal-600 hover:bg-teal-700 text-white min-w-[120px] h-12 rounded-xl shadow-lg shadow-teal-600/20"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : currentStep === steps.length - 1 ? (
              'Complete'
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
