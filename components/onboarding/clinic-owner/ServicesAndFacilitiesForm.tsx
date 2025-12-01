'use client';

import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, ChevronLeft } from 'lucide-react';

// Validation schema
const servicesAndFacilitiesSchema = z.object({
  services: z.array(z.string()).min(1, 'Please select at least one service'),
  specialties: z.array(z.string()).min(1, 'Please select at least one specialty'),
  facilities: z.array(z.string()).min(1, 'Please select at least one facility'),
  equipmentAvailable: z.string().optional(),
  operatingHours: z.string().min(5, 'Please provide your operating hours'),
  additionalNotes: z.string().optional(),
});

type ServicesAndFacilitiesData = z.infer<typeof servicesAndFacilitiesSchema>;

interface ServicesAndFacilitiesFormProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ServicesAndFacilitiesForm({ onNext, onBack }: ServicesAndFacilitiesFormProps) {
  const { data, updateClinicOwnerData } = useOnboardingStore();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ServicesAndFacilitiesData>({
    resolver: zodResolver(servicesAndFacilitiesSchema),
    defaultValues: {
      services: data.clinicOwnerData?.services || [],
      specialties: data.clinicOwnerData?.specialties || [],
      facilities: data.clinicOwnerData?.facilities || [],
      equipmentAvailable: Array.isArray(data.clinicOwnerData?.equipmentAvailable)
        ? data.clinicOwnerData?.equipmentAvailable.join(', ')
        : data.clinicOwnerData?.equipmentAvailable || '',
      operatingHours: data.clinicOwnerData?.operatingHours || '',
      additionalNotes: data.clinicOwnerData?.additionalNotes || '',
    },
  });

  const onSubmit = (formData: ServicesAndFacilitiesData) => {
    console.log('Form data:', formData);

    // Update store with form values
    updateClinicOwnerData({
      ...data.clinicOwnerData,
      services: formData.services,
      specialties: formData.specialties,
      facilities: formData.facilities,
      equipmentAvailable: formData.equipmentAvailable
        ? formData.equipmentAvailable.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      operatingHours: formData.operatingHours,
      additionalNotes: formData.additionalNotes,
    });
    onNext();
  };

  // Available options
  const serviceOptions = [
    'Physical Therapy',
    'Occupational Therapy',
    'Speech Therapy',
    'Massage Therapy',
    'Chiropractic Care',
    'Sports Medicine',
    'Neurological Rehabilitation',
    'Orthopedic Rehabilitation',
    'Pediatric Rehabilitation',
    'Geriatric Rehabilitation',
  ];

  const specialtyOptions = [
    'Back & Neck Pain',
    'Sports Injuries',
    'Post-Surgical Rehabilitation',
    'Stroke Rehabilitation',
    'Balance & Vestibular Therapy',
    'Orthopedic Conditions',
    'Neurological Conditions',
    'Chronic Pain Management',
    'Hand Therapy',
    'Pelvic Health',
    'Workplace Injuries',
  ];

  const facilityOptions = [
    'Private Treatment Rooms',
    'Open Gym Area',
    'Hydrotherapy Pool',
    'Accessible Entrance/Facilities',
    'Parking',
    'Waiting Area',
    'Children\'s Play Area',
    'Exercise Equipment',
    'Telehealth Services',
    'Consultation Rooms',
  ];

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
          <h2 className="text-xl sm:text-2xl font-bold text-[#005b57]">Services & Facilities</h2>
          <p className="text-gray-600 mt-2">
            Tell us about the services and facilities your clinic offers
          </p>
        </motion.div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Services Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[#005b57]">Services Offered</h3>
              <p className="text-sm text-gray-600">Select all services that your clinic offers</p>
            </div>
            <Controller
              name="services"
              control={control}
              render={({ field }) => (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {serviceOptions.map((service) => (
                      <div key={service} className="relative">
                        <Checkbox
                          id={`service-${service}`}
                          checked={field.value.includes(service)}
                          onCheckedChange={(checked) => {
                            const newServices = checked
                              ? [...field.value, service]
                              : field.value.filter((s: string) => s !== service);
                            field.onChange(newServices);
                          }}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`service-${service}`}
                          className="flex items-center p-3 bg-white border border-gray-200 rounded-xl cursor-pointer transition-all duration-200 hover:border-[#005b57]/50 peer-data-[state=checked]:border-[#005b57] peer-data-[state=checked]:bg-[#005b57]/5 peer-data-[state=checked]:text-[#005b57]"
                        >
                          <span className="text-sm font-medium">{service}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                  {errors.services && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.services.message}
                    </p>
                  )}
                </>
              )}
            />
          </motion.div>

          {/* Specialties Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[#005b57]">Specialties</h3>
              <p className="text-sm text-gray-600">Select all specialties that your clinic focuses on</p>
            </div>
            <Controller
              name="specialties"
              control={control}
              render={({ field }) => (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {specialtyOptions.map((specialty) => (
                      <div key={specialty} className="relative">
                        <Checkbox
                          id={`specialty-${specialty}`}
                          checked={field.value.includes(specialty)}
                          onCheckedChange={(checked) => {
                            const newSpecialties = checked
                              ? [...field.value, specialty]
                              : field.value.filter((s: string) => s !== specialty);
                            field.onChange(newSpecialties);
                          }}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`specialty-${specialty}`}
                          className="flex items-center p-3 bg-white border border-gray-200 rounded-xl cursor-pointer transition-all duration-200 hover:border-[#005b57]/50 peer-data-[state=checked]:border-[#005b57] peer-data-[state=checked]:bg-[#005b57]/5 peer-data-[state=checked]:text-[#005b57]"
                        >
                          <span className="text-sm font-medium">{specialty}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                  {errors.specialties && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.specialties.message}
                    </p>
                  )}
                </>
              )}
            />
          </motion.div>

          {/* Facilities Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-[#005b57]">Facilities</h3>
              <p className="text-sm text-gray-600">Select all facilities available at your clinic</p>
            </div>
            <Controller
              name="facilities"
              control={control}
              render={({ field }) => (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {facilityOptions.map((facility) => (
                      <div key={facility} className="relative">
                        <Checkbox
                          id={`facility-${facility}`}
                          checked={field.value.includes(facility)}
                          onCheckedChange={(checked) => {
                            const newFacilities = checked
                              ? [...field.value, facility]
                              : field.value.filter((f: string) => f !== facility);
                            field.onChange(newFacilities);
                          }}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`facility-${facility}`}
                          className="flex items-center p-3 bg-white border border-gray-200 rounded-xl cursor-pointer transition-all duration-200 hover:border-[#005b57]/50 peer-data-[state=checked]:border-[#005b57] peer-data-[state=checked]:bg-[#005b57]/5 peer-data-[state=checked]:text-[#005b57]"
                        >
                          <span className="text-sm font-medium">{facility}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                  {errors.facilities && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.facilities.message}
                    </p>
                  )}
                </>
              )}
            />
          </motion.div>

          {/* Operating Hours */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="operatingHours" className={labelClasses}>
              Operating Hours <span className="text-red-500">*</span>
            </Label>
            <Controller
              name="operatingHours"
              control={control}
              render={({ field }) => (
                <>
                  <Textarea
                    id="operatingHours"
                    placeholder="Specify your clinic's operating hours (e.g., Mon-Fri: 9AM-6PM, Sat: 9AM-2PM, Sun: Closed)"
                    className={`${inputClasses} min-h-[100px] resize-none`}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                  />
                  {errors.operatingHours && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.operatingHours.message}
                    </p>
                  )}
                </>
              )}
            />
          </motion.div>

          {/* Equipment Available */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="equipmentAvailable" className={labelClasses}>
              Equipment Available <span className="text-sm font-normal text-gray-500">(optional)</span>
            </Label>
            <Controller
              name="equipmentAvailable"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="equipmentAvailable"
                  placeholder="List any specialized equipment available at your clinic"
                  className={`${inputClasses} min-h-[100px] resize-none`}
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
          </motion.div>

          {/* Additional Notes */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="additionalNotes" className={labelClasses}>
              Additional Notes <span className="text-sm font-normal text-gray-500">(optional)</span>
            </Label>
            <Controller
              name="additionalNotes"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="additionalNotes"
                  placeholder="Any additional information about your services or facilities"
                  className={`${inputClasses} min-h-[100px] resize-none`}
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
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
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Continue
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