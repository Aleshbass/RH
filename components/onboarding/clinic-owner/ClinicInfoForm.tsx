import { z } from "zod";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

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


  // For Convex, the skip option should be either the string "skip" or undefined
  // Remove all the commented code and multiple declarations
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
  
  // const isMutationLoading = createClinicMutation.isLoading; // Get loading state from mutation

  const onSubmit = async (values: ClinicInfoValues) => {

    // Update local store with form data (can be done before or after mutation)
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

    // Idempotency Check: If we already have an actualClinicId from the store, 
    // or if getMyClinic found an existing clinic, use that and don't create a new one.
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
        // Consider setting a user-facing error message in the UI here
      }
    } catch (error: unknown) {
      console.error("Failed to create clinic:", error);
      // Consider setting a user-facing error message in the UI here
    } finally {
      // Any cleanup if needed
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
        ease: "easeOut",
      },
    }),
  };

  // Clinic type options
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

  // Generate year options for the year established dropdown
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 100 }, (_, i) => currentYear - i);

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[#002e2c]">
          Clinic Information
        </h2>
        <p className="text-[#005b57]">
          Tell us about your healthcare facility
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {/* Clinic Name */}
        <motion.div
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeInVariants}
          className="space-y-2"
        >
          <label
            htmlFor="clinicName"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Clinic Name *
          </label>
          <input
            id="clinicName"
            {...register("clinicName")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
              errors.clinicName ? "border-red-500" : ""
            }`}
          />
          {errors.clinicName && (
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2"
        >
          <label
            htmlFor="registrationNumber"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Registration Number *
          </label>
          <input
            id="registrationNumber"
            placeholder="Medical licensing authority registration number"
            {...register("registrationNumber")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
              errors.registrationNumber ? "border-red-500" : ""
            }`}
          />
          {errors.registrationNumber && (
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2"
        >
          <label
            htmlFor="clinicType"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Clinic Type *
          </label>
          <select
            id="clinicType"
            {...register("clinicType")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
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
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2"
        >
          <label
            htmlFor="yearEstablished"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Year Established *
          </label>
          <select
            id="yearEstablished"
            {...register("yearEstablished", {
              valueAsNumber: true
            })}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
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
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2"
        >
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Email *
          </label>
          <input
            id="email"
            type="email"
            {...register("email")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
              errors.email ? "border-red-500" : ""
            }`}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2"
        >
          <label
            htmlFor="phoneNumber"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Phone Number *
          </label>
          <input
            id="phoneNumber"
            type="tel"
            {...register("phoneNumber")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
              errors.phoneNumber ? "border-red-500" : ""
            }`}
          />
          {errors.phoneNumber && (
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2"
        >
          <label
            htmlFor="website"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Website (optional)
          </label>
          <input
            id="website"
            type="url"
            placeholder="https://example.com"
            {...register("website")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
              errors.website ? "border-red-500" : ""
            }`}
          />
          {errors.website && (
            <p className="mt-1 text-sm text-red-500">
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
          className="space-y-2 col-span-1 md:col-span-2"
        >
          <label
            htmlFor="address"
            className="block text-sm font-medium text-[#002e2c]"
          >
            Address *
          </label>
          <input
            id="address"
            {...register("address")}
            className={`block w-full rounded-md border-[#E3DFD2] shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 ${
              errors.address ? "border-red-500" : ""
            }`}
          />
          {errors.address && (
            <p className="mt-1 text-sm text-red-500">
              {errors.address.message}
            </p>
          )}
        </motion.div>
      </div>
      
      {/* Location Details */}
      <div className="mt-6">
        <h3 className="text-md font-medium text-[#002e2c] mb-4">Location Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* City */}
          <motion.div
            custom={8}
            initial="hidden"
            animate="visible"
            variants={fadeInVariants}
            className="space-y-2"
          >
            <label
              htmlFor="city"
              className="block text-sm font-medium text-[#002e2c]"
            >
              City *
            </label>
            <input
              id="city"
              {...register("city")}
              className={`w-full p-2 border ${errors.city ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57] focus:ring-opacity-50`}
            />
            {errors.city && (
              <p className="text-red-500">
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
            className="space-y-2"
          >
            <label
              htmlFor="state"
              className="block text-sm font-medium text-[#002e2c]"
            >
              State *
            </label>
            <input
              id="state"
              {...register("state")}
              className={`w-full p-2 border ${errors.state ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57] focus:ring-opacity-50`}
            />
            {errors.state && (
              <p className="text-red-500">
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
        className="flex justify-between mt-8"
      >
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 text-[#005b57] font-medium rounded-md border border-[#005b57] hover:bg-[#f1ffe9] focus:outline-none focus:ring-2 focus:ring-[#00cd0f] focus:ring-offset-2 transition-all"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={formState.isSubmitting}
          className="px-6 py-2.5 text-white font-medium rounded-md bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#00cd0f] focus:ring-offset-2 transition-all disabled:opacity-60"
        >
          {formState.isSubmitting ? (
            <div className="flex items-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              <span>Saving...</span>
            </div>
          ) : (
            "Continue"
          )}
        </button>
      </motion.div>
    </form>
  );
}