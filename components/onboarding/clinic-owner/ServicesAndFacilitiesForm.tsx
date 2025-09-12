'use client';

import { motion } from 'framer-motion';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
    formState: { errors },
  } = useForm<ServicesAndFacilitiesData>({
    resolver: zodResolver(servicesAndFacilitiesSchema),
    defaultValues: {
      services: data.clinicOwnerData?.services || [],
      specialties: data.clinicOwnerData?.specialties || [],
      facilities: data.clinicOwnerData?.facilities || [],
      equipmentAvailable: data.clinicOwnerData?.equipmentAvailable || '',
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
      equipmentAvailable: formData.equipmentAvailable,
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="space-y-6"
      >
        <motion.div variants={itemVariants}>
          <h2 className="text-xl sm:text-2xl font-bold text-[#005b57] mb-1">Services & Facilities</h2>
          <p className="text-[#002e2c] mb-4 sm:mb-6">
            Tell us about the services and facilities your clinic offers
          </p>
        </motion.div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Services Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h3 className="text-lg font-medium text-[#005b57]">Services Offered</h3>
            <p className="text-sm text-gray-600 mb-2">Select all services that your clinic offers</p>
            <Controller
              name="services"
              control={control}
              render={({ field }) => (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {serviceOptions.map((service) => (
                      <div key={service} className="flex items-center space-x-2">
                        <Checkbox
                          id={`service-${service}`}
                          checked={field.value.includes(service)}
                          onCheckedChange={(checked) => {
                            const newServices = checked
                              ? [...field.value, service]
                              : field.value.filter((s: string) => s !== service);
                            field.onChange(newServices);
                          }}
                        />
                        <Label htmlFor={`service-${service}`}>{service}</Label>
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
            <h3 className="text-lg font-medium text-[#005b57]">Specialties</h3>
            <p className="text-sm text-gray-600 mb-2">Select all specialties that your clinic focuses on</p>
            <Controller
              name="specialties"
              control={control}
              render={({ field }) => (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {specialtyOptions.map((specialty) => (
                      <div key={specialty} className="flex items-center space-x-2">
                        <Checkbox
                          id={`specialty-${specialty}`}
                          checked={field.value.includes(specialty)}
                          onCheckedChange={(checked) => {
                            const newSpecialties = checked
                              ? [...field.value, specialty]
                              : field.value.filter((s: string) => s !== specialty);
                            field.onChange(newSpecialties);
                          }}
                        />
                        <Label htmlFor={`specialty-${specialty}`}>{specialty}</Label>
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
            <h3 className="text-lg font-medium text-[#005b57]">Facilities</h3>
            <p className="text-sm text-gray-600 mb-2">Select all facilities available at your clinic</p>
            <Controller
              name="facilities"
              control={control}
              render={({ field }) => (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {facilityOptions.map((facility) => (
                      <div key={facility} className="flex items-center space-x-2">
                        <Checkbox
                          id={`facility-${facility}`}
                          checked={field.value.includes(facility)}
                          onCheckedChange={(checked) => {
                            const newFacilities = checked
                              ? [...field.value, facility]
                              : field.value.filter((f: string) => f !== facility);
                            field.onChange(newFacilities);
                          }}
                        />
                        <Label htmlFor={`facility-${facility}`}>{facility}</Label>
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

          {/* Equipment Available */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="equipmentAvailable">
              Equipment Available <span className="text-sm text-gray-500">(optional)</span>
            </Label>
            <Controller
              name="equipmentAvailable"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="equipmentAvailable"
                  placeholder="List any specialized equipment available at your clinic"
                  className="min-h-[80px]"
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
          </motion.div>

          {/* Operating Hours */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="operatingHours">
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
                    className="min-h-[80px]"
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

          {/* Additional Notes */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="additionalNotes">
              Additional Notes <span className="text-sm text-gray-500">(optional)</span>
            </Label>
            <Controller
              name="additionalNotes"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="additionalNotes"
                  placeholder="Any additional information about your services or facilities"
                  className="min-h-[100px]"
                  value={field.value || ''}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
          </motion.div>

          {/* Form Navigation */}
          <motion.div
            variants={itemVariants}
            className="flex justify-between items-center pt-2"
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
              Continue
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}