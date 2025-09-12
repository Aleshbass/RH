import { z } from "zod";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import OnboardingProgress from "@/components/onboarding/OnboardingProgress";

// Form schema
const clinicInfoSchema = z.object({
  clinicName: z.string().min(2, "Clinic name must be at least 2 characters"),
  registrationNumber: z.string().min(2, "Registration number is required"),
  clinicType: z.string().min(2, "Please select a clinic type"),
  address: z.string().min(5, "Please enter a valid address"),
  city: z.string().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  phoneNumber: z.string().min(10, "Please enter a valid phone number"),
  email: z.string().email("Please enter a valid email address"),
  website: z.string().refine((val) => val === "" || z.string().url().safeParse(val).success, {
    message: "Please enter a valid URL"
  }),
  yearEstablished: z.number().min(1900, "Please enter a valid year"),
});

type ClinicInfoValues = z.infer<typeof clinicInfoSchema>;

interface ClinicInfoFormProps {
  onNext: () => void;
  onBack: () => void;
}

export default function ClinicInfoForm({ onNext, onBack }: ClinicInfoFormProps) {
  const { data, updateClinicOwnerData, setActualClinicId } = useOnboardingStore();
  const { clinicOwnerData, actualClinicId } = data;

  const existingClinic = useQuery(api.clinics.getMyClinic, actualClinicId ? "skip" : undefined);
  const createClinicMutation = useMutation(api.clinics.createClinic);

  const { 
    register, 
    handleSubmit, 
    formState,
    formState: { errors }
  } = useForm<ClinicInfoValues>({
    resolver: zodResolver(clinicInfoSchema),
    defaultValues: {
      clinicName: clinicOwnerData?.clinicName || "",
      registrationNumber: clinicOwnerData?.registrationNumber || "",
      clinicType: clinicOwnerData?.clinicType || "",
      address: clinicOwnerData?.address || "",
      city: clinicOwnerData?.city || "",
      state: clinicOwnerData?.state || "",
      phoneNumber: clinicOwnerData?.clinicPhone || "", 
      email: clinicOwnerData?.clinicEmail || "",       
      website: clinicOwnerData?.website || "",
      yearEstablished: clinicOwnerData?.yearEstablished || new Date().getFullYear(),
    },
  });

  const onSubmit = async (values: ClinicInfoValues) => {
    updateClinicOwnerData({
      ...clinicOwnerData,
      clinicName: values.clinicName,
      registrationNumber: values.registrationNumber,
      clinicType: values.clinicType,
      address: values.address,
      city: values.city,
      state: values.state,
      clinicPhone: values.phoneNumber,
      clinicEmail: values.email,
      website: values.website,
      yearEstablished: values.yearEstablished,
    });

    if (actualClinicId) {
      console.log("Using existing actualClinicId from store:", actualClinicId);
      onNext();
      return;
    }
    if (existingClinic && existingClinic._id) {
      console.log("Found existing clinic in DB:", existingClinic._id);
      setActualClinicId(existingClinic._id);
      onNext();
      return;
    }

    try {
      const result = await createClinicMutation({
        name: values.clinicName,
        address: values.address,
        city: values.city,
        contactEmail: values.email,
        contactPhone: values.phoneNumber,
      });

      if (result.success && result.clinicId) {
        setActualClinicId(result.clinicId);
        onNext();
      } else {
        console.error("Clinic creation failed:", result.message);
      }
    } catch (error: unknown) {
      console.error("Failed to create clinic:", error);
    }
  };

  const fadeInVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
      },
    }),
  };

  const clinicTypes = [
    "Hospital",
    "Private Clinic",
    "Rehabilitation Center",
    "Physical Therapy Practice",
    "Community Health Center",
    "Sports Medicine Clinic",
    "Orthopedic Clinic",
    "Outpatient Center",
    "Other"
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 100 }, (_, i) => currentYear - i);

  return (
    <div className="max-w-4xl mx-auto">
      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <div className="text-center mb-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#005b57]">Clinic Information</h2>
          <p className="text-gray-600 mt-2">Tell us about your healthcare facility</p>
          <OnboardingProgress current={data.currentStep} total={4} className="mt-4" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {/* Clinic Name */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3"
          >
            <label
              htmlFor="clinicName"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Clinic Name *
            </label>
            <input
              id="clinicName"
              {...register("clinicName")}
              placeholder="Enter your clinic name"
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.clinicName ? "border-red-500" : ""
              }`}
            />
            {errors.clinicName && (
              <p className="mt-2 text-sm text-red-500">
                {errors.clinicName.message}
              </p>
            )}
          </motion.div>

          {/* Registration Number */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3"
          >
            <label
              htmlFor="registrationNumber"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Registration Number *
            </label>
            <input
              id="registrationNumber"
              placeholder="Medical licensing authority registration number"
              {...register("registrationNumber")}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.registrationNumber ? "border-red-500" : ""
              }`}
            />
            {errors.registrationNumber && (
              <p className="mt-2 text-sm text-red-500">
                {errors.registrationNumber.message}
              </p>
            )}
          </motion.div>

          {/* Clinic Type */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3"
          >
            <label
              htmlFor="clinicType"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Clinic Type *
            </label>
            <select
              id="clinicType"
              {...register("clinicType")}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.clinicType ? "border-red-500" : ""
              }`}
            >
              <option value="">Select clinic type</option>
              {clinicTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {errors.clinicType && (
              <p className="mt-2 text-sm text-red-500">
                {errors.clinicType.message}
              </p>
            )}
          </motion.div>

          {/* Year Established */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3"
          >
            <label
              htmlFor="yearEstablished"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Year Established *
            </label>
            <select
              id="yearEstablished"
              {...register("yearEstablished", {
                valueAsNumber: true
              })}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.yearEstablished ? "border-red-500" : ""
              }`}
            >
              <option value="">Select year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {errors.yearEstablished && (
              <p className="mt-2 text-sm text-red-500">
                {errors.yearEstablished.message}
              </p>
            )}
          </motion.div>

          {/* Email */}
          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3"
          >
            <label
              htmlFor="email"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Clinic Email *
            </label>
            <input
              id="email"
              type="email"
              placeholder="Enter clinic email address"
              {...register("email")}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.email ? "border-red-500" : ""
              }`}
            />
            {errors.email && (
              <p className="mt-2 text-sm text-red-500">
                {errors.email.message}
              </p>
            )}
          </motion.div>

          {/* Phone Number */}
          <motion.div
            custom={5}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3"
          >
            <label
              htmlFor="phoneNumber"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Clinic Phone Number *
            </label>
            <input
              id="phoneNumber"
              type="tel"
              placeholder="Enter clinic phone number"
              {...register("phoneNumber")}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.phoneNumber ? "border-red-500" : ""
              }`}
            />
            {errors.phoneNumber && (
              <p className="mt-2 text-sm text-red-500">
                {errors.phoneNumber.message}
              </p>
            )}
          </motion.div>

          {/* Website */}
          <motion.div
            custom={6}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3 col-span-1 md:col-span-2"
          >
            <label
              htmlFor="website"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Website <span className="text-gray-500">(Optional)</span>
            </label>
            <input
              id="website"
              type="url"
              placeholder="https://example.com"
              {...register("website")}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.website ? "border-red-500" : ""
              }`}
            />
            {errors.website && (
              <p className="mt-2 text-sm text-red-500">
                {errors.website.message}
              </p>
            )}
          </motion.div>

          {/* Address */}
          <motion.div
            custom={7}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-3 col-span-1 md:col-span-2"
          >
            <label
              htmlFor="address"
              className="block text-base font-semibold text-[#002e2c]"
            >
              Full Address *
            </label>
            <input
              id="address"
              placeholder="Enter complete clinic address"
              {...register("address")}
              className={`block w-full h-12 text-base px-4 rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 transition-colors ${
                errors.address ? "border-red-500" : ""
              }`}
            />
            {errors.address && (
              <p className="mt-2 text-sm text-red-500">
                {errors.address.message}
              </p>
            )}
          </motion.div>
        </div>
        
        {/* Location Details */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[#002e2c] mb-6">Location Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {/* City */}
            <motion.div
              custom={8}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-3"
            >
              <label
                htmlFor="city"
                className="block text-base font-semibold text-[#002e2c]"
              >
                City *
              </label>
              <input
                id="city"
                placeholder="Enter city"
                {...register("city")}
                className={`w-full h-12 text-base px-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] transition-colors ${errors.city ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.city && (
                <p className="mt-2 text-sm text-red-500">
                  {errors.city.message}
                </p>
              )}
            </motion.div>
            
            {/* State */}
            <motion.div
              custom={9}
              initial="hidden"
              animate="visible"
              variants={fadeInVariants}
              className="space-y-3"
            >
              <label
                htmlFor="state"
                className="block text-base font-semibold text-[#002e2c]"
              >
                State *
              </label>
              <input
                id="state"
                placeholder="Enter state"
                {...register("state")}
                className={`w-full h-12 text-base px-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] transition-colors ${errors.state ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.state && (
                <p className="mt-2 text-sm text-red-500">
                  {errors.state.message}
                </p>
              )}
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex justify-between mt-6 pt-4 border-t border-gray-200"
        >
          <button
            type="button"
            onClick={onBack}
            className="px-8 py-3 text-base font-medium text-[#005b57] rounded-md border-2 border-[#005b57] hover:bg-[#005b57] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 transition-all duration-200"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={formState.isSubmitting}
            className="px-8 py-3 text-base font-semibold text-white rounded-md bg-[#005b57] hover:bg-[#00443e] focus:outline-none focus:ring-2 focus:ring-[#005b57]/20 transition-all duration-200 disabled:opacity-60"
          >
            {formState.isSubmitting ? (
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                <span>Creating Clinic...</span>
              </div>
            ) : (
              "Complete Setup"
            )}
          </button>
        </motion.div>
      </form>
    </div>
  );
}
