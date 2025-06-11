'use client';

import { motion } from 'framer-motion';
import { useForm } from '@tanstack/react-form';
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

// Removed unused type definition - ServicesAndFacilitiesData

interface ServicesAndFacilitiesFormProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ServicesAndFacilitiesForm({ onNext, onBack }: ServicesAndFacilitiesFormProps) {
  const { data, updateClinicOwnerData } = useOnboardingStore();
  
  const form = useForm({
    defaultValues: {
      services: data.clinicOwnerData?.services || [],
      specialties: data.clinicOwnerData?.specialties || [],
      facilities: data.clinicOwnerData?.facilities || [],
      equipmentAvailable: data.clinicOwnerData?.equipmentAvailable || '',
      operatingHours: data.clinicOwnerData?.operatingHours || '',
      additionalNotes: data.clinicOwnerData?.additionalNotes || '',
    },
    onSubmit: async ({ value }) => {
      // Validate the form data against the schema
      const result = servicesAndFacilitiesSchema.safeParse(value);
      if (!result.success) {
        // Handle validation errors
        console.error('Form validation failed:', result.error);
        return;
      }
      
      // Update store with form values
      updateClinicOwnerData({
        ...data.clinicOwnerData,
        services: result.data.services,
        specialties: result.data.specialties,
        facilities: result.data.facilities,
        equipmentAvailable: result.data.equipmentAvailable,
        operatingHours: result.data.operatingHours,
        additionalNotes: result.data.additionalNotes,
      });
      onNext();
    },
  });

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
          <h2 className="text-2xl font-bold text-[#005b57] mb-1">Services & Facilities</h2>
          <p className="text-[#002e2c] mb-6">
            Tell us about the services and facilities your clinic offers
          </p>
        </motion.div>

        <form onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }} className="space-y-8">
          {/* Services Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h3 className="text-lg font-medium text-[#005b57]">Services Offered</h3>
            <p className="text-sm text-gray-600 mb-2">Select all services that your clinic offers</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <form.Field
                name="services"
              >
                {(field) => (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {serviceOptions.map((service) => (
                        <div key={service} className="flex items-center space-x-2">
                          <Checkbox
                            id={`service-${service}`}
                            checked={field.state.value.includes(service)}
                            onCheckedChange={(checked) => {
                              const newServices = checked
                                ? [...field.state.value, service]
                                : field.state.value.filter((s: string) => s !== service);
                              field.handleChange(newServices);
                            }}
                            onBlur={field.handleBlur}
                          />
                          <Label htmlFor={`service-${service}`}>{service}</Label>
                        </div>
                      ))}
                    </div>
                    {field.state.meta.errors?.length > 0 && (
                      <p className="text-red-500 text-sm mt-1">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </>
                )}
              </form.Field>
            </div>
          </motion.div>

          {/* Specialties Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h3 className="text-lg font-medium text-[#005b57]">Specialties</h3>
            <p className="text-sm text-gray-600 mb-2">Select all specialties that your clinic focuses on</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <form.Field
                name="specialties"
              >
                {(field) => (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {specialtyOptions.map((specialty) => (
                        <div key={specialty} className="flex items-center space-x-2">
                          <Checkbox
                            id={`specialty-${specialty}`}
                            checked={field.state.value.includes(specialty)}
                            onCheckedChange={(checked) => {
                              const newSpecialties = checked
                                ? [...field.state.value, specialty]
                                : field.state.value.filter((s: string) => s !== specialty);
                              field.handleChange(newSpecialties);
                            }}
                            onBlur={field.handleBlur}
                          />
                          <Label htmlFor={`specialty-${specialty}`}>{specialty}</Label>
                        </div>
                      ))}
                    </div>
                    {field.state.meta.errors?.length > 0 && (
                      <p className="text-red-500 text-sm mt-1">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </>
                )}
              </form.Field>
            </div>
          </motion.div>

          {/* Facilities Section */}
          <motion.div variants={itemVariants} className="space-y-4">
            <h3 className="text-lg font-medium text-[#005b57]">Facilities</h3>
            <p className="text-sm text-gray-600 mb-2">Select all facilities available at your clinic</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <form.Field
                name="facilities"
              >
                {(field) => (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {facilityOptions.map((facility) => (
                        <div key={facility} className="flex items-center space-x-2">
                          <Checkbox
                            id={`facility-${facility}`}
                            checked={field.state.value.includes(facility)}
                            onCheckedChange={(checked) => {
                              const newFacilities = checked
                                ? [...field.state.value, facility]
                                : field.state.value.filter((f: string) => f !== facility);
                              field.handleChange(newFacilities);
                            }}
                            onBlur={field.handleBlur}
                          />
                          <Label htmlFor={`facility-${facility}`}>{facility}</Label>
                        </div>
                      ))}
                    </div>
                    {field.state.meta.errors?.length > 0 && (
                      <p className="text-red-500 text-sm mt-1">
                        {field.state.meta.errors[0]}
                      </p>
                    )}
                  </>
                )}
              </form.Field>
            </div>
          </motion.div>

          {/* Equipment Available */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="equipmentAvailable">
              Equipment Available <span className="text-sm text-gray-500">(optional)</span>
            </Label>
            <form.Field
              name="equipmentAvailable"
            >
              {(field) => (
                <Textarea
                  id="equipmentAvailable"
                  placeholder="List any specialized equipment available at your clinic"
                  className="min-h-[80px]"
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
          </motion.div>

          {/* Operating Hours */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="operatingHours">
              Operating Hours <span className="text-red-500">*</span>
            </Label>
            <form.Field
              name="operatingHours"
            >
              {(field) => (
                <>
                  <Textarea
                    id="operatingHours"
                    placeholder="Specify your clinic's operating hours (e.g., Mon-Fri: 9AM-6PM, Sat: 9AM-2PM, Sun: Closed)"
                    className="min-h-[80px]"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                  {field.state.meta.errors?.length > 0 && (
                    <p className="text-red-500 text-sm mt-1">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </>
              )}
            </form.Field>
          </motion.div>

          {/* Additional Notes */}
          <motion.div variants={itemVariants} className="space-y-2">
            <Label htmlFor="additionalNotes">
              Additional Notes <span className="text-sm text-gray-500">(optional)</span>
            </Label>
            <form.Field
              name="additionalNotes"
            >
              {(field) => (
                <Textarea
                  id="additionalNotes"
                  placeholder="Any additional information about your services or facilities"
                  className="min-h-[100px]"
                  value={field.state.value || ''}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
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
              Continue
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
}