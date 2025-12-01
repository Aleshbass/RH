import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ChevronRight, ChevronLeft } from "lucide-react";

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
    formState: { errors, isSubmitting }
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

  const inputClasses = "block w-full h-14 px-4 pt-5 pb-2 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#005b57]/20 focus:border-[#005b57] focus:bg-white transition-all duration-200 peer placeholder-transparent";
  const labelClasses = "absolute text-sm text-gray-500 duration-200 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-[#005b57]";

  return (
    <div className="w-full max-w-3xl mx-auto pb-24 sm:pb-0">
      <form className="space-y-6 sm:space-y-8" onSubmit={handleSubmit(onSubmit)}>
        <div className="text-center mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold text-[#002e2c]">Clinic Information</h2>
          <p className="text-gray-600">Tell us about your healthcare facility</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
          {/* Clinic Name */}
          <div className="space-y-1">
            <div className="relative">
              <input
                id="clinicName"
                type="text"
                placeholder="Clinic Name"
                className={`${inputClasses} ${errors.clinicName ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('clinicName')}
              />
              <label htmlFor="clinicName" className={labelClasses}>
                Clinic Name
              </label>
            </div>
            {errors.clinicName && (
              <p className="text-xs text-red-500 ml-1">{errors.clinicName.message}</p>
            )}
          </div>

          {/* Registration Number */}
          <div className="space-y-1">
            <div className="relative">
              <input
                id="registrationNumber"
                type="text"
                placeholder="Registration Number"
                className={`${inputClasses} ${errors.registrationNumber ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('registrationNumber')}
              />
              <label htmlFor="registrationNumber" className={labelClasses}>
                Registration Number
              </label>
            </div>
            {errors.registrationNumber && (
              <p className="text-xs text-red-500 ml-1">{errors.registrationNumber.message}</p>
            )}
          </div>

          {/* Clinic Type */}
          <div className="space-y-1">
            <div className="relative">
              <select
                id="clinicType"
                className={`${inputClasses} pt-4 appearance-none`}
                {...register('clinicType')}
              >
                <option value="">Select clinic type</option>
                {clinicTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <label htmlFor="clinicType" className={labelClasses}>
                Clinic Type
              </label>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {errors.clinicType && (
              <p className="text-xs text-red-500 ml-1">{errors.clinicType.message}</p>
            )}
          </div>

          {/* Year Established */}
          <div className="space-y-1">
            <div className="relative">
              <select
                id="yearEstablished"
                className={`${inputClasses} pt-4 appearance-none`}
                {...register('yearEstablished', { valueAsNumber: true })}
              >
                <option value="">Select year</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <label htmlFor="yearEstablished" className={labelClasses}>
                Year Established
              </label>
              <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {errors.yearEstablished && (
              <p className="text-xs text-red-500 ml-1">{errors.yearEstablished.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1">
            <div className="relative">
              <input
                id="email"
                type="email"
                placeholder="Clinic Email"
                className={`${inputClasses} ${errors.email ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('email')}
              />
              <label htmlFor="email" className={labelClasses}>
                Clinic Email
              </label>
            </div>
            {errors.email && (
              <p className="text-xs text-red-500 ml-1">{errors.email.message}</p>
            )}
          </div>

          {/* Phone Number */}
          <div className="space-y-1">
            <div className="relative">
              <input
                id="phoneNumber"
                type="tel"
                placeholder="Clinic Phone Number"
                className={`${inputClasses} ${errors.phoneNumber ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('phoneNumber')}
              />
              <label htmlFor="phoneNumber" className={labelClasses}>
                Clinic Phone Number
              </label>
            </div>
            {errors.phoneNumber && (
              <p className="text-xs text-red-500 ml-1">{errors.phoneNumber.message}</p>
            )}
          </div>

          {/* Website */}
          <div className="space-y-1 col-span-1 md:col-span-2">
            <div className="relative">
              <input
                id="website"
                type="url"
                placeholder="Website (Optional)"
                className={`${inputClasses} ${errors.website ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('website')}
              />
              <label htmlFor="website" className={labelClasses}>
                Website (Optional)
              </label>
            </div>
            {errors.website && (
              <p className="text-xs text-red-500 ml-1">{errors.website.message}</p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-1 col-span-1 md:col-span-2">
            <div className="relative">
              <input
                id="address"
                type="text"
                placeholder="Full Address"
                className={`${inputClasses} ${errors.address ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                {...register('address')}
              />
              <label htmlFor="address" className={labelClasses}>
                Full Address
              </label>
            </div>
            {errors.address && (
              <p className="text-xs text-red-500 ml-1">{errors.address.message}</p>
            )}
          </div>
        </div>

        {/* Location Details */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[#002e2c] mb-6">Location Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
            {/* City */}
            <div className="space-y-1">
              <div className="relative">
                <input
                  id="city"
                  type="text"
                  placeholder="City"
                  className={`${inputClasses} ${errors.city ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                  {...register('city')}
                />
                <label htmlFor="city" className={labelClasses}>
                  City
                </label>
              </div>
              {errors.city && (
                <p className="text-xs text-red-500 ml-1">{errors.city.message}</p>
              )}
            </div>

            {/* State */}
            <div className="space-y-1">
              <div className="relative">
                <input
                  id="state"
                  type="text"
                  placeholder="State"
                  className={`${inputClasses} ${errors.state ? "border-red-300 focus:border-red-500 focus:ring-red-200" : ""}`}
                  {...register('state')}
                />
                <label htmlFor="state" className={labelClasses}>
                  State
                </label>
              </div>
              {errors.state && (
                <p className="text-xs text-red-500 ml-1">{errors.state.message}</p>
              )}
            </div>
          </div>
        </div>

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
                <>
                  Creating Clinic...
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </>
              ) : (
                <>
                  Complete Setup
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
